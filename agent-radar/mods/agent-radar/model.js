import { agents, terminals, spaces, panes, focused } from "herdr";

export const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
export const SECTIONS = [
  { status: "blocked", label: "Needs you" },
  { status: "done", label: "Done" },
  { status: "working", label: "Working" },
  { status: "idle", label: "Idle" },
];

const PATHLIKE = /^[~/]|^[A-Za-z]:\\/;
const ADDRESS = /^(?:[\w.-]+\/)?t\d+[a-z]*$/;

const CLAUDE_PROGRAM = { key: "claude", name: "Claude Code", icon: "icons/claude.svg", tint: false, tile: null, color: null, shell: false, agent: true };

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
const machineOf = (address) => (address.includes("/") ? address.split("/")[0] : null);
const subStatus = (s) => (s === "error" ? "blocked" : s === "done" ? "idle" : s);

function tabsById() {
  return new Map(spaces().flatMap((space) => space.tabs.map((tab) => [tab.id, { ...tab, space_name: space.name }])));
}

function nameOf(a, tab) {
  const live = clean(a.title);
  const prog = a.program?.name ?? "";
  const telling = live && live !== prog && live !== a.address && !ADDRESS.test(live) && !PATHLIKE.test(live) && !live.includes("@");
  if (tab?.named) return tab.name;
  return telling ? live : prog || a.space_name || a.address;
}

function agentItem(a, tabs) {
  const tab = tabs.get(a.tab);
  return {
    address: a.address,
    pane: a.pane,
    status: a.status,
    name: nameOf(a, tab),
    where: [a.space_name, tab?.named ? null : `tab ${a.tab_index}`].filter(Boolean).join(" · "),
    program: a.program,
    focused: a.focused,
    pinned: a.pinned,
    since: tab?.changed_at ?? null,
    parent: null,
    machine: machineOf(a.address),
  };
}

function subItem(k, parent) {
  return {
    ...parent,
    address: k.address,
    pane: null,
    status: subStatus(k.status),
    name: k.name || k.template || k.program?.name || k.address,
    where: `${parent.where} · sub of ${parent.name}`,
    program: k.program ?? parent.program,
    focused: false,
    pinned: false,
    parent: k.parent,
  };
}

function subAgents(listed) {
  const owners = new Map(listed.map((item) => [item.address, item]));
  const live = terminals().filter((k) => k.state === "live" && k.parent && !owners.has(k.address));
  const found = [];
  let pending = live;
  while (pending.length) {
    const ready = pending.filter((k) => owners.has(k.parent));
    if (!ready.length) break;
    for (const k of ready) {
      const item = subItem(k, owners.get(k.parent));
      owners.set(k.address, item);
      if (RANK[item.status]) found.push(item);
    }
    pending = pending.filter((k) => !owners.has(k.address));
  }
  return found;
}

function claudeItem(p, info, tab, done, focusedPane, claudeProgram) {
  return {
    address: p.terminal,
    pane: p.pane,
    status: done && info.status === "idle" ? "done" : info.status,
    name: tab?.named ? tab.name : info.name || p.program?.name || "Claude Code",
    where: [tab?.space_name, tab?.named ? null : `tab ${tab?.index ?? "?"}`].filter(Boolean).join(" · "),
    program: claudeProgram,
    focused: p.pane === focusedPane,
    pinned: false,
    since: info.since,
    parent: null,
    machine: null,
  };
}

function claudeItems(claude, done, tabs) {
  const focusedPane = focused()?.pane ?? null;
  const all = panes();
  const program = all.find((p) => p.program?.key === "claude")?.program ?? CLAUDE_PROGRAM;
  return all
    .filter((p) => p.terminal && claude[p.terminal])
    .map((p) => claudeItem(p, claude[p.terminal], tabs.get(p.tab), done.has(p.terminal), focusedPane, program));
}

const reportsClaude = (a) => /^claude/.test(a.app ?? a.program?.key ?? "");
const overridden = (a, claude) => Boolean(claude[a.address]) && !reportsClaude(a);

const byUrgency = (x, y) =>
  (RANK[y.status] ?? 0) - (RANK[x.status] ?? 0) || Number(y.pinned) - Number(x.pinned) || (y.since ?? 0) - (x.since ?? 0);

export function collect(claude = {}, done = new Set()) {
  const tabs = tabsById();
  const reported = agents().filter((a) => !overridden(a, claude)).map((a) => agentItem(a, tabs));
  const known = new Set(reported.map((item) => item.address));
  const listed = [...reported, ...claudeItems(claude, done, tabs).filter((item) => !known.has(item.address))];
  return [...listed, ...subAgents(listed)].sort(byUrgency);
}

export function needsLook(items) {
  return items.filter((item) => (item.status === "blocked" || item.status === "done") && !item.focused);
}

export function signature(items) {
  return items.map((item) => `${item.address}:${item.status}`).sort().join("|");
}

export function counts(items) {
  return Object.fromEntries(SECTIONS.map((s) => [s.status, items.filter((item) => item.status === s.status).length]));
}

export function duration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
