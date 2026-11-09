import { git, gitOk } from "./git.js";

export const PAGE = 200;
const FIELD = "\x1f";
const RECORD = "\x1e";
const DIFF = ["--no-ext-diff", "--no-textconv", "--no-color"];
const MAX_LINES = 2000;

function scopeArgs(filters) {
  const refs = filters.scope === "current" ? ["HEAD"] : ["--branches", "--tags"];
  const remotes = filters.remotes ? (filters.scope === "current" ? [] : ["--remotes"]) : ["--decorate-refs-exclude=refs/remotes"];
  return [...refs, ...remotes, "--decorate-refs-exclude=refs/stash", "--decorate-refs-exclude=refs/remotes/*/HEAD"];
}

function refKind(name, remotes) {
  if (name.startsWith("tag: ")) return { kind: "tag", name: name.slice(5) };
  if (name.startsWith("HEAD -> ")) return { kind: "head", name: name.slice(8) };
  if (name === "HEAD") return { kind: "head", name: "HEAD" };
  if (remotes.some((remote) => name.startsWith(`${remote}/`))) return { kind: "remote", name };
  return { kind: "local", name };
}

export function parseRefs(text, remotes) {
  return text.split(", ").map((one) => one.trim()).filter(Boolean).map((one) => refKind(one, remotes));
}

function parseRecord(record, remotes) {
  const [hash, parents, refs, author, at, subject] = record.split(FIELD);
  return { hash, short: hash.slice(0, 8), parents: parents ? parents.split(" ") : [], refs: parseRefs(refs ?? "", remotes), author, at: (Number(at) || 0) * 1000, subject: subject ?? "" };
}

export async function remoteNames(repo, on) {
  const out = await git(repo, ["remote"], on);
  return out.code === 0 ? out.stdout.split("\n").map((line) => line.trim()).filter(Boolean) : [];
}

export async function loadPage(repo, filters, skip, remotes, on) {
  const format = "--format=%H%x1f%P%x1f%D%x1f%an%x1f%at%x1f%s%x1e";
  const upstream = filters.scope === "current" && filters.remotes ? await upstreamRef(repo, on) : [];
  const args = ["log", "--topo-order", format, `-n${PAGE}`, `--skip=${skip}`, ...scopeArgs(filters), ...upstream, "--"];
  const out = await gitOk(repo, args, on);
  const commits = out.split(RECORD).map((one) => one.replace(/^\n/, "")).filter((one) => one.includes(FIELD)).map((one) => parseRecord(one, remotes));
  return { commits, hasMore: commits.length === PAGE };
}

async function upstreamRef(repo, on) {
  const out = await git(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], on);
  return out.code === 0 && out.stdout.trim() ? [out.stdout.trim()] : [];
}

export async function currentBranch(repo, on) {
  const out = await git(repo, ["branch", "--show-current"], on);
  return out.code === 0 ? out.stdout.trim() || "detached" : "";
}

function parseNameStatus(stdout) {
  const parts = stdout.split("\0");
  const files = [];
  for (let i = 0; i < parts.length;) {
    const status = parts[i] ?? "";
    if (!status) { i += 1; continue; }
    const letter = status[0];
    const isRename = letter === "R" || letter === "C";
    const path = isRename ? parts[i + 2] : parts[i + 1];
    if (path) files.push({ path, status: letter, from: isRename ? parts[i + 1] : null, add: 0, del: 0 });
    i += isRename ? 3 : 2;
  }
  return files;
}

function treeArgs(commit) {
  return commit.parents.length ? [commit.parents[0], commit.hash] : ["--root", commit.hash];
}

export async function commitInfo(repo, commit, on) {
  const meta = await gitOk(repo, ["show", "-s", "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%B", commit.hash], on);
  const [hash, parents, author, email, at, ...body] = meta.split(FIELD);
  const names = await gitOk(repo, ["diff-tree", "-r", "-M", "--no-commit-id", "--name-status", "-z", ...treeArgs(commit)], on);
  return {
    hash, parents: parents ? parents.trim().split(" ").filter(Boolean) : [], author, email, at: (Number(at) || 0) * 1000,
    message: body.join(FIELD).trim(), files: parseNameStatus(names),
  };
}

function bounded(lines) {
  return lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `… ${lines.length - MAX_LINES} more lines not shown`] : lines;
}

export async function commitDiffLines(repo, commit, path, on) {
  const out = await gitOk(repo, ["diff-tree", "-p", "-M", ...DIFF, "--no-commit-id", ...treeArgs(commit), "--", ...(path ? [path] : [])], on);
  const all = out.replace(/\n$/, "").split("\n");
  const first = all.findIndex((line) => line.startsWith("@@"));
  if (first < 0) return [all.some((line) => line.startsWith("Binary")) ? "Binary file changed" : "No text diff (mode change, merge with no first-parent change, or empty)"];
  const noise = /^(index |--- |\+\+\+ |similarity |rename |new file mode|deleted file mode)/;
  return bounded(path ? all.slice(first) : all.filter((line) => !noise.test(line)));
}

export async function commitDiffText(repo, commit, on) {
  return gitOk(repo, ["diff-tree", "-p", "-M", ...DIFF, "--no-commit-id", ...treeArgs(commit)], on);
}
