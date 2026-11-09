import { props, closeOverlay } from "herdr";
import { RESOURCES } from "./kubectl.js";
import * as browse from "./browse-actions.js";
import * as drawer from "./drawer-actions.js";

const ROW_KEYS = {
  w: "followSelected", c: "askAgent", r: "reloadList", g: "openFinder",
  f: "toggleFailing", a: "allNamespaces", n: "rowNamespace", "?": "toggleHelp", "/": "focusFilter",
};
const TAB_KEYS = { o: "overview", e: "events", l: "logs", d: "describe", y: "yaml" };
const WRITE_KEYS = { d: "delete", r: "restart", s: "scale" };

function placeKey(panel, e, cx) {
  const { platform, shift, control, alt } = e.modifiers;
  if (!platform || control || alt) return false;
  if (e.key === "enter" && !shift) panel.togglePlace(cx);
  else if ((e.key === "t" || e.key === "T") && shift) panel.openTab(cx);
  else return false;
  return true;
}

function moveKey(panel, step, cx) {
  browse.moveSelection(panel, step);
  drawer.followSelection(panel, cx);
  return true;
}

function drawerKey(panel, key, isShift, cx) {
  if (key === "tab") {
    drawer.cycleTab(panel, isShift ? -1 : 1, cx);
    return true;
  }
  if (/^[1-5]$/.test(key)) {
    const tab = drawer.tabsFor(panel.state.scope.resource)[Number(key) - 1];
    if (tab) drawer.setTab(panel, tab.key, cx);
    return true;
  }
  if (key === "s") panel.startShell(null, cx);
  else if (key === "r") {
    panel.reloadList(cx);
    drawer.refreshDrawer(panel, cx);
  } else return false;
  return true;
}

export function browseKey(panel, key, isShift, cx) {
  const lower = typeof key === "string" ? key.toLowerCase() : key;
  if (isShift && WRITE_KEYS[lower] && panel.state.drawer) {
    panel.beginWrite(WRITE_KEYS[lower], cx);
    return true;
  }
  if (key === "down" || key === "j") return moveKey(panel, 1, cx);
  if (key === "up" || key === "k") return moveKey(panel, -1, cx);
  if (key === "enter") {
    if (!panel.state.drawer) drawer.openDrawer(panel, null, cx);
    return true;
  }
  if (panel.state.drawer && drawerKey(panel, key, isShift, cx)) return true;
  if (TAB_KEYS[key]) {
    panel.openDrawerTab(TAB_KEYS[key], cx);
    return true;
  }
  const resource = RESOURCES[Number(key) - 1];
  if (/^[1-6]$/.test(key) && resource) {
    panel.switchResource(resource.key, cx);
    return true;
  }
  const action = ROW_KEYS[key];
  if (!action) return false;
  panel[action](cx);
  return true;
}

function clearInput(panel, input, patch) {
  input.set_value("");
  panel.set(patch);
  panel.persist();
}

export function escape(panel, cx) {
  const { drawer: open, picker, help, confirm, filter, query, view, write } = panel.state;
  if (panel.typing.has("target")) panel.handle.focus();
  else if (write) panel.cancelWrite(cx);
  else if (open) panel.closeDetail(cx);
  else if (confirm) panel.set({ confirm: null });
  else if (picker || help) panel.set({ picker: null, help: false });
  else if (view === "browse" && (filter || panel.filterInput.value())) clearInput(panel, panel.filterInput, { filter: "" });
  else if (view === "finder" && query) clearInput(panel, panel.queryInput, { query: "" });
  else if (props()?.overlay) closeOverlay(props().overlay);
}

function finderKey(panel, key, cx) {
  if (key !== "tab" && key !== "v") return false;
  panel.openBrowse(cx, {});
  return true;
}

export function onKey(panel, e, cx) {
  if (placeKey(panel, e, cx)) {
    cx.stop_propagation();
    return;
  }
  if (e.modifiers.platform || e.modifiers.control || e.modifiers.alt) return;
  if (e.key === "escape") {
    escape(panel, cx);
    cx.stop_propagation();
    cx.notify();
    return;
  }
  if (panel.typing.size > 0 && !(panel.state.view === "finder" && e.key === "tab")) return;
  const handled = panel.state.view === "finder" ? finderKey(panel, e.key, cx) : browseKey(panel, e.key, e.modifiers.shift, cx);
  if (handled) {
    cx.stop_propagation();
    cx.notify();
  }
}
