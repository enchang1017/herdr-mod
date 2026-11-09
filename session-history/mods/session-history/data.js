import { exec, appHome, home } from "herdr";

export const SEARCH_LIMIT = 50;

const scriptPath = () => `${appHome()}/mods/session-history/index.py`;
const cachePath = () => `${appHome()}/data/session-history/index.json`;

function parseOutput(ran, what) {
  if (ran.code !== 0) throw new Error(`${what} failed: ${(ran.stderr || ran.stdout).trim().slice(0, 300) || `exit ${ran.code}`}`);
  try {
    return JSON.parse(ran.stdout);
  } catch {
    throw new Error(`${what} gave no JSON: ${ran.stdout.trim().slice(0, 200)}`);
  }
}

export async function loadIndex() {
  const ran = await exec("python3", ["-I", scriptPath(), "index", cachePath()]);
  const out = parseOutput(ran, "Indexing sessions");
  return { sessions: out.sessions ?? [], pending: out.pending === true, errors: out.errors ?? [] };
}

export async function searchText(query) {
  const ran = await exec("python3", ["-I", scriptPath(), "search", query, String(SEARCH_LIMIT)]);
  const out = parseOutput(ran, "Searching transcripts");
  return { hits: out.hits ?? [], truncated: out.truncated === true };
}

function haystack(session) {
  return [session.title, session.name, session.cwd, session.repo, session.branch, session.id].filter(Boolean).join(" ").toLowerCase();
}

export function filterSessions(sessions, query, hits) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const snippets = new Map((hits ?? []).map((hit) => [hit.id, hit.snippet]));
  return sessions
    .filter((s) => words.every((w) => haystack(s).includes(w)) || snippets.has(s.id))
    .map((s) => (snippets.has(s.id) ? { ...s, snippet: snippets.get(s.id) } : s));
}

export function displayTitle(session) {
  return session.name || session.title || "(no prompt)";
}

export function shortTitle(session, max = 28) {
  const text = displayTitle(session).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function folderLabel(session) {
  if (!session.cwd) return session.repo ?? "unknown folder";
  const base = session.cwd === home() ? "~" : session.cwd.split("/").filter(Boolean).pop() ?? session.cwd;
  return session.repo && session.repo !== base ? `${base} · ${session.repo}` : base;
}

export function ageLabel(mtimeSeconds, now) {
  const minutes = Math.max(0, Math.floor((now - mtimeSeconds * 1000) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 60 * 24 * 30) return `${Math.floor(minutes / 1440)}d`;
  return `${Math.floor(minutes / 43200)}mo`;
}

export function sizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function branchLabel(session) {
  return session.branch && session.branch !== "HEAD" ? session.branch : null;
}
