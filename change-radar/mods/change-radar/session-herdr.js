import { hc, terminals, panes, spaces, focused, readTextFile, appHome } from "herdr";

const DOT = "\u{b7}";
const PROMPT_LABEL = 60;
const OUTSIDE = "Live outside Herdr";
const RECENT = "Recent";

const indexPath = () => `${appHome()}/data/session-history/index.json`;
const base = (path) => (path ?? "").replace(/\/+$/, "").split("/").pop();
const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}\u{2026}` : text);
const isLocalLive = (t) => t.address && !t.address.includes("/") && (t.state === "live" || t.state === undefined);

export const isAutoName = (name, cwd) => new RegExp(`^${slug(base(cwd))}-[0-9a-f]{2}$`).test(String(name ?? ""));
export const tabLabel = (tab) => (/^\d+$/.test(tab.name) ? `Tab ${tab.name}` : tab.name);

export function shortName(name, tabName) {
  const key = String(tabName ?? "").match(/[A-Za-z][A-Za-z0-9]*-\d+/)?.[0];
  const suffix = key ? `-${key.toLowerCase()}` : null;
  return suffix && name.toLowerCase().endsWith(suffix) && name.length > suffix.length ? name.slice(0, -suffix.length) : name;
}

export function roleName(address, ts) {
  const term = ts.find((t) => t.address === address);
  if (!term) return null;
  const lead = ts.some((t) => t.parent === address && t.labels?.team);
  if (lead) return !term.name ? "lead" : /^lead([-_]|$)/.test(term.name) ? term.name : `lead ${DOT} ${term.name}`;
  return term.labels?.team || term.name || null;
}

function renamed(s) {
  const name = s.customName || s.name;
  return typeof name === "string" && name && !isAutoName(name, s.cwd) ? name : null;
}

export function friendlyName(s, role, tabName) {
  const prompt = s.title ? clip(s.title, PROMPT_LABEL) : null;
  const raw = role || renamed(s) || prompt || s.command || (s.live ? base(s.cwd) : null) || (s.cwd ? "Empty session" : s.sessionId.slice(0, 8));
  return shortName(raw, tabName);
}

function isClaude(fg) {
  return (String(fg?.argv?.[0] ?? "").split("/").pop() ?? "").startsWith("claude");
}

async function claudePid(address) {
  const r = await hc(["get", address, "--json"]);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `hc get ${address} exited ${r.code}`);
  const fg = JSON.parse(r.stdout).foreground ?? null;
  return isClaude(fg) && fg.pid ? fg.pid : null;
}

async function terminalPids(ts) {
  const local = ts.filter(isLocalLive);
  const results = await Promise.allSettled(local.map((t) => claudePid(t.address)));
  const pids = new Map(local.flatMap((t, i) => (results[i].status === "fulfilled" && results[i].value ? [[results[i].value, t.address]] : [])));
  const failed = results.filter((r) => r.status === "rejected").map((r) => String(r.reason?.message ?? r.reason));
  return { pids, failed };
}

async function historyIndex() {
  const text = await readTextFile(indexPath()).catch(() => null);
  if (!text) return new Map();
  try {
    const files = JSON.parse(text).files ?? {};
    return new Map(Object.entries(files).filter(([path, v]) => v?.kind === "claude" && path.endsWith(".jsonl"))
      .map(([path, v]) => [path.split("/").pop().slice(0, -6), v.fields ?? {}]));
  } catch (e) {
    throw new Error(`Could not parse ${indexPath()}: ${e.message ?? e}`);
  }
}

function withHistory(s, index) {
  const f = index.get(s.sessionId);
  if (!f) return s;
  return { ...s, customName: f.name ?? null, title: f.title || s.title || null, command: f.command || s.command || null, cwd: s.cwd || f.cwd || null };
}

function placeOf(address, ts, ps, sp) {
  const at = ps.findIndex((p) => p.terminal === address);
  const tabId = ps[at]?.tab ?? ts.find((t) => t.address === address)?.labels?.["herdr.tab"];
  const space = sp.find((x) => (x.tabs ?? []).some((tab) => tab.id === tabId));
  const tab = space?.tabs.find((x) => x.id === tabId);
  return tab ? { space, tab, order: at < 0 ? ps.length : at } : null;
}

function focusedAddress(ps) {
  const f = focused();
  return f?.terminal ?? ps.find((p) => p.pane === f?.pane)?.terminal ?? null;
}

function decorate(s, ctx) {
  const address = s.live ? ctx.pids.get(s.pid) ?? null : null;
  const place = address ? placeOf(address, ctx.ts, ctx.ps, ctx.sp) : null;
  const label = friendlyName(s, address ? roleName(address, ctx.ts) : null, place?.tab.name);
  const tab = place ? tabLabel(place.tab) : null;
  const group = place ? `${place.space.name} ${DOT} ${tab}` : s.live ? OUTSIDE : RECENT;
  const rank = place ? place.space.index * 1000 + place.tab.index : s.live ? 1e7 : 2e7;
  return { ...s, address, label, space: place?.space.name ?? null, tab, group, rank, order: place?.order ?? 0, focused: Boolean(address && address === ctx.here) };
}

function ordered(list) {
  const top = list.find((s) => s.focused)?.group ?? null;
  const key = (s) => [s.group === top ? 0 : 1, s.rank, s.focused ? 0 : 1, s.live ? s.order : -(s.at ?? 0)];
  return [...list].sort((a, b) => {
    const x = key(a), y = key(b);
    const i = x.findIndex((v, n) => v !== y[n]);
    return i < 0 ? 0 : x[i] - y[i];
  });
}

export async function placeSessions(list) {
  const ts = terminals(), ps = panes(), sp = spaces();
  const history = historyIndex().then((map) => ({ map, error: null }), (e) => ({ map: new Map(), error: String(e.message ?? e) }));
  const [{ pids, failed }, index] = await Promise.all([terminalPids(ts), history]);
  const ctx = { ts, ps, sp, pids, here: focusedAddress(ps) };
  const sessions = ordered(list.map((s) => decorate(withHistory(s, index.map), ctx)));
  const warnings = [failed.length && `Could not inspect ${failed.length} terminal(s): ${failed[0]}`, index.error].filter(Boolean);
  return { sessions, warning: warnings.join(" \u{b7} ") || null };
}

export function placeText(s) {
  if (s?.space) return `${s.space} ${DOT} ${s.tab}`;
  return (s?.cwd ?? "").split("/").slice(-2).join("/");
}
