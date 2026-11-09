import * as fs from "fs/promises";
import { exec, home } from "herdr";
import { encodeProject } from "./session-data.js";

const sessionsDir = () => `${home()}/.claude/sessions`;
const projectsDir = () => `${home()}/.claude/projects`;

function liveOf(text) {
  try {
    const data = JSON.parse(text ?? "");
    if (typeof data?.sessionId !== "string") return null;
    return { sessionId: data.sessionId, pid: data.pid ?? null, name: data.name ?? null, cwd: typeof data.cwd === "string" ? data.cwd : "" };
  } catch {
    return null;
  }
}

async function liveSessions() {
  const names = (await fs.readdir(sessionsDir())).filter((n) => n.endsWith(".json")).sort();
  const texts = await Promise.all(names.map((n) => fs.readFile(`${sessionsDir()}/${n}`, "utf8").catch(() => null)));
  return texts.map(liveOf).filter(Boolean);
}

function sessionPaths(s) {
  if (!s.cwd) return [];
  const dir = `${projectsDir()}/${encodeProject(s.cwd)}`;
  return [`${dir}/${s.sessionId}.jsonl`, `${dir}/${s.sessionId}`];
}

async function statLines(paths) {
  if (!paths.length) return [];
  const r = await exec("find", [...paths, "-name", "*.jsonl", "-exec", "stat", "-f", "%z %m %N", "{}", "+"]);
  return r.stdout.split("\n").filter(Boolean).sort();
}

export async function probeSessions(extra) {
  const live = await liveSessions();
  const known = new Set(live.map((s) => s.sessionId));
  const all = [...live, ...extra.filter((e) => !known.has(e.sessionId))];
  const lines = await statLines(all.flatMap(sessionPaths));
  const sigs = Object.fromEntries(all.map((s) => [s.sessionId, lines.filter((l) => l.includes(`/${s.sessionId}`)).join("\n")]));
  const key = JSON.stringify([live.map((s) => [s.sessionId, s.pid, s.name]), extra.map((e) => e.sessionId), lines]);
  return { key, sigs };
}
