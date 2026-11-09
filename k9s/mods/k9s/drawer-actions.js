import { canLog } from "./kubectl.js";
import { loadOverview, overviewKey, hasOverview } from "./overview-source.js";
import * as browse from "./browse-actions.js";

export const TABS = [
  { key: "overview", label: "Overview", icon: "gauge", hotkey: "o" },
  { key: "events", label: "Events", icon: "bell", hotkey: "e" },
  { key: "yaml", label: "YAML", icon: "code-xml", hotkey: "y" },
  { key: "logs", label: "Logs", icon: "scroll-text", hotkey: "l" },
  { key: "describe", label: "Describe", icon: "file-search", hotkey: "d" },
];

const TEXT_TABS = new Set(["yaml", "logs", "describe"]);
const REVEAL_MS = 24;
const OVERVIEW_FRESH_MS = 10_000;
export const EMPTY_OVERVIEW = { key: "", loading: false, error: "", data: null, at: 0 };

export function tabsFor(resource) {
  return TABS.filter((tab) => tab.key !== "logs" || canLog(resource));
}

export function canOpen(resource) {
  return hasOverview(resource);
}

function reveal(panel, cx) {
  const token = (panel.revealToken ?? 0) + 1;
  panel.revealToken = token;
  panel.set({ drawer: { ...panel.state.drawer, revealed: false, token } });
  cx.timer.after(REVEAL_MS, (cx) => {
    if (panel.revealToken !== token || !panel.state.drawer) return;
    panel.set({ drawer: { ...panel.state.drawer, revealed: true } });
    cx.notify();
  });
}

function loadOverviewData(panel, cx, isForced) {
  const { scope, overview } = panel.state;
  const row = browse.selectedRow(panel);
  if (!row) return;
  const key = overviewKey(scope, row);
  if (!isForced && overview.key === key && !overview.error && Date.now() - overview.at < OVERVIEW_FRESH_MS) return;
  panel.set({ overview: { ...(overview.key === key ? overview : EMPTY_OVERVIEW), key, loading: true, error: "" } });
  cx.spawn(async (cx) => {
    const data = await loadOverview(panel.proxies, cx, scope, row).catch((error) => ({ error: String(error?.message ?? error) }));
    if (panel.state.overview.key !== key) return;
    panel.set({ overview: { key, loading: false, error: data.error ?? "", data: data.error ? panel.state.overview.data : data, at: Date.now() } });
    cx.notify();
  });
}

function loadTab(panel, cx, isForced) {
  const tab = panel.state.drawer?.tab;
  if (!tab) return;
  if (TEXT_TABS.has(tab)) browse.openDetail(panel, tab, cx);
  else browse.closeDetail(panel);
  loadOverviewData(panel, cx, isForced);
}

export function openDrawer(panel, tab, cx) {
  const { scope } = panel.state;
  const row = browse.selectedRow(panel);
  if (!row || !canOpen(scope.resource)) {
    panel.set({ message: row ? `No details for ${scope.resource}.` : "Select a row first." });
    return;
  }
  const allowed = tabsFor(scope.resource).map((one) => one.key);
  const wanted = tab ?? panel.state.drawer?.tab ?? "overview";
  panel.set({ drawer: { tab: allowed.includes(wanted) ? wanted : "overview", rowId: row.id, revealed: false, token: 0 }, lastRow: row, message: "" });
  reveal(panel, cx);
  loadTab(panel, cx, false);
  cx.notify();
}

export function closeDrawer(panel) {
  browse.closeDetail(panel);
  panel.set({ drawer: null, write: null });
}

export function setTab(panel, tab, cx) {
  if (!panel.state.drawer || panel.state.drawer.tab === tab) return;
  panel.set({ drawer: { ...panel.state.drawer, tab } });
  reveal(panel, cx);
  loadTab(panel, cx, false);
}

export function cycleTab(panel, step, cx) {
  const tabs = tabsFor(panel.state.scope.resource);
  const at = tabs.findIndex((one) => one.key === panel.state.drawer?.tab);
  setTab(panel, tabs[(at + step + tabs.length) % tabs.length].key, cx);
}

export function followSelection(panel, cx) {
  const drawer = panel.state.drawer;
  const row = browse.selectedRow(panel);
  if (!drawer || !row || drawer.rowId === row.id) return;
  panel.set({ drawer: { ...drawer, rowId: row.id }, lastRow: row, write: null });
  reveal(panel, cx);
  loadTab(panel, cx, false);
}

export function refreshDrawer(panel, cx) {
  if (panel.state.drawer) loadTab(panel, cx, true);
}

export function clickRow(panel, id, cx) {
  const isSame = panel.state.selected === id;
  panel.set({ selected: id, message: "" });
  panel.persist();
  if (panel.state.drawer && isSame) closeDrawer(panel);
  else if (panel.state.drawer) followSelection(panel, cx);
  else openDrawer(panel, null, cx);
}
