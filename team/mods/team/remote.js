import { hc, exec, readTextFile, shared, setShared, home } from "herdr";
import { machineHome, templatePath } from "./agents.js";

const ROOTS_KEY = "team.roots";
const REMOTE_ROOTS = [{ path: "~/Project", depth: 2 }, { path: "~", depth: 1 }];
const SCAN_MS = 15000;

export async function loadMachines() {
  const ran = await hc(["machine", "ls", "--json"]);
  if (ran.code !== 0) throw new Error((ran.stderr || ran.stdout).trim() || `hc machine ls exited ${ran.code}`);
  const list = JSON.parse(ran.stdout).machines ?? [];
  return list.filter((one) => one?.name && !one.temporary).map((one) => ({ name: one.name, state: one.state ?? "unknown" }));
}

export function formatRoots(roots) {
  return roots.map((one) => (one.depth === 2 ? one.path : `${one.path}:${one.depth}`)).join(", ");
}

export function parseRoots(text) {
  const roots = text.split(",").map((part) => part.trim()).filter(Boolean).map((part) => {
    const match = /^(.*?)(?::([12]))?$/.exec(part);
    return { path: match[1].trim(), depth: match[2] ? Number(match[2]) : 2 };
  });
  const bad = roots.find((one) => !(one.path === "~" || one.path.startsWith("~/") || one.path.startsWith("/")));
  if (bad) throw new Error(`Roots must start with / or ~: ${bad.path}`);
  if (!roots.length) throw new Error("Give at least one root, like ~/Project or ~:1");
  return roots;
}

export function rootsFor(machine) {
  const saved = shared(ROOTS_KEY);
  const mine = saved && typeof saved === "object" ? saved[machine] : null;
  if (Array.isArray(mine) && mine.length) return mine;
  return REMOTE_ROOTS;
}

export function saveRoots(machine, roots) {
  const saved = shared(ROOTS_KEY);
  const all = saved && typeof saved === "object" ? saved : {};
  if (JSON.stringify(all[machine]) !== JSON.stringify(roots)) setShared(ROOTS_KEY, { ...all, [machine]: roots });
}

const SCAN = `skip() { case "$1" in */Library|*/Documents|*/Desktop|*/Downloads|*/Pictures|*/Movies|*/Music|*/node_modules) return 0;; esac; return 1; }
scan() { for d in "$1"/*/; do d="\${d%/}"; [ -d "$d" ] || continue; skip "$d" && continue; if [ -e "$d/.git" ]; then echo "$d"; elif [ "$2" -gt 1 ]; then scan "$d" $(( $2 - 1 )); fi; done; }
[ -d "$1" ] || { echo "$1 does not exist" >&2; exit 2; }
if [ -e "$1/.git" ]; then echo "$1"; else scan "$1" "$2"; fi`;

async function scanRoot(machine, base, root, cx) {
  const dir = root.path === "~" ? base : root.path.startsWith("~/") ? `${base}/${root.path.slice(2)}` : root.path;
  const timeout = cx.sleep(SCAN_MS).then(() => ({ code: 124, stdout: "", stderr: `timed out after ${SCAN_MS / 1000}s` }));
  const r = await Promise.race([exec("sh", ["-c", SCAN, "sh", dir, String(Math.min(2, Math.max(1, root.depth)))], { on: machine }), timeout]);
  const repos = r.stdout.split("\n").filter(Boolean);
  const error = r.code !== 0 && !repos.length ? `${root.path} on ${machine}: ${(r.stderr || "").trim().split("\n")[0] || `exit ${r.code}`}` : null;
  return { repos, error };
}

export async function remoteRepos(machine, roots, cx) {
  const base = await machineHome(machine);
  const found = await Promise.all(roots.map((root) => scanRoot(machine, base, root, cx)));
  const repos = [...new Set(found.flatMap((one) => one.repos))].sort();
  const errors = found.map((one) => one.error).filter(Boolean);
  return { repos, error: errors.join("; ") || (repos.length ? null : `No git repos found under ${formatRoots(roots)} on ${machine}`) };
}

function skillPlugins(body) {
  return [...new Set([...body.matchAll(/`\/?([a-z0-9-]+):[a-z0-9-]+`/g)].map((m) => m[1]))];
}

async function pluginsMissing(machine, base, plugins) {
  const checks = await Promise.all(plugins.map((name) => exec("sh", ["-c", 'ls -d "$1"/.claude/plugins/cache/*/"$2" >/dev/null 2>&1', "sh", base, name], { on: machine })));
  return plugins.filter((_name, i) => checks[i].code !== 0);
}

export async function remoteTemplate(machine, name) {
  const base = await machineHome(machine);
  const local = await readTextFile(templatePath(name, home()));
  const remote = await readTextFile(templatePath(name, base), { on: machine });
  const missing = await pluginsMissing(machine, base, skillPlugins(remote ?? local ?? ""));
  return { present: remote !== null, missingPlugins: missing, localExists: local !== null };
}

export async function copyTemplate(machine, name) {
  const local = templatePath(name, home());
  const target = templatePath(name, ".").slice(2);
  const r = await exec("sh", ["-c", 'hc file write --on "$1" "$2" < "$3"', "sh", machine, target, local]);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `hc file write exited ${r.code}`);
}
