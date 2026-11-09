import { errorText } from "./acli.js";
import { peekBoard } from "./data.js";
import { fetchBoard } from "./board-data.js";
import { lanesOf, labelsOf, assigneesOf, columnIndexOf } from "./board-model.js";
import { boardView, ensureSelection, selectedLaneId, issueKeyOf, laneKey, isLaneKey } from "./board-nav.js";
import { clampScroll } from "./board-layout.js";
import { loadOf, patchLoad } from "./loads.js";
import * as act from "./actions.js";

const DRAG_START_PX = 5;
const BOARD = "board";
const NO_FILTER = Object.freeze({ labels: Object.freeze([]), assignees: Object.freeze([]), onlyMine: false });

export { NO_FILTER };

function adopt(app, entry) {
  const rows = [...entry.items];
  app.set({ boardEntry: entry, rows, at: entry.at });
}

export function showCachedBoard(app) {
  const entry = peekBoard();
  if (entry && !app.state.boardEntry) adopt(app, entry);
}

function afterBoard(app, cx) {
  if (app.state.view !== "board") return;
  ensureSelection(app);
  if (app.state.auth === "ok") app.learnMe(cx);
}

export function loadBoard(app, cx, force) {
  const cached = peekBoard();
  if (cached) adopt(app, cached);
  if (loadOf(app, BOARD).loading) return;
  patchLoad(app, BOARD, { loading: true, triedAt: Date.now() });
  cx.spawn(async (cx) => {
    try {
      if (await app.ensureAuth()) {
        const onStep = (partial, progress) => {
          if (partial && app.state.view === "board") adopt(app, partial);
          app.set({ boardProgress: progress });
          cx.notify();
        };
        const entry = await fetchBoard(force, onStep);
        if (app.state.view === "board") adopt(app, entry);
      }
      patchLoad(app, BOARD, { error: "" });
    } catch (e) {
      if (e.auth) app.set({ auth: "login" });
      patchLoad(app, BOARD, { error: e.auth ? "" : errorText(e) });
    } finally {
      patchLoad(app, BOARD, { loading: false });
      app.set({ boardProgress: null });
      afterBoard(app, cx);
      cx.notify();
    }
  });
  cx.notify();
}

function setFilter(app, patch, cx) {
  app.set({ boardFilter: { ...app.state.boardFilter, ...patch }, boardScroll: 0 });
  ensureSelection(app);
  app.persist();
  cx.notify();
}

const toggled = (list, value) => (list.includes(value) ? list.filter((one) => one !== value) : [...list, value]);

export function toggleLabel(app, name, cx) { setFilter(app, { labels: toggled(app.state.boardFilter.labels, name) }, cx); }
export function toggleAssignee(app, name, cx) { setFilter(app, { assignees: toggled(app.state.boardFilter.assignees, name) }, cx); }
export function toggleMine(app, cx) { setFilter(app, { onlyMine: !app.state.boardFilter.onlyMine }, cx); }
export function clearFilters(app, cx) { setFilter(app, NO_FILTER, cx); }

export function filterChips(app) {
  const entry = app.state.boardEntry;
  return [...labelsOf(entry).map((one) => ({ kind: "label", ...one })), ...assigneesOf(entry).map((one) => ({ kind: "assignee", ...one }))];
}

export function toggleChip(app, chip, cx) {
  if (chip?.kind === "label") toggleLabel(app, chip.name, cx);
  else if (chip?.kind === "assignee") toggleAssignee(app, chip.name, cx);
}

function setCollapsed(app, collapsed, cx) {
  app.set({ collapsed });
  const view = boardView(app);
  const laneId = selectedLaneId(app);
  const hidden = laneId && collapsed.includes(laneId) && !isLaneKey(app.state.selected);
  app.set({ boardScroll: clampScroll(app.state.boardScroll, view.lanes, app.state.boardViewH), ...(hidden ? { selected: laneKey(laneId) } : {}) });
  app.persist();
  cx.notify();
}

export function toggleLane(app, laneId, cx) {
  if (laneId) setCollapsed(app, toggled(app.state.collapsed, laneId), cx);
}

export function toggleSelectedLane(app, cx) {
  toggleLane(app, selectedLaneId(app), cx);
  return true;
}

export function toggleAllLanes(app, cx) {
  const all = lanesOf(app.state.boardEntry).map((lane) => lane.id);
  setCollapsed(app, app.state.collapsed.length >= all.length ? [] : all, cx);
  return true;
}

export function openSelected(app, cx) {
  const key = issueKeyOf(app.state.selected);
  if (key) act.openDrawer(app, key, cx);
  return true;
}

export function clickLane(app, laneId, storyKey, cx) {
  app.set({ selected: laneKey(laneId) });
  app.handle.focus();
  if (storyKey) act.openDrawer(app, storyKey, cx);
  cx.notify();
}

export function requestMove(app, key, column, cx) {
  const issue = act.issueOf(app, key);
  if (!issue || !column) return;
  if (columnIndexOf([column], issue.status) === 0) return act.flash(app, `${key} is already ${issue.status}`, cx);
  app.set({ selected: key });
  act.openDrawer(app, key, cx);
  act.pickStatus(app, column.status, cx);
}

export function moveSelected(app, step, cx) {
  const key = app.state.selected;
  if (!key || isLaneKey(key)) return true;
  const view = boardView(app);
  const issue = view.lanes.flatMap((lane) => lane.cards).find((card) => card.key === key);
  const target = issue ? view.columns[columnIndexOf(view.columns, issue.status) + step] : null;
  if (target) requestMove(app, key, target, cx);
  else act.flash(app, issue ? "No column that way" : "Select a card first", cx);
  return true;
}

export function startDrag(app, key, col, event, cx) {
  app.set({ drag: { key, from: col, x0: event.position.x, y0: event.position.y, x: 0, y: 0, moved: false }, dropCol: null });
  cx.notify();
}

export function trackDrag(app, event, cx) {
  const drag = app.state.drag;
  if (!drag) return;
  const moved = drag.moved || Math.hypot(event.position.x - drag.x0, event.position.y - drag.y0) > DRAG_START_PX;
  app.set({ drag: { ...drag, moved, x: event.local_position.x, y: event.local_position.y } });
  if (moved) cx.notify();
}

export function hoverDrop(app, col, hovered, cx) {
  if (!app.state.drag) return;
  if (hovered) app.set({ dropCol: col });
  else if (app.state.dropCol === col) app.set({ dropCol: null });
  cx.notify();
}

export function dropOn(app, col, cx) {
  const drag = app.state.drag;
  app.set({ drag: null, dropCol: null });
  if (drag?.moved && col !== drag.from) requestMove(app, drag.key, boardView(app).columns[col], cx);
  cx.notify();
}

export function endDrag(app, cx) {
  if (!app.state.drag) return;
  app.set({ drag: null, dropCol: null });
  cx.notify();
}
