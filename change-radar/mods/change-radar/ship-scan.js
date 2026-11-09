import { listSessions, scanSession } from "./session-data.js";
import { gitOk } from "./git.js";
import { workspaceRootPath } from "./settings.js";

const TRACK_MS = 3 * 86_400_000;
const MAX_COMMITS = 40;
const CONCURRENCY = 3;
const MAX_CANDIDATES = 8;
const DEFAULT_BRANCHES = new Set(["main", "master", "develop", "HEAD"]);
const REWRITE_WINDOW_S = 86_400;
const SCAN_TTL_MS = 600_000;

const repoName = (repo) => {
  const root = workspaceRootPath();
  return repo.startsWith(`${root}/`) ? repo.slice(root.length + 1) : repo.split("/").pop();
};

async function refsOf(repo, sha) {
  const out = await gitOk(repo, ["for-each-ref", "--contains", sha, "--format=%(refname)", "refs/heads", "refs/remotes"]);
  const refs = out.split("\n").map((l) => l.trim()).filter(Boolean);
  const remote = refs.filter((r) => r.startsWith("refs/remotes/") && !r.endsWith("/HEAD"));
  const local = refs.filter((r) => r.startsWith("refs/heads/"));
  return { remote, local };
}

async function distance(repo, sha, ref) {
  const out = await gitOk(repo, ["rev-list", "--count", `${sha}..${ref}`]).catch(() => "999999");
  return Number(out.trim()) || 0;
}

const refName = (ref) => ref.split("/").slice(ref.startsWith("refs/remotes/") ? 3 : 2).join("/");

function rank(one, locals) {
  return [locals.has(refName(one.ref)) ? 0 : 1, one.gap, DEFAULT_BRANCHES.has(refName(one.ref)) ? 1 : 0];
}

async function pickBranch(repo, sha, refs) {
  const list = (refs.remote.length ? refs.remote : refs.local).slice(0, MAX_CANDIDATES);
  if (!list.length) return null;
  const locals = new Set(refs.local.map(refName));
  const scored = [];
  for (const ref of list) scored.push({ ref, gap: await distance(repo, sha, ref) });
  const keyed = scored.map((one) => ({ ...one, key: rank(one, locals) }));
  const best = keyed.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2])[0];
  return refName(best.ref);
}

async function commitMeta(repo, shas) {
  const out = await gitOk(repo, ["show", "-s", "--format=%x1e%H%x1f%h%x1f%ct%x1f%s", ...shas]);
  return out.split("\x1e").map((c) => c.trim()).filter(Boolean).map((c) => {
    const [sha, short, ct, subject] = c.split("\x1f");
    return { sha, short, at: (Number(ct) || 0) * 1000, subject: subject ?? "" };
  });
}

async function rewrittenCopies(repo, orphans) {
  if (!orphans.length) return new Map();
  const earliest = Math.min(...orphans.map((c) => c.at));
  const after = Math.floor(earliest / 1000) - REWRITE_WINDOW_S;
  const out = await gitOk(repo, ["log", "--remotes", `--since=@${after}`, "--format=%H%x1f%h%x1f%ct%x1f%s"]).catch(() => "");
  const rows = out.split("\n").map((l) => l.split("\x1f")).filter((r) => r.length === 4);
  const bySubject = new Map(rows.reverse().map(([sha, short, ct, subject]) => [subject, { sha, short, at: (Number(ct) || 0) * 1000 }]));
  return new Map(orphans.map((c) => [c.sha, bySubject.get(c.subject)]).filter(([, hit]) => hit && hit.at >= earliest - REWRITE_WINDOW_S * 1000));
}

async function resolveCommit(repo, c, copies) {
  const refs = await refsOf(repo, c.sha);
  const copy = !refs.remote.length && !refs.local.length ? copies.get(c.sha) : null;
  if (!copy) {
    const state = refs.remote.length ? "pushed" : refs.local.length ? "local" : "orphan";
    return { ...c, state, branch: await pickBranch(repo, c.sha, refs) };
  }
  const moved = await refsOf(repo, copy.sha);
  const state = moved.remote.length ? "pushed" : moved.local.length ? "local" : "orphan";
  return { ...c, sha: copy.sha, short: copy.short, state, branch: await pickBranch(repo, copy.sha, moved) };
}

async function repoCommits(scanRepo, since) {
  const shas = scanRepo.commits.filter((c) => (c.at ?? 0) * 1000 >= since || !c.at).map((c) => c.sha).slice(-MAX_COMMITS);
  if (!shas.length) return null;
  const meta = (await commitMeta(scanRepo.repo, shas)).filter((c) => c.at >= since);
  const orphaned = [];
  for (const c of meta) {
    const refs = await refsOf(scanRepo.repo, c.sha);
    if (!refs.remote.length && !refs.local.length) orphaned.push(c);
  }
  const copies = await rewrittenCopies(scanRepo.repo, orphaned);
  const commits = [];
  for (const c of meta) commits.push(await resolveCommit(scanRepo.repo, c, copies));
  return commits.length ? { repo: scanRepo.repo, name: repoName(scanRepo.repo), group: scanRepo.group, commits: commits.sort((a, b) => b.at - a.at) } : null;
}

async function cachedScan(sessionId, cache) {
  const sig = cache.sigs[sessionId];
  const hit = cache.scans[sessionId];
  if (sig && hit?.sig === sig && Date.now() - hit.at < SCAN_TTL_MS) return hit;
  return { sig, at: Date.now(), scan: await scanSession(sessionId) };
}

async function sessionShip(scan, since) {
  const repos = [];
  for (const one of scan.repos.filter((r) => r.commits.length)) {
    const found = await repoCommits(one, since).catch((e) => ({ repo: one.repo, name: repoName(one.repo), error: String(e.message ?? e), commits: [] }));
    if (found) repos.push(found);
  }
  return repos;
}

function sessionInfo(s) {
  return { sessionId: s.sessionId, label: s.label || s.sessionId.slice(0, 8), live: Boolean(s.live), cwd: s.cwd ?? null };
}

export async function discover(extraIds = [], cache = { sigs: {}, scans: {} }) {
  const found = await listSessions();
  const wanted = new Set(extraIds);
  const list = found.sessions.filter((s) => s.live || wanted.has(s.sessionId));
  const since = Date.now() - TRACK_MS;
  const queue = [...list];
  const out = {};
  const scans = {};
  const errors = [];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        const entry = await cachedScan(s.sessionId, cache);
        scans[s.sessionId] = entry;
        const repos = await sessionShip(entry.scan, since);
        if (repos.length) out[s.sessionId] = { ...sessionInfo(s), repos };
      } catch (e) {
        errors.push(`${s.label}: ${e.message ?? e}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { tracked: { sessions: out, warning: [found.warning, errors[0]].filter(Boolean).join(" \u{b7} ") || null, at: Date.now() }, scans };
}

export function branchesOf(repo) {
  const pushed = repo.commits.filter((c) => c.state === "pushed" && c.branch && !DEFAULT_BRANCHES.has(c.branch));
  return [...new Set(pushed.map((c) => c.branch))].map((branch) => ({ branch, head: pushed.find((c) => c.branch === branch) }));
}
