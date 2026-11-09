import { readTextFile } from "herdr";
import { git, gitOk, parseNumstat, letter } from "./git.js";

const DIFF = ["--no-ext-diff", "--no-textconv", "--no-color"];
const MAX_LINES = 2000;
const MAX_LINE = 2000;
const REF = /^[A-Za-z0-9._\/@{}~^+-]+$/;

export async function mergeBase(repo, a, b, on) {
  return (await gitOk(repo, ["merge-base", a, b], on)).trim();
}

export async function commits(repo, from, to, on, limit = 200) {
  const range = from ? `${from}..${to}` : to;
  const out = await gitOk(repo, ["log", `-n${limit}`, "--format=%H%x1f%h%x1f%s%x1f%an%x1f%ct%x1e", range], on);
  return out.split("\x1e").map((r) => r.trim()).filter(Boolean).map((r) => {
    const [sha, short, subject, author, ct] = r.split("\x1f");
    return { sha, short, subject, author, at: (Number(ct) || 0) * 1000 };
  });
}

const sides = (from, to) => [from, ...(to ? [to] : [])];

export async function rangeFiles(repo, from, to, on) {
  const names = await gitOk(repo, ["diff", "--name-status", "-z", "--no-renames", ...sides(from, to)], on);
  const stats = parseNumstat(await gitOk(repo, ["diff", "--numstat", "-z", "--no-renames", ...sides(from, to)], on));
  const parts = names.split("\0");
  const files = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const path = parts[i + 1];
    files.push({ path, status: parts[i][0] || "M", ...(stats[path] ?? { add: 0, del: 0, binary: false }) });
  }
  return files;
}

async function rangeGroup(repo, from, to, on) {
  if (!from) return null;
  const [list, files] = [await commits(repo, from, to, on, 50), await rangeFiles(repo, from, to, on)];
  return { from, to, commits: list, files };
}

export async function worktreeFiles(repo, info, on) {
  const args = info.oid ? ["diff", "--numstat", "-z", "--no-renames", "HEAD"] : ["diff", "--cached", "--numstat", "-z", "--no-renames"];
  const tracked = info.entries.some((e) => !e.untracked);
  const stats = tracked ? parseNumstat(await gitOk(repo, args, on)) : {};
  return info.entries.map((e) => ({ path: e.path, status: letter(e), untracked: e.untracked, xy: e.xy, ...(stats[e.path] ?? { add: 0, del: 0, binary: false }) }));
}

export async function loadDetail(repo, info, on) {
  const work = info.entries.length ? await worktreeFiles(repo, info, on) : [];
  const forkPoint = info.base && info.oid ? await mergeBase(repo, info.base, "HEAD", on) : null;
  const localFrom = info.local > 0 ? (info.upstream ? "@{upstream}" : forkPoint) : null;
  const local = await rangeGroup(repo, localFrom, "HEAD", on);
  const pushedTo = info.pushed > 0 && info.upstream ? await mergeBase(repo, "@{upstream}", "HEAD", on) : null;
  const pushed = pushedTo && forkPoint ? await rangeGroup(repo, forkPoint, pushedTo, on) : null;
  return { work, local, pushed, forkPoint };
}

const clip = (line) => (line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)} … (line truncated)` : line);

function bounded(lines) {
  const kept = lines.slice(0, MAX_LINES).map(clip);
  return lines.length > MAX_LINES ? [...kept, `… ${lines.length - MAX_LINES} more lines not shown`] : kept;
}

export async function untrackedDiff(repo, path, on) {
  const text = await readTextFile(`${repo}/${path}`, { on });
  if (text === null) return ["Cannot read this file (missing, over 1 MiB, or unreadable)"];
  if (text.includes("\0")) return ["Binary file, no text diff"];
  const lines = text.replace(/\n$/, "").split("\n");
  return bounded([`@@ -0,0 +1,${lines.length} @@ new file`, ...lines.map((l) => `+${l}`)]);
}

const NOISE = /^(index |--- |\+\+\+ |similarity |rename |new file mode|deleted file mode)/;

export async function fileDiff(repo, spec, on) {
  if (spec.untracked) return untrackedDiff(repo, spec.path, on);
  const base = spec.from ? sides(spec.from, spec.to) : spec.head ? ["HEAD"] : ["--cached"];
  const out = await gitOk(repo, ["diff", ...DIFF, ...base, "--", ...(spec.path ? [spec.path] : [])], on);
  const all = out.replace(/\n$/, "").split("\n");
  const first = all.findIndex((l) => l.startsWith("@@"));
  if (first < 0) return [all.some((l) => l.startsWith("Binary")) ? "Binary file changed" : "No text diff (mode change or empty)"];
  return bounded(spec.path ? all.slice(first) : all.filter((l) => !NOISE.test(l)));
}

export function checkRef(text) {
  const ref = text.trim();
  if (!ref) return { error: "Enter a ref" };
  if (ref.startsWith("-") || !REF.test(ref) || ref.includes("..")) return { error: `Not a ref: ${ref}` };
  return { ref };
}

export async function verifyRef(repo, ref, on) {
  const r = await git(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], on);
  if (r.code !== 0) throw new Error(`Unknown commit: ${ref}`);
  return r.stdout.trim();
}

export async function compareRange(repo, fromRef, toRef, on) {
  const from = await verifyRef(repo, fromRef, on);
  const to = await verifyRef(repo, toRef, on);
  const r = await git(repo, ["merge-base", from, to], on);
  const fork = r.code === 0 ? r.stdout.trim() : from;
  const note = r.code === 0 ? null : "No common ancestor: files are diffed from..to directly";
  return { fromRef, toRef, from, to, fork, note, commits: await commits(repo, from, to, on), files: await rangeFiles(repo, fork, to, on) };
}

export async function rangeDiffText(repo, from, to, on) {
  return gitOk(repo, ["diff", ...DIFF, "--no-renames", ...sides(from, to)], on);
}

export async function describeCommit(repo, ref, on) {
  const hash = await verifyRef(repo, ref, on);
  const out = await gitOk(repo, ["show", "-s", "--format=%h%x1f%ct%x1f%s", hash], on);
  const [short, ct, subject] = out.trim().split("\x1f");
  return { ref, hash, short, subject: subject ?? "", at: (Number(ct) || 0) * 1000 };
}

async function untrackedFiles(repo, on) {
  const out = await gitOk(repo, ["ls-files", "--others", "--exclude-standard", "-z"], on);
  return out.split("\0").filter(Boolean).slice(0, 400).map((path) => ({ path, status: "A", untracked: true, add: 0, del: 0, binary: false }));
}

export async function compareWorktree(repo, fromRef, on) {
  const from = await verifyRef(repo, fromRef, on);
  const head = await git(repo, ["rev-parse", "--verify", "--quiet", "HEAD"], on);
  const list = head.code === 0 ? await commits(repo, from, "HEAD", on) : [];
  const files = [...(await rangeFiles(repo, from, null, on)), ...(await untrackedFiles(repo, on))];
  return { fromRef, toRef: "working tree", from, to: null, fork: from, note: null, commits: list, files };
}

export async function worktreeDiffText(repo, info, on) {
  const from = info.local + info.pushed > 0 && info.base ? ["--merge-base", info.base] : info.oid ? ["HEAD"] : ["--cached"];
  const tracked = info.entries.some((e) => !e.untracked) || info.local + info.pushed > 0;
  return tracked ? gitOk(repo, ["diff", ...DIFF, "--no-renames", ...from], on) : "";
}
