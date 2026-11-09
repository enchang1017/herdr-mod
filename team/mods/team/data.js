import { hc, exec, home, shared, readTextFile, spaces, focused, panes } from "herdr";
import { machineHome } from "./agents.js";
import { loadSettings, workspaceRootPath } from "./settings.js";

const REPOS_KEY = "change-radar.repos";
const SESSION_WORDS = { busy: "working", idle: "idle", waiting: "waiting" };

export const TASKS = {
  reviewer: (repo) => `Review the uncommitted and unpushed changes in ${repo}`,
  tester: (repo) => `Write the tests the current changes in ${repo} need`,
};

export function defaultTask(template, repo) {
  const make = TASKS[template];
  return make ? make(repo) : `Work in ${repo}: `;
}

export async function loadTemplates() {
  const ran = await hc(["templates", "--json"]);
  if (ran.code !== 0) throw new Error((ran.stderr || ran.stdout).trim() || `hc templates exited ${ran.code}`);
  const list = JSON.parse(ran.stdout).templates;
  if (!Array.isArray(list)) throw new Error("hc templates returned no list");
  return list.filter((one) => typeof one?.name === "string").map((one) => ({ name: one.name, description: one.description ?? "", command: one.command ?? "" }));
}

function focusedRoot() {
  const f = focused();
  const space = spaces().find((one) => one.id === f?.space) ?? spaces().find((one) => one.active);
  if (!space || space.machine) return null;
  const tabs = new Set(space.tabs.map((tab) => tab.id));
  const cwd = (panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || space.folder || "").replace(/\/+$/, "");
  return cwd && cwd !== home() ? cwd : null;
}

async function findRepos(root) {
  const r = await exec("find", [root, "-maxdepth", "3", "-name", ".git", "-prune", "-print"]);
  const repos = r.stdout.split("\n").filter(Boolean).map((p) => p.replace(/\/\.git$/, "")).sort();
  if (r.code !== 0 && !repos.length) throw new Error(`Cannot list ${root}: ${(r.stderr || "").trim().split("\n")[0]}`);
  return repos;
}

export async function loadRepos() {
  const saved = shared(REPOS_KEY);
  if (saved && Array.isArray(saved.repos) && saved.repos.length) return { root: saved.root, repos: saved.repos, source: "Git panel" };
  await loadSettings();
  const fallback = workspaceRootPath();
  const root = focusedRoot() ?? fallback;
  return { root, repos: await findRepos(root), source: root === fallback ? "workspace root" : "focused space" };
}

async function foregroundPid(address) {
  const ran = await hc(["get", address, "--json"]);
  if (ran.code !== 0) return null;
  try {
    return JSON.parse(ran.stdout).foreground?.pid ?? null;
  } catch {
    return null;
  }
}

export async function sessionStatus(address) {
  const pid = await foregroundPid(address);
  if (!pid) return null;
  const on = address.includes("/") ? address.split("/")[0] : null;
  const base = await machineHome(on).catch(() => null);
  const text = base ? await readTextFile(`${base}/.claude/sessions/${pid}.json`, { on }).catch(() => null) : null;
  if (!text) return null;
  try {
    const status = JSON.parse(text).status;
    return SESSION_WORDS[status] ?? (typeof status === "string" ? status : null);
  } catch {
    return null;
  }
}

export async function readScreen(address) {
  const ran = await hc(["read", address, "--lines", "80"]);
  if (ran.code !== 0) throw new Error((ran.stderr || ran.stdout).trim() || `hc read exited ${ran.code}`);
  return ran.stdout;
}

export async function killTerminal(address, cx) {
  const killed = await hc(["kill", address]);
  if (killed.code !== 0) throw new Error((killed.stderr || killed.stdout).trim() || `hc kill exited ${killed.code}`);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const removed = await hc(["rm", address]);
    if (removed.code === 0) return;
    await cx.sleep(300);
  }
  throw new Error(`${address} was killed but could not be removed`);
}

export const baseName = (path) => String(path).replace(/\/+$/, "").split("/").pop() || String(path);
