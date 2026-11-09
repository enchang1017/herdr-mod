import { moveVertical, moveHorizontal } from "./board-nav.js";
import * as board from "./board-controller.js";

const VERTICAL = { j: 1, down: 1, k: -1, up: -1 };
const HORIZONTAL = { h: -1, left: -1, l: 1, right: 1 };
const MOVE = { "[": -1, "]": 1 };

function chipKey(app, e, cx) {
  const chips = board.filterChips(app);
  const at = Math.min(app.state.labelFocus, Math.max(0, chips.length - 1));
  const step = HORIZONTAL[e.key] ?? (e.key === "tab" ? (e.modifiers?.shift ? -1 : 1) : 0);
  if (step) app.set({ labelFocus: Math.max(0, Math.min(chips.length - 1, at + step)) });
  else if (e.key === "space" || e.key === "enter") board.toggleChip(app, chips[at], cx);
  else if (e.key === "x") board.clearFilters(app, cx);
  else if (e.key === "u") board.toggleMine(app, cx);
  else if (isShifted(e, "l") || VERTICAL[e.key]) app.set({ labelFocus: null });
  else return false;
  return true;
}

function isShifted(e, letter) {
  return e.key_char === letter.toUpperCase() || (e.key === letter && Boolean(e.modifiers?.shift));
}

function shiftedKey(app, e, cx) {
  if (isShifted(e, "l")) {
    app.set({ labelFocus: 0 });
    return true;
  }
  if (isShifted(e, "z")) return board.toggleAllLanes(app, cx);
  if (isShifted(e, "r")) {
    board.loadBoard(app, cx, "remap");
    return true;
  }
  return null;
}

function plainKey(app, key, cx) {
  if (VERTICAL[key]) return moveVertical(app, VERTICAL[key], cx);
  if (HORIZONTAL[key]) return moveHorizontal(app, HORIZONTAL[key], cx);
  if (MOVE[key]) return board.moveSelected(app, MOVE[key], cx);
  if (key === "space" || key === "z") return board.toggleSelectedLane(app, cx);
  if (key === "u") { board.toggleMine(app, cx); return true; }
  if (key === "x") { board.clearFilters(app, cx); return true; }
  if (key === "enter" && !app.state.action && !app.state.drawer) return board.openSelected(app, cx);
  return false;
}

export function boardKey(app, e, cx) {
  if (app.state.view !== "board") return false;
  if (app.state.labelFocus !== null) return chipKey(app, e, cx);
  const shifted = shiftedKey(app, e, cx);
  if (shifted !== null) return shifted;
  if (app.state.action?.stage === "confirm" && e.key === "enter") return false;
  return plainKey(app, e.key, cx);
}
