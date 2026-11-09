import { exec } from "herdr";

const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "core.quotepath=off", "-c", "color.ui=false"];
const PRUNE = ["node_modules", "bin", "obj", ".vs", ".idea", "dist", ".nuxt", ".output", ".next"];
const STAT_LIMIT = 200;

const firstLine = (text) => (text || "").trim().split("\n")[0];

export async function git(repo, args, on) {
  return exec("git", [...READ, ...args], { cwd: repo, on });
}

export async function gitOk(repo, args, on) {
  const r = await git(repo, args, on);
  if (r.code !== 0) throw new Error(`git ${args[0]} failed: ${firstLine(r.stderr || r.stdout) || `exit ${r.code}`}`);
  return r.stdout;
}

export async function discover(root, on) {
  const prune = PRUNE.flatMap((name, i) => (i ? ["-o", "-name", name] : ["-name", name]));
  const args = [root, "-maxdepth", "4", "(", ...prune, ")", "-prune", "-o", "-name", ".git", "-prune", "-print"];
  const r = await exec("find", args, { on });
  const repos = r.stdout.split("\n").filter(Boolean).map((p) => p.slice(0, -5) || "/").sort();
  if (r.code !== 0 && !repos.length) throw new Error(`Cannot list ${root}: ${firstLine(r.stderr) || `exit ${r.code}`}`);
  const warning = r.code !== 0 ? firstLine(r.stderr) : null;
  if (repos.length) return { repos, warning };
  const top = await git(root, ["rev-parse", "--show-toplevel"], on);
  return { repos: top.code === 0 ? [top.stdout.trim()] : [], warning };
}

function statusEntry(fields, pathFrom, xy, extra) {
  return { path: fields.slice(pathFrom).join(" "), xy, index: fields[7] ?? "", untracked: false, conflict: false, submodule: fields[2]?.[0] === "S", ...extra };
}

export function parseStatus(stdout) {
  const parts = stdout.split("\0");
  const head = { oid: null, branch: null, upstream: null, ahead: 0, behind: 0 };
  const entries = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (p.startsWith("# branch.oid ")) head.oid = p.slice(13) === "(initial)" ? null : p.slice(13);
    else if (p.startsWith("# branch.head ")) head.branch = p.slice(14);
    else if (p.startsWith("# branch.upstream ")) head.upstream = p.slice(18);
    else if (p.startsWith("# branch.ab ")) {
      const [a, b] = p.slice(12).split(" ");
      head.ahead = Math.abs(parseInt(a, 10)) || 0;
      head.behind = Math.abs(parseInt(b, 10)) || 0;
    } else if (p[0] === "1") entries.push(statusEntry(p.split(" "), 8, p.slice(2, 4), {}));
    else if (p[0] === "2") { entries.push(statusEntry(p.split(" "), 9, p.slice(2, 4), {})); i++; }
    else if (p[0] === "u") entries.push(statusEntry(p.split(" "), 10, p.slice(2, 4), { conflict: true }));
    else if (p[0] === "?") entries.push({ path: p.slice(2), xy: "??", untracked: true, conflict: false, submodule: false });
  }
  return { ...head, entries };
}

export function letter(entry) {
  if (entry.conflict) return "U";
  if (entry.untracked) return "A";
  if (entry.xy.includes("D")) return "D";
  if (entry.xy.includes("A")) return "A";
  return "M";
}

export function parseNumstat(stdout) {
  return stdout.split("\0").reduce((acc, item) => {
    const [a, d, ...rest] = item.split("\t");
    if (!rest.length) return acc;
    const path = rest.join("\t").replace(/^\n/, "");
    return { ...acc, [path]: { add: Number(a) || 0, del: Number(d) || 0, binary: a === "-" } };
  }, {});
}

export const shortRef = (ref) => (ref ?? "").replace(/^refs\/remotes\//, "");

export async function resolveBase(repo, on) {
  for (const ref of ["origin/master", "origin/main"]) {
    const r = await git(repo, ["rev-parse", "--verify", "--quiet", `refs/remotes/${ref}`], on);
    if (r.code === 0) return `refs/remotes/${ref}`;
  }
  const sym = await git(repo, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"], on);
  return sym.code === 0 && sym.stdout.trim() ? sym.stdout.trim() : null;
}

async function commitCounts(repo, st, base, on) {
  if (!st.oid || !base) return { local: st.upstream ? st.ahead : 0, pushed: 0, branchCommits: 0 };
  const out = await gitOk(repo, ["rev-list", "--count", `${base}..HEAD`], on);
  const branchCommits = parseInt(out.trim(), 10) || 0;
  const local = st.upstream ? st.ahead : branchCommits;
  return { local, pushed: st.upstream ? Math.max(0, branchCommits - st.ahead) : 0, branchCommits };
}

async function lineStats(repo, st, base, branchCommits, on) {
  const tracked = st.entries.some((e) => !e.untracked);
  if (!branchCommits && !tracked) return {};
  const args = !st.oid ? ["diff", "--cached", "--numstat", "-z", "--no-renames"]
    : branchCommits ? ["diff", "--numstat", "-z", "--no-renames", "--merge-base", base]
      : ["diff", "--numstat", "-z", "--no-renames", "HEAD"];
  return parseNumstat(await gitOk(repo, args, on));
}

const parentOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".");

async function mtimes(repo, entries, on) {
  const paths = [...new Set(entries.slice(0, STAT_LIMIT).map((e) => (e.xy.includes("D") ? parentOf(e.path) : e.path)))];
  if (!paths.length) return {};
  const r = await exec("stat", ["-f", "%m", "--", ...paths], { cwd: repo, on });
  const values = r.stdout.split("\n").filter(Boolean).map(Number);
  if (r.code !== 0 && !values.length) throw new Error(`stat failed: ${firstLine(r.stderr)}`);
  return values.length === paths.length ? Object.fromEntries(paths.map((p, i) => [p, values[i] * 1000])) : { "*": Math.max(...values) * 1000 };
}

async function untrackedLines(repo, entries, on) {
  const files = entries.filter((e) => e.untracked).slice(0, STAT_LIMIT).map((e) => e.path);
  if (!files.length) return 0;
  const r = await exec("wc", ["-l", "--", ...files], { cwd: repo, on });
  const rows = r.stdout.trim().split("\n").filter(Boolean);
  if (r.code !== 0 && !rows.length) throw new Error(`wc failed: ${firstLine(r.stderr)}`);
  const last = rows[rows.length - 1].trim().split(/\s+/);
  return Number(last[0]) || 0;
}

async function commitTime(repo, on) {
  const out = await gitOk(repo, ["log", "-1", "--format=%ct", "HEAD"], on);
  return (Number(out.trim()) || 0) * 1000;
}

export async function scanRepo(repo, base, on) {
  const st = parseStatus(await gitOk(repo, ["status", "--porcelain=v2", "--branch", "-z", "--no-renames", "--untracked-files=all"], on));
  const counts = await commitCounts(repo, st, base, on);
  const stats = await lineStats(repo, st, base, counts.branchCommits, on);
  const times = st.entries.length ? await mtimes(repo, st.entries, on) : {};
  const fresh = st.entries.length ? await untrackedLines(repo, st.entries, on) : 0;
  const committed = counts.local + counts.pushed > 0 ? await commitTime(repo, on) : 0;
  const values = Object.values(stats);
  const paths = new Set([...Object.keys(stats), ...st.entries.map((e) => e.path)]);
  return {
    ...st, ...counts, base, times,
    add: values.reduce((n, s) => n + s.add, 0) + fresh,
    del: values.reduce((n, s) => n + s.del, 0),
    fileCount: paths.size,
    changedAt: Math.max(committed, ...Object.values(times), 0) || null,
  };
}

export async function worktreeHashes(repo, entries, on) {
  const files = entries.filter((e) => !e.submodule && !e.xy.includes("D")).map((e) => e.path);
  const chunks = Array.from({ length: Math.ceil(files.length / 200) }, (_, i) => files.slice(i * 200, i * 200 + 200));
  const outs = [];
  for (const chunk of chunks) outs.push(await gitOk(repo, ["hash-object", "--", ...chunk], on));
  return outs.join("");
}

export async function fetchRepo(repo, on) {
  const r = await exec("git", ["fetch", "--quiet"], { cwd: repo, on });
  if (r.code !== 0) throw new Error(`git fetch failed: ${firstLine(r.stderr || r.stdout) || `exit ${r.code}`}`);
}
