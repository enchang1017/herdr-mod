import { h_flex } from "gpui-base";
import { layout, setShared, settings, shared } from "herdr";

export const KEY = {
  folds: "spaces-agents.folds",
  shells: "spaces-agents.shells",
};

export const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

const PALETTE = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];

export const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

export const RAIL_CELL = 32;
export const railCell = (el) => h_flex().flex_none().justify_center().child(el);

export function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

export const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);

export const base = (path) => (path ?? "").replace(/\/+$/, "").split("/").pop();

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

export function urgent(statuses) {
  return statuses.reduce((best, s) => ((RANK[s] ?? 0) > (RANK[best] ?? 0) ? s : best), null);
}

export function folds() {
  const value = shared(KEY.folds);
  return value && typeof value === "object" ? value : {};
}

export function isOpen(id, fallback) {
  const value = folds()[id];
  return typeof value === "boolean" ? value : fallback;
}

export function setOpen(id, open) {
  if (folds()[id] !== open) setShared(KEY.folds, { ...folds(), [id]: open });
}

export const showShells = () => shared(KEY.shells) !== false;

export const soundsOn = () => settings().sounds?.enabled !== false;

export function assignColors(sp) {
  const stored = shared("space.colors") ?? {};
  const ids = new Set(sp.map((p) => p.id));
  const kept = Object.fromEntries(Object.entries(stored).filter(([id]) => ids.has(id)));
  const uses = (all, c) => Object.values(all).filter((v) => v === c).length;
  const next = sp
    .filter((p) => !kept[p.id] && p.name !== "~")
    .reduce((all, p) => ({ ...all, [p.id]: PALETTE.reduce((best, c) => (uses(all, c) < uses(all, best) ? c : best)) }), kept);
  const changed = Object.keys(next).length !== Object.keys(stored).length || Object.keys(next).some((id) => next[id] !== stored[id]);
  if (changed) setShared("space.colors", next);
}

const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const isAutoName = (name, cwd) => new RegExp(`^${slug(base(cwd))}-[0-9a-f]{2}$`).test(String(name ?? ""));

export function agentName(terminalName, sessionName, cwd) {
  const renamed = typeof sessionName === "string" && sessionName && !isAutoName(sessionName, cwd) ? sessionName : null;
  return terminalName || renamed || base(cwd) || "claude";
}

export function shortName(name, tabName) {
  const key = String(tabName ?? "").match(/[A-Za-z][A-Za-z0-9]*-\d+/)?.[0];
  const suffix = key ? `-${key.toLowerCase()}` : null;
  return suffix && name.toLowerCase().endsWith(suffix) && name.length > suffix.length ? name.slice(0, -suffix.length) : name;
}

export function roleName(address, ts) {
  const term = ts.find((t) => t.address === address);
  if (!term) return null;
  const lead = ts.some((t) => t.parent === address && t.labels?.team);
  if (lead) return !term.name ? "lead" : /^lead([-_]|$)/.test(term.name) ? term.name : `lead · ${term.name}`;
  return term.labels?.team || term.name || null;
}
