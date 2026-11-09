import { columnsOf, lanesOf, visibleLanes, cellsOf, OTHER_LANE } from "./board-model.js";
import { laneTops, cardTop, revealed, clampScroll, LANE_HEAD, CARD_H } from "./board-layout.js";
import * as act from "./actions.js";

const LANE_PREFIX = "lane:";

export const laneKey = (id) => `${LANE_PREFIX}${id}`;
export const isLaneKey = (key) => String(key ?? "").startsWith(LANE_PREFIX);

export function issueKeyOf(selected) {
  if (!isLaneKey(selected)) return selected ?? null;
  const id = selected.slice(LANE_PREFIX.length);
  return id === OTHER_LANE ? null : id;
}

export function filtersOf(app) {
  return { ...app.state.boardFilter, me: app.state.me, text: app.state.filter };
}

export function boardView(app) {
  const entry = app.state.boardEntry;
  const columns = columnsOf(entry?.items ?? []);
  const collapsed = new Set(app.state.collapsed);
  const lanes = visibleLanes(lanesOf(entry), filtersOf(app))
    .map((lane) => ({ ...lane, collapsed: collapsed.has(lane.id), cells: cellsOf(lane, columns) }));
  return { entry, columns, lanes, tops: laneTops(lanes) };
}

export function visibleCards(view) {
  return view.lanes.flatMap((lane) => lane.cells.flat());
}

function locate(view, selected) {
  return view.lanes.reduce((found, lane, index) => {
    if (found) return found;
    if (laneKey(lane.id) === selected) return { lane: index, header: true };
    const col = lane.cells.findIndex((cards) => cards.some((card) => card.key === selected));
    if (col < 0) return null;
    if (lane.collapsed) return { lane: index, header: true };
    return { lane: index, col, row: lane.cells[col].findIndex((card) => card.key === selected) };
  }, null);
}

function nearestCol(lane, col) {
  const order = lane.cells.map((_cards, index) => index).sort((a, b) => Math.abs(a - col) - Math.abs(b - col) || a - b);
  return order.find((index) => lane.cells[index].length > 0) ?? -1;
}

function stops(view, col) {
  return view.lanes.flatMap((lane, index) => {
    const at = lane.collapsed ? -1 : nearestCol(lane, col);
    const cards = at < 0 ? [] : lane.cells[at].map((_card, row) => ({ lane: index, col: at, row }));
    return [{ lane: index, header: true }, ...cards];
  });
}

function stopKey(view, stop) {
  const lane = view.lanes[stop.lane];
  return stop.header ? laneKey(lane.id) : lane.cells[stop.col][stop.row].key;
}

function select(app, view, stop, cx) {
  const key = stopKey(view, stop);
  const top = stop.header ? view.tops[stop.lane] : cardTop(view.tops[stop.lane], stop.row);
  const height = stop.header ? LANE_HEAD : CARD_H;
  const scroll = clampScroll(revealed(app.state.boardScroll, top, height, app.state.boardViewH), view.lanes, app.state.boardViewH);
  app.set({ selected: key, boardScroll: scroll, ...(stop.header ? {} : { boardCol: stop.col }) });
  app.persist();
  const issueKey = issueKeyOf(key);
  if (app.state.drawer && issueKey && app.state.drawer.key !== issueKey) act.openDrawer(app, issueKey, cx);
  cx.notify();
  return true;
}

export function moveVertical(app, step, cx) {
  const view = boardView(app);
  if (!view.lanes.length) return true;
  const pos = locate(view, app.state.selected);
  const list = stops(view, pos && !pos.header ? pos.col : app.state.boardCol);
  const at = list.findIndex((stop) => stopKey(view, stop) === app.state.selected);
  const next = at < 0 ? 0 : Math.max(0, Math.min(list.length - 1, at + step));
  return select(app, view, list[next], cx);
}

export function moveHorizontal(app, step, cx) {
  const view = boardView(app);
  const pos = locate(view, app.state.selected);
  if (!pos) return moveVertical(app, 1, cx);
  const lane = view.lanes[pos.lane];
  if (pos.header) {
    const col = step > 0 && !lane.collapsed ? nearestCol(lane, app.state.boardCol) : -1;
    return col < 0 ? true : select(app, view, { lane: pos.lane, col, row: 0 }, cx);
  }
  const targets = lane.cells.map((_cards, index) => index).filter((index) => (step > 0 ? index > pos.col : index < pos.col) && lane.cells[index].length);
  const col = step > 0 ? targets[0] : targets[targets.length - 1];
  if (col === undefined) return true;
  return select(app, view, { lane: pos.lane, col, row: Math.min(pos.row, lane.cells[col].length - 1) }, cx);
}

export function selectedLaneId(app) {
  const view = boardView(app);
  const pos = locate(view, app.state.selected);
  return pos ? view.lanes[pos.lane].id : null;
}

export function ensureSelection(app) {
  const view = boardView(app);
  if (!view.lanes.length || locate(view, app.state.selected)) return;
  const first = view.lanes[0];
  const col = first.collapsed ? -1 : nearestCol(first, app.state.boardCol);
  app.set({ selected: col < 0 ? laneKey(first.id) : first.cells[col][0].key, ...(col < 0 ? {} : { boardCol: col }) });
}

export function scrollBy(app, delta, cx) {
  const view = boardView(app);
  const next = clampScroll(app.state.boardScroll + delta, view.lanes, app.state.boardViewH);
  if (next === app.state.boardScroll) return;
  app.set({ boardScroll: next, boardWheelAt: Date.now() });
  cx.notify();
}
