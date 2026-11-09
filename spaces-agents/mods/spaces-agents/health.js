import { appHome, exec, notify, readTextFile, writeTextFile } from "herdr";
import { registryDir } from "./registry.js";

const CLONES = [{ clone: "picker-plus", builtin: "picker" }, { clone: "spaces-agents", builtin: "spaces" }];
const RECHECK_MS = 60000;
const SKIP = ["gpui-kit.d.ts", "jsconfig.json", ".*"];
const FIND = `find . -type f ${SKIP.map((n) => `! -name '${n}'`).join(" ")}`;
const HASH = `cd "$1" && ${FIND} | LC_ALL=C sort | while IFS= read -r f; do shasum -a 256 "$f"; done | shasum -a 256 | cut -d' ' -f1`;
const RSYNC = `rsync -a --delete ${SKIP.map((n) => `--exclude '${n}'`).join(" ")}`;

const message = (e) => String(e?.message ?? e);
const modDir = (name) => `${appHome()}/mods/${name}`;
const snapshotDir = (builtin) => `${registryDir()}/upstream/${builtin}`;
const upstreamPath = () => `${registryDir()}/upstream.json`;
const hashCommand = (builtin) => `sh -c '${HASH.replace(/'/g, "'\\''")}' sh ${modDir(builtin)}`;

function parseUpstream(text) {
  try {
    const data = JSON.parse(text ?? "");
    return data && typeof data.mods === "object" && data.mods ? data : { version: 1, mods: {} };
  } catch {
    return { version: 1, mods: {} };
  }
}

async function shell(script, args) {
  const ran = await exec("sh", ["-c", script, "sh", ...args]);
  if (ran.code !== 0) throw new Error((ran.stderr || ran.stdout).trim() || `exit ${ran.code}`);
  return ran.stdout.trim();
}

async function isInstalled(name) {
  const ran = await exec("test", ["-d", modDir(name)]).catch(() => null);
  return ran?.code === 0;
}

async function installedClones() {
  const found = await Promise.all(CLONES.map(async (pair) => ((await isInstalled(pair.clone)) && (await isInstalled(pair.builtin)) ? pair : null)));
  return found.filter(Boolean);
}

async function checkMod(clone) {
  const ran = await exec("herdr-app", ["check", modDir(clone)]);
  if (ran.code === 0) return null;
  const error = (ran.stderr || ran.stdout || `exit ${ran.code}`).trim();
  return { key: `check:${clone}`, text: `${clone}: herdr-app check failed: ${error}`, title: `${clone} fails herdr-app check`, prompt: checkPrompt(clone, error), level: "error" };
}

function checkPrompt(clone, error) {
  return [
    `herdr-app check fails for the Herdr mod ${modDir(clone)}:`,
    error,
    `Read ${appHome()}/AGENTS.md, find the API change, fix ${clone}, run \`herdr-app check ${modDir(clone)}\` until it passes, and report what changed. Touch nothing else.`,
  ].join("\n\n");
}

function updatePrompt({ clone, builtin }) {
  return [
    `The built-in Herdr mod "${builtin}" changed since our clone "${clone}" was based on it. Read ${appHome()}/AGENTS.md first.`,
    `Old base (snapshot): ${snapshotDir(builtin)}\nNew built-in: ${modDir(builtin)}\nClone: ${modDir(clone)}`,
    `Three-way merge: apply the built-in's changes (old base -> new built-in) into the clone while keeping our changes (old base -> clone, which live in extras.js and the other added files). Run \`herdr-app check ${modDir(clone)}\` until it passes and report what was merged.`,
    `Only after the check passes, update the snapshot to the new built-in with \`${RSYNC} ${modDir(builtin)}/ ${snapshotDir(builtin)}/\` and set mods.${builtin}.sha256 in ${upstreamPath()} to the output of \`${hashCommand(builtin)}\`. Touch nothing else.`,
  ].join("\n\n");
}

function updateProblem(pair) {
  return { key: `update:${pair.builtin}`, text: `${pair.clone}: the built-in ${pair.builtin} changed (update available)`, title: `Update available for ${pair.clone}`, prompt: updatePrompt(pair), level: "warning" };
}

async function upstreamProblems(clones) {
  const text = await readTextFile(upstreamPath());
  const data = parseUpstream(text);
  let mods = data.mods;
  const problems = [];
  for (const pair of clones) {
    const sha256 = await shell(HASH, [modDir(pair.builtin)]);
    const known = mods[pair.builtin];
    if (known && known.sha256 !== sha256) problems.push(updateProblem(pair));
    if (known) continue;
    await shell(`mkdir -p "$2" && ${RSYNC} "$1/" "$2/"`, [modDir(pair.builtin), snapshotDir(pair.builtin)]);
    mods = { ...mods, [pair.builtin]: { clone: pair.clone, sha256, recordedAt: new Date().toISOString() } };
  }
  if (mods !== data.mods) await writeTextFile(upstreamPath(), `${JSON.stringify({ ...data, version: 1, mods }, null, 2)}\n`, text);
  return problems;
}

function fixAction(problem) {
  return { name: "tab.new", args: { name: "fix with claude", folder: appHome(), argv: ["claude", problem.prompt] } };
}

export class HealthCheck {
  constructor() {
    this.problems = [];
    this.told = new Set();
    this.error = null;
    this.running = false;
  }

  start(cx) {
    this.run(cx);
    cx.timer.every(RECHECK_MS, (cx) => { if (this.problems.length || this.error) this.run(cx); });
  }

  run(cx) {
    if (this.running) return;
    this.running = true;
    cx.spawn(async (cx) => {
      try {
        const clones = await installedClones();
        const checks = [];
        for (const { clone } of clones) checks.push(await checkMod(clone));
        this.problems = [...checks.filter(Boolean), ...(await upstreamProblems(clones))];
        this.error = this.problems.length ? this.problems.map((p) => p.text).join("\n") : null;
        this.announce();
      } catch (e) {
        this.error = `Startup health check failed: ${message(e)}`;
      } finally {
        this.running = false;
      }
      cx.notify();
    });
  }

  announce() {
    const fresh = this.problems.filter((p) => !this.told.has(p.key));
    this.told = new Set(this.problems.map((p) => p.key));
    fresh.forEach((p) => notify({ title: p.title, body: "Click to Fix with Claude (opens a new tab)", level: p.level, timeout: 20000, action: fixAction(p) }));
  }
}
