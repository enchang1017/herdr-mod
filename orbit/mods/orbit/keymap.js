import * as act from "./actions.js";
import * as dbAct from "./db-actions.js";
import { moveCursor, openDrawer } from "./selection.js";

const TAB_KEYS = { 1: "resources", 2: "logs", 3: "traces", 4: "db" };
const MOVES = { j: 1, down: 1, k: -1, up: -1 };

function placeKey(panel, e, cx) {
  const { platform, shift, control, alt } = e.modifiers;
  if (!platform || control || alt) return false;
  if (e.key === "enter" && !shift) panel.togglePlace(cx);
  else if ((e.key === "t" || e.key === "T") && shift) panel.openTab(cx);
  else return false;
  return true;
}

function resourceKey(panel, key, cx) {
  const row = act.selectedResource(panel);
  if (key === "l") panel.logsOf(row?.name, cx);
  else if (key === "o") panel.openUrl(row?.url, cx);
  else if (key === "R") act.requestAction(panel, "restart", cx);
  else if (key === "S") act.requestAction(panel, "stop", cx);
  else return false;
  return true;
}

function logKey(panel, key, cx) {
  if (key === "f") panel.toggle("follow", cx);
  else if (key === "c") act.askLogs(panel, cx);
  else if (key === "]" || key === "j" || key === "down") panel.stepLogResource(1, cx);
  else if (key === "[" || key === "k" || key === "up") panel.stepLogResource(-1, cx);
  else return false;
  return true;
}

function traceKey(panel, key, cx) {
  if (key === "e") panel.toggle("errorsOnly", cx);
  else if (key === "h") panel.toggle("includeHealth", cx);
  else if (key === "c") act.askTrace(panel, cx);
  else if (key === "o") openDrawer(panel, cx);
  else return false;
  return true;
}

function dbKey(panel, key, cx) {
  if (key === "c") dbAct.askDb(panel, cx);
  else return false;
  return true;
}

const TAB_HANDLERS = { resources: resourceKey, logs: logKey, traces: traceKey, db: dbKey };
const LISTS = new Set(["resources", "traces", "db"]);

function listKey(panel, key, cx) {
  if (!LISTS.has(panel.state.tab)) return false;
  if (MOVES[key]) moveCursor(panel, MOVES[key], cx);
  else if (key === "enter") openDrawer(panel, cx);
  else return false;
  return true;
}

function handleKey(panel, key, cx) {
  if (TAB_KEYS[key]) { panel.setTab(TAB_KEYS[key], cx); return true; }
  if (key === "r") { panel.refresh(cx); return true; }
  if (key === "/") { panel.focusFilter(cx); return panel.state.tab === "logs"; }
  if (listKey(panel, key, cx)) return true;
  return TAB_HANDLERS[panel.state.tab]?.(panel, key, cx) ?? false;
}

export function onKey(panel, e, cx) {
  if (placeKey(panel, e, cx)) { cx.stop_propagation(); return; }
  if (e.modifiers.platform || e.modifiers.control || e.modifiers.alt) return;
  if (e.key === "escape") {
    panel.escape(cx);
    cx.stop_propagation();
    cx.notify();
    return;
  }
  if (panel.typing.size > 0) return;
  const key = e.modifiers.shift && e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (handleKey(panel, key, cx)) {
    cx.stop_propagation();
    cx.notify();
  }
}
