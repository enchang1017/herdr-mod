import { fileDiff } from "./ranges.js";
import { fileSpec } from "./session-git.js";
import { hash } from "./store.js";

export const FILE_LIMIT = 6000;
export const TOTAL_LIMIT = 60000;
const MAX_FILES = 150;
const HEAD_LIMIT = 40;
const NOISE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|packages\.lock\.json|[^/]+\.lock)$|\.(min\.js|map|snap|svg|png|jpg|ico)$/i;
const SECRET = /(^|\/)\.env(\.|$)|\.(pem|key|pfx|p12)$|(^|\/)secrets?\./i;

export function sessionSources(tab) {
  return tab.loaded().filter((r) => r.files.length).map((r) => ({
    repo: r.repo, name: tab.name(r.repo), group: r.group, subjects: r.commitList.map((c) => c.subject),
    files: r.files.map((f) => ({ ...f, spec: fileSpec(r, f) })).filter((f) => f.spec),
  }));
}

export function radarSource(app, path, data) {
  const info = app.radar.info[path];
  const from = data.forkPoint ?? data.local?.from ?? null;
  const all = [...data.work, ...(data.local?.files ?? []), ...(data.pushed?.files ?? [])];
  const files = [...new Map(all.map((f) => [f.path, f])).values()].map((f) => ({
    ...f, spec: f.untracked ? { path: f.path, untracked: true } : from ? { path: f.path, from } : { path: f.path, head: Boolean(info?.oid) },
  }));
  const subjects = [...(data.local?.commits ?? []), ...(data.pushed?.commits ?? [])].map((c) => c.subject);
  return [{ repo: path, name: app.radar.name(path), group: "REPO", subjects, files }];
}

function labelHunks(lines) {
  let n = 0;
  const out = lines.map((line) => (line.startsWith("@@") ? `[h${++n}] ${line}` : line));
  return { text: out.join("\n"), hunks: n, heads: out.filter((l) => l.startsWith("[h")) };
}

function skipReason(file) {
  if (SECRET.test(file.path)) return "secret-like file, content not sent";
  if (NOISE.test(file.path)) return "lock, generated or image file, content not sent";
  if (file.binary) return "binary";
  return null;
}

async function fileEntry(source, file, on) {
  const base = { repo: source.name, path: file.path, status: file.untracked ? "A" : file.status, add: file.add ?? 0, del: file.del ?? 0 };
  const skip = skipReason(file);
  if (skip) return { ...base, hunks: 0, text: "", note: skip };
  const lines = await fileDiff(source.repo, file.spec, on).catch((e) => [`(diff failed: ${e.message ?? e})`]);
  const labeled = labelHunks(lines);
  return { ...base, hunks: labeled.hunks, text: labeled.text, heads: labeled.heads, raw: lines.join("\n") };
}

export async function collectFiles(sources, on) {
  const pairs = sources.flatMap((s) => s.files.map((f) => [s, f])).slice(0, MAX_FILES);
  const out = [];
  for (const [source, file] of pairs) out.push({ ...(await fileEntry(source, file, on)), full: source.repo });
  const dropped = sources.reduce((n, s) => n + s.files.length, 0) - pairs.length;
  return { files: out, dropped };
}

function fileBlock(f, budget) {
  const head = `### ${f.repo} :: ${f.path} (${f.status}, +${f.add} -${f.del}, ${f.hunks} hunks)`;
  if (f.note) return { text: `${head}\n(${f.note})`, used: 0 };
  if (f.text.length <= Math.min(FILE_LIMIT, budget)) return { text: `${head}\n${f.text}`, used: f.text.length };
  const heads = f.heads.slice(0, HEAD_LIMIT).join("\n");
  return { text: `${head}\n(oversized: only hunk headers sent)\n${heads}`, used: heads.length };
}

function sourceLines(sources) {
  return sources.map((s) => [`- ${s.name} [${s.group}]`, ...s.subjects.slice(0, 15).map((x) => `  commit: ${x}`)].join("\n")).join("\n");
}

export function buildWalkPrompt(sources, collected) {
  let budget = TOTAL_LIMIT;
  const blocks = collected.files.map((f) => {
    const block = fileBlock(f, budget);
    budget -= block.used;
    return block.text;
  });
  const dropped = collected.dropped ? `\n(${collected.dropped} more files not listed)` : "";
  return [`Repos:\n${sourceLines(sources)}`, `<diff>\n${blocks.join("\n\n")}${dropped}\n</diff>`].join("\n\n");
}

export function walkKey(collected) {
  const body = collected.files.map((f) => `${f.full}\0${f.path}\0${f.raw ?? f.note ?? ""}`).join("\x1e");
  return hash(`v1|walk|${body}`);
}

export async function walkInput(sources, on) {
  const collected = await collectFiles(sources, on);
  if (!collected.files.length) throw new Error("Nothing to walk through: no file diff in this scope");
  return { key: walkKey(collected), prompt: buildWalkPrompt(sources, collected), files: collected.files };
}
