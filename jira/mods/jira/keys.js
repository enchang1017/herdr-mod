import { props, closeOverlay } from "herdr";
import { VIEWS } from "./queries.js";
import * as act from "./actions.js";
import { boardKey } from "./board-keys.js";
import { closePicker, movePick, chooseHighlighted } from "./board-picker.js";

const PICK_STEP = { up: -1, down: 1, k: -1, j: 1 };

const ISSUE_KEYS = { c: act.copyKey, b: act.copyBranch, o: act.browse, d: act.startDev };
const WRITE_KEYS = { t: "transition", m: "comment" };

function placeKey(app, e, cx) {
  const { platform, shift, control, alt } = e.modifiers ?? {};
  if (!platform || control || alt) return false;
  if (e.key === "enter" && !shift) app.togglePlace(cx);
  else if ((e.key === "t" || e.key === "T") && shift) app.openTab(cx);
  else return false;
  return true;
}

export function escape(app, cx) {
  const { action, drawer, filter } = app.state;
  if (app.state.picker) {
    if (!app.state.picker.saving) closePicker(app, cx);
  } else if (action && action.stage !== "running") {
    act.cancelAction(app, cx);
    if (app.typing.size) app.blur(cx);
  } else if (app.typing.size) app.blur(cx);
  else if (app.state.labelFocus !== null) app.set({ labelFocus: null });
  else if (drawer) act.closeDrawer(app, cx);
  else if (filter || app.filterInput.value()) app.clearFilter(cx);
  else if (props()?.overlay) closeOverlay(props().overlay);
}

function digitKey(app, key, cx) {
  const index = Number(key) - 1;
  const action = app.state.action;
  if (action?.kind === "transition" && action.stage === "pick") {
    const one = app.sortedStatuses()[index];
    if (one) act.pickStatus(app, one.status, cx);
    return true;
  }
  const view = VIEWS[index];
  if (view && index < VIEWS.length) app.pickView(view.key, cx);
  return Boolean(view);
}

function enterKey(app, cx) {
  if (app.state.action?.stage === "confirm") act.confirmAction(app, cx);
  else if (!app.state.drawer) act.openDrawer(app, app.state.selected, cx);
  return true;
}

function issueKey(app, key, cx) {
  if (ISSUE_KEYS[key]) {
    ISSUE_KEYS[key](app, cx);
    return true;
  }
  if (!app.state.drawer) return false;
  if (WRITE_KEYS[key]) act.beginAction(app, WRITE_KEYS[key], cx);
  else if (key === "a") act.beginAction(app, app.assignKind(), cx);
  else return false;
  return true;
}

export function rowKey(app, key, cx) {
  if (key === "down" || key === "j") return app.move(1, cx);
  if (key === "up" || key === "k") return app.move(-1, cx);
  if (key === "enter") return enterKey(app, cx);
  if (/^[1-9]$/.test(key)) return digitKey(app, key, cx);
  if (key === "/") return app.focusFilter(cx);
  if (key === "r") return app.refreshAll(cx);
  return issueKey(app, key, cx);
}

function isBoardPickKey(e) {
  return e.key_char === "B" || (e.key === "b" && Boolean(e.modifiers?.shift));
}

function pickerKey(app, e, cx) {
  const typing = app.typing.has("picker");
  const step = typing ? (e.key === "up" ? -1 : e.key === "down" ? 1 : 0) : PICK_STEP[e.key] ?? 0;
  if (step) return movePick(app, step, cx);
  if (typing) return false;
  if (e.key === "enter") return chooseHighlighted(app, cx);
  if (e.key === "/") {
    app.pickerInput.focus();
    return true;
  }
  return true;
}

export function onKey(app, e, cx) {
  if (placeKey(app, e, cx)) {
    cx.stop_propagation();
    return;
  }
  const { platform, control, alt } = e.modifiers ?? {};
  if (platform || control || alt) return;
  if (e.key === "escape") {
    escape(app, cx);
    cx.stop_propagation();
    cx.notify();
    return;
  }
  if (app.state.picker) {
    if (pickerKey(app, e, cx)) {
      cx.stop_propagation();
      cx.notify();
    }
    return;
  }
  if (app.typing.size) return;
  if (isBoardPickKey(e)) {
    app.openPicker(cx);
    cx.stop_propagation();
    return;
  }
  if (boardKey(app, e, cx) || rowKey(app, e.key, cx)) {
    cx.stop_propagation();
    cx.notify();
  }
}
