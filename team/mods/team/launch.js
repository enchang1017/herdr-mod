import { exec, home, spaces, panes, focused, openOverlay, run } from "herdr";
import { agentName, launchTemplate, nameTab, teamTabId } from "./agents.js";
import { baseName } from "./data.js";

const WAIT_MS = 300;
const WAIT_TRIES = 60;
const SLUG_WORDS = 4;

const pad = (n) => String(n).padStart(2, "0");
const branchSlug = (branch) => branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

function stamp(date) {
  return `${pad(date.getFullYear() % 100)}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function taskSlug(task) {
  const words = task.toLowerCase().replace(/\/\S+/g, " ").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  return words.slice(0, SLUG_WORDS).join("-") || "task";
}

export function defaultBranch(template, task) {
  return `agent/${template}-${taskSlug(task)}-${stamp(new Date())}`;
}

function focusedSpace() {
  const f = focused();
  return spaces().find((one) => one.id === f?.space) ?? spaces().find((one) => one.active) ?? null;
}

export async function spaceOn(machine, folder, cx) {
  const focusedOne = focusedSpace();
  if ((focusedOne?.machine ?? null) === machine) return focusedOne;
  const existing = spaces().find((one) => one.machine === machine);
  if (existing) return existing;
  const known = new Set(spaces().map((one) => one.id));
  run("space.new", { machine, folder });
  for (let attempt = 0; attempt < WAIT_TRIES; attempt += 1) {
    const made = spaces().find((one) => one.machine === machine && !known.has(one.id));
    if (made) return made;
    await cx.sleep(WAIT_MS);
  }
  throw new Error(`No space appeared on ${machine}`);
}

export async function launchInTeamTab(form, cx) {
  const machine = form.machine ?? null;
  const space = machine ? await spaceOn(machine, form.repo, cx) : focusedSpace();
  if (!space) throw new Error("No space is focused to hold the team tab.");
  const tab = teamTabId(space.id);
  const name = agentName(`${form.plain ? "claude" : form.template}-${baseName(form.repo)}`);
  cx.spawn(async (cx) => nameTab(space.id, tab, cx));
  const result = await launchTemplate({ template: form.plain ? "claude" : form.template, plain: form.plain, team: form.plain ? "claude" : form.template, name, cwd: form.repo, repo: form.repo, space: space.id, tab, task: form.task, on: machine });
  return { ...result, where: `the team tab${machine ? ` on ${machine}` : ""}` };
}

async function mainCheckout(repo) {
  const r = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: repo });
  if (r.code !== 0) throw new Error(`${repo} is not a git repository: ${(r.stderr || "").trim()}`);
  const common = r.stdout.trim();
  return common.endsWith("/.git") ? common.slice(0, -5) : common;
}

async function branchExists(repo, branch) {
  const r = await exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repo });
  return r.code === 0;
}

function spaceAt(path) {
  return spaces().find((space) => {
    if (space.machine) return false;
    const tabs = new Set(space.tabs.map((tab) => tab.id));
    const cwd = panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd ?? space.folder;
    return (cwd ?? "").replace(/\/+$/, "") === path;
  }) ?? null;
}

async function waitForSpace(path, cx) {
  for (let attempt = 0; attempt < WAIT_TRIES; attempt += 1) {
    const space = spaceAt(path);
    if (space?.tabs.length) return space;
    await cx.sleep(WAIT_MS);
  }
  return null;
}

export async function launchInWorktree(form, cx) {
  const branch = form.branch.trim();
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.startsWith("-") || branch.includes("..")) throw new Error(`Not a usable branch name: ${branch}`);
  if (await branchExists(form.repo, branch)) throw new Error(`Branch ${branch} already exists: pick a new name`);
  const main = await mainCheckout(form.repo);
  const path = `${home()}/.herdr/worktrees/${baseName(main)}/${branchSlug(branch)}`;
  openOverlay({ mod: "worktree", kind: "dialog", width: 460, height: 180, props: { folder: form.repo, branch, tab: "team" } });
  const space = await waitForSpace(path, cx);
  if (!space) throw new Error(`The worktree space for ${path} did not appear (see the worktree dialog for git's error).`);
  const name = agentName(`${form.template}-${baseName(main)}-wt`);
  const result = await launchTemplate({ template: form.template, team: form.template, name, cwd: path, repo: path, space: space.id, tab: space.tabs[0].id, task: form.task.split(form.repo).join(path), on: null });
  return { ...result, where: `worktree ${branch}`, worktree: { path, branch, space: space.id, source: form.repo } };
}
