import { exec, appHome, home, focused, panes } from "herdr";
import { claudeSession } from "./target.js";
import { workspaceRootPath, repoGroups } from "./settings.js";
import { placeSessions } from "./session-herdr.js";

const RECENT = 20;
const SID = /^[\w-]+$/;

const scriptPath = (name) => `${appHome()}/mods/change-radar/${name}`;
const projectsDir = () => `${home()}/.claude/projects`;
const cachePath = () => `${appHome()}/data/change-radar/session-scan-cache.json`;

export const encodeProject = (path) => path.replace(/[^A-Za-z0-9]/g, "-");

async function runScript(name, args) {
  let r;
  try {
    r = await exec("python3", ["-I", scriptPath(name), ...args], { cwd: home() });
  } catch (e) {
    throw new Error(`Could not run python3 (${e.message ?? e}). Is it installed and on PATH?`);
  }
  if (r.code !== 0) throw new Error(`${name} exited ${r.code}: ${(r.stderr || r.stdout).trim().split("\n").pop() || "no output"}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error(`${name} gave no JSON: ${r.stdout.trim().slice(0, 200)}`);
  }
}

export async function listSessions() {
  const out = await runScript("session-list.py", ["list", projectsDir(), `${home()}/.claude/sessions`, encodeProject(workspaceRootPath()), String(RECENT)]);
  const live = (out.live ?? []).map((s) => ({ sessionId: s.sessionId, pid: s.pid, name: s.name || null, title: s.title || null, command: s.command || null, cwd: s.cwd, at: s.updatedAt ?? null, live: true, status: s.status ?? null }));
  const seen = new Set(live.map((s) => s.sessionId));
  const recent = (out.recent ?? []).filter((s) => !seen.has(s.sessionId))
    .map((s) => ({ sessionId: s.sessionId, name: null, title: s.title || null, command: s.command || null, cwd: s.cwd, at: Math.round((s.mtime ?? 0) * 1000), live: false }));
  return placeSessions([...live, ...recent]);
}

export async function scanSession(sessionId) {
  if (!SID.test(sessionId ?? "")) throw new Error(`Not a session id: ${sessionId}`);
  return runScript("session-scan.py", ["scan", projectsDir(), sessionId, cachePath(), JSON.stringify(repoGroups())]);
}

function focusedTerminal() {
  const f = focused();
  if (f?.terminal) return f.terminal;
  return panes().find((p) => p.pane === f?.pane)?.terminal ?? null;
}

export async function focusedSession() {
  const address = focusedTerminal();
  if (!address || address.includes("/")) return null;
  const session = await claudeSession(address).catch(() => null);
  return typeof session?.sessionId === "string" && SID.test(session.sessionId) ? session : null;
}

export function sessionLabel(s) {
  if (!s) return "No session";
  return s.label || s.name || s.title || s.sessionId.slice(0, 8);
}
