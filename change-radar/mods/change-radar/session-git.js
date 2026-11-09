import { exec } from "herdr";
import { gitOk, parseStatus, parseNumstat, letter } from "./git.js";

const LITERAL = "--literal-pathspecs";
const PATHSPEC_LIMIT = 300;
const OTHERS_LIMIT = 40;
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const RANK = { uncommitted: 3, local: 2, pushed: 1, clean: 0 };

function chunks(text) {
  return text.split("\x1e").map((c) => c.replace(/^\n+/, "")).filter(Boolean);
}

async function commitMeta(repo, shas) {
  const out = await gitOk(repo, ["show", "-s", "--format=%x1e%H%x1f%h%x1f%P%x1f%ct%x1f%s", ...shas]);
  return Object.fromEntries(chunks(out).map((c) => {
    const [sha, short, parents, ct, subject] = c.trim().split("\x1f");
    return [sha, { sha, short, parents: parents ? parents.split(" ") : [], at: (Number(ct) || 0) * 1000, subject: subject ?? "" }];
  }));
}

function parseLines(text, cell) {
  return Object.fromEntries(chunks(text).map((c) => {
    const [sha, ...rest] = c.split("\n");
    return [sha.trim(), rest.filter(Boolean).map(cell).filter(Boolean)];
  }));
}

async function commitFiles(repo, shas) {
  const names = await gitOk(repo, ["show", "--no-renames", "--name-status", "--format=%x1e%H", ...shas]);
  const stats = await gitOk(repo, ["show", "--no-renames", "--numstat", "--format=%x1e%H", ...shas]);
  const status = parseLines(names, (l) => { const [s, ...p] = l.split("\t"); return p.length ? { path: p.join("\t"), status: s[0] } : null; });
  const nums = parseLines(stats, (l) => { const [a, d, ...p] = l.split("\t"); return p.length ? { path: p.join("\t"), add: Number(a) || 0, del: Number(d) || 0, binary: a === "-" } : null; });
  return Object.fromEntries(shas.map((sha) => {
    const byPath = Object.fromEntries((nums[sha] ?? []).map((n) => [n.path, n]));
    return [sha, (status[sha] ?? []).map((s) => ({ ...s, ...(byPath[s.path] ?? { add: 0, del: 0, binary: false }) }))];
  }));
}

async function contains(repo, sha, refs) {
  const out = await gitOk(repo, ["for-each-ref", "--count=1", "--format=%(refname)", "--contains", sha, refs]);
  return Boolean(out.trim());
}

async function commitState(repo, sha) {
  if (await contains(repo, sha, "refs/remotes")) return "pushed";
  return (await contains(repo, sha, "refs/heads")) ? "local" : "orphan";
}

async function status(repo, paths) {
  const spec = paths.length && paths.length <= PATHSPEC_LIMIT ? ["--", ...paths] : [];
  return parseStatus(await gitOk(repo, [LITERAL, "status", "--porcelain=v2", "--branch", "-z", "--no-renames", "--untracked-files=all", ...spec]));
}

async function worktreeStats(repo, st, paths) {
  const tracked = st.entries.filter((e) => !e.untracked && paths.has(e.path)).map((e) => e.path);
  const base = st.oid ? ["HEAD"] : ["--cached"];
  const nums = tracked.length ? parseNumstat(await gitOk(repo, [LITERAL, "diff", "--numstat", "-z", "--no-renames", ...base, "--", ...tracked.slice(0, PATHSPEC_LIMIT)])) : {};
  const fresh = st.entries.filter((e) => e.untracked && paths.has(e.path)).map((e) => e.path).slice(0, PATHSPEC_LIMIT);
  return { ...nums, ...(await untrackedCounts(repo, fresh)) };
}

async function untrackedCounts(repo, files) {
  if (!files.length) return {};
  const r = await exec("wc", ["-l", "--", ...files], { cwd: repo });
  const rows = r.stdout.split("\n").map((l) => /^\s*(\d+)\s+(.*)$/.exec(l)).filter(Boolean);
  return Object.fromEntries(rows.filter((m) => files.includes(m[2])).map((m) => [m[2], { add: Number(m[1]) || 0, del: 0, binary: false }]));
}

function fileRecord(path, ctx) {
  const touching = ctx.order.filter((sha) => ctx.files[sha].some((f) => f.path === path));
  const entry = ctx.entries.get(path);
  const parts = touching.map((sha) => ctx.files[sha].find((f) => f.path === path));
  const work = entry ? ctx.work[path] ?? { add: 0, del: 0, binary: false } : { add: 0, del: 0, binary: false };
  const states = touching.map((sha) => ctx.states[sha]);
  const state = entry ? "uncommitted" : touching.length ? (states.every((s) => s === "pushed") ? "pushed" : "local") : "clean";
  return {
    path, state, commits: touching, edits: ctx.edits[path]?.count ?? 0, at: ctx.edits[path]?.at ?? 0, via: ctx.edits[path]?.via ?? null,
    status: entry ? letter(entry) : parts[0]?.status ?? "M", untracked: Boolean(entry?.untracked),
    add: parts.reduce((n, p) => n + p.add, 0) + work.add, del: parts.reduce((n, p) => n + p.del, 0) + work.del,
    binary: parts.some((p) => p.binary) || work.binary,
  };
}

async function commitContext(repo, scan) {
  const shas = scan.commits.map((c) => c.sha);
  if (!shas.length) return { meta: {}, files: {}, states: {}, order: [] };
  const meta = await commitMeta(repo, shas);
  const order = shas.filter((sha) => meta[sha]).sort((a, b) => meta[a].at - meta[b].at);
  const files = await commitFiles(repo, order);
  const states = Object.fromEntries(await Promise.all(order.map(async (sha) => [sha, await commitState(repo, sha)])));
  return { meta, files, states, order };
}

export async function loadRepo(scan) {
  const repo = scan.repo;
  const commits = await commitContext(repo, scan);
  const edits = Object.fromEntries(scan.edits.map((e) => [e.path, e]));
  const paths = new Set([...Object.keys(edits), ...commits.order.flatMap((sha) => commits.files[sha].map((f) => f.path))]);
  const st = await status(repo, []);
  const entries = new Map(st.entries.map((e) => [e.path, e]));
  const otherPaths = st.entries.map((e) => e.path).filter((path) => !paths.has(path));
  const work = await worktreeStats(repo, st, new Set([...paths, ...otherPaths]));
  const ctx = { ...commits, entries, work, edits };
  const files = [...paths].sort().map((path) => fileRecord(path, ctx)).filter((f) => f.via !== "bash" || f.state !== "clean");
  const others = otherPaths.sort().slice(0, OTHERS_LIMIT).map((path) => ({ ...fileRecord(path, ctx), unattributed: true }));
  const list = commits.order.map((sha) => ({ ...commits.meta[sha], state: commits.states[sha] }));
  const state = files.reduce((best, f) => (RANK[f.state] > RANK[best] ? f.state : best), "clean");
  return {
    ...scan, branch: st.branch, upstream: st.upstream, ahead: st.ahead, behind: st.behind, oid: st.oid,
    files, others, othersCount: otherPaths.length, commitList: list, state: list.some((c) => c.state === "orphan") && state === "clean" ? "local" : state,
    add: files.reduce((n, f) => n + f.add, 0), del: files.reduce((n, f) => n + f.del, 0), meta: commits.meta,
  };
}

export function fileSpec(repo, file) {
  if (!file.commits.length) return file.state === "uncommitted" ? { path: file.path, untracked: file.untracked, head: Boolean(repo.oid) } : null;
  const first = repo.meta[file.commits[0]], last = file.commits[file.commits.length - 1];
  const from = first.parents.length ? `${first.sha}^` : EMPTY_TREE;
  return file.state === "uncommitted" ? { path: file.path, from } : { path: file.path, from, to: last };
}

export async function sessionDiffText(repo) {
  const diff = ["--no-color", "--no-ext-diff", "--no-textconv", "--no-renames"];
  const shas = repo.commitList.map((c) => c.sha);
  const committed = shas.length ? await gitOk(repo.repo, ["show", ...diff, "--format=", ...shas]) : "";
  const tracked = repo.files.filter((f) => f.state === "uncommitted" && !f.untracked).map((f) => f.path).slice(0, PATHSPEC_LIMIT);
  const base = repo.oid ? ["HEAD"] : ["--cached"];
  const work = tracked.length ? await gitOk(repo.repo, [LITERAL, "diff", ...diff, ...base, "--", ...tracked]) : "";
  return committed + work;
}
