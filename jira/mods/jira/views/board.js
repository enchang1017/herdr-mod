import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { boardView, laneKey, scrollBy } from "../board-nav.js";
import { contentHeight, laneHeight, cardTop, LANE_HEAD, LANE_GAP, CARD_H, CARD_GAP, CELL_PAD, COL_HEAD, BODY_TOP } from "../board-layout.js";
import { OTHER_LANE } from "../board-model.js";
import * as board from "../board-controller.js";
import { boardHeader } from "./board-header.js";
import { boardCard, labelChip, dragGhost } from "./board-card.js";
import { icon, typeIcon, statusPill, categoryColor, errorBox, emptyNote, shade, mono, spinner } from "./widgets.js";

const MOTION = Object.freeze({ duration: 170, easing: "ease-out" });
const WHEEL_QUIET_MS = 250;
const MAP_BAR_W = 160;
const THUMB_MIN = 24;
const BAR_W = 44;
const FALLBACK_VIEW_H = 900;
const CARD_STEP = CARD_H + CARD_GAP;

function columnHead(t, column, count) {
  const color = categoryColor(t, column.category);
  return h_flex().flex_1().min_w(0).h(COL_HEAD - 6).px(8).gap(6).items_center().rounded(6).bg(t.raised).border_b(2).border_color(shade(color, "strong"))
    .child(div().flex_none().w(7).h(7).rounded_full().bg(color))
    .child(div().flex_1().min_w(0).truncate().text_size(10).font_bold().text_color(t.muted).child(column.status.toUpperCase()))
    .child(div().flex_none().px(5).h(15).flex().items_center().rounded(4).bg(shade(color, "soft")).text_size(10).font_semibold().text_color(color).child(String(count)));
}

function columnRow(t, view) {
  const counts = view.columns.map((_column, index) => view.lanes.reduce((sum, lane) => sum + lane.cells[index].length, 0));
  return h_flex().flex_none().h(COL_HEAD).px(14).gap(6).items_center()
    .children(view.columns.map((column, index) => columnHead(t, column, counts[index])));
}

function laneProgress(t, lane) {
  const done = lane.cards.filter((card) => card.category === "done").length;
  const width = Math.round((done / Math.max(1, lane.cards.length)) * BAR_W);
  return h_flex().id(`jira-lp-${lane.id}`).flex_none().gap(5).items_center().tooltip(`${done} of ${lane.cards.length} done`)
    .child(div().w(BAR_W).h(4).rounded(2).bg(t.raised).overflow_hidden().child(div().h_full().w(width).bg(t.ansi2)))
    .child(div().text_size(10).text_color(t.dim).child(`${done}/${lane.cards.length}`));
}

function chevron(app, t, lane) {
  return div().id(`jira-lc-${lane.id}`).flex_none().w(20).h(20).rounded(5).flex().items_center().justify_center().cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => { cx.stop_propagation(); board.toggleLane(app, lane.id, cx); })
    .child(icon(lane.collapsed ? "chevron-right" : "chevron-down", 14, t.muted));
}

function laneTitle(t, lane) {
  const story = lane.story;
  if (!story) return [icon("inbox", 13, t.dim), div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(t.muted).child("No parent / other")];
  return [
    typeIcon(t, story.type, 13),
    div().flex_none().font_family(mono()).text_size(11.5).font_bold().text_color(t.accent).child(story.key),
    div().flex_1().min_w(0).truncate().text_size(12).font_semibold().text_color(t.foreground).child(story.summary),
    statusPill(t, story.status, story.category, 130),
    ...story.labels.map((one) => labelChip(t, one, 10)),
  ];
}

function laneHeader(app, t, lane) {
  const isSelected = app.state.selected === laneKey(lane.id);
  const storyKey = lane.id === OTHER_LANE ? null : lane.id;
  return h_flex().id(`jira-lh-${lane.id}`).flex_none().h(LANE_HEAD).pl(4).pr(10).gap(7).items_center().rounded(8).cursor_pointer()
    .bg(isSelected ? t.selected : t.surface).border_1().border_color(isSelected ? t.accent : t.border)
    .hover((s) => s.bg(t.hover))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => board.clickLane(app, lane.id, storyKey, cx))
    .child(chevron(app, t, lane))
    .children(laneTitle(t, lane))
    .child(laneProgress(t, lane))
    .child(div().flex_none().px(6).h(16).flex().items_center().rounded(8).bg(t.raised).border_1().border_color(t.border).text_size(10).text_color(t.muted)
      .child(lane.hasChildren ? `${lane.cards.length} sub-task${lane.cards.length === 1 ? "" : "s"}` : "no sub-tasks"));
}

function builtWindow(app) {
  const viewH = app.state.boardViewH || FALLBACK_VIEW_H;
  return { top: app.state.boardScroll - viewH, bottom: app.state.boardScroll + viewH * 2 };
}

function cardRows(laneTop, cards, range) {
  const base = cardTop(laneTop, 0);
  const first = Math.max(0, Math.ceil((range.top - base - CARD_H) / CARD_STEP));
  const last = Math.min(cards.length - 1, Math.floor((range.bottom - base) / CARD_STEP));
  return { first, shown: first > last ? [] : cards.slice(first, last + 1) };
}

function cell(app, t, lane, cards, col, place) {
  const drag = app.state.drag;
  const isTarget = Boolean(drag?.moved) && app.state.dropCol === col && col !== drag?.from;
  const { first, shown } = cardRows(place.top, cards, place.range);
  return v_flex().id(`jira-cell-${lane.id}-${col}`).flex_1().min_w(0).p(CELL_PAD).gap(CARD_GAP).rounded(8)
    .bg(isTarget ? shade(t.accent, "soft") : shade(t.muted, "subtle")).border_1()
    .border_color(isTarget ? t.accent : shade(t.muted, "clear")).when(isTarget, (el) => el.border_dashed())
    .on_hover((hovered, cx) => board.hoverDrop(app, col, hovered, cx))
    .on_mouse_up("left", (_e, cx) => board.dropOn(app, col, cx))
    .when(first > 0, (el) => el.child(div().flex_none().h(first * CARD_STEP - CARD_GAP)))
    .children(shown.map((card) => boardCard(app, t, card, col, lane)));
}

function laneBox(app, t, lane, place) {
  const height = laneHeight(lane);
  const box = v_flex().id(`jira-lane-${lane.id}`).flex_none().h(height).overflow_hidden().transition("height", MOTION);
  if (place.top > place.range.bottom || place.top + height < place.range.top) return box;
  return box
    .child(laneHeader(app, t, lane))
    .child(h_flex().flex_none().pt(BODY_TOP).gap(6).items_start()
      .children(lane.cells.map((cards, col) => cell(app, t, lane, cards, col, place))));
}

function scrollThumb(app, t, view) {
  const viewH = app.state.boardViewH;
  const total = contentHeight(view.lanes);
  if (!viewH || total <= viewH) return null;
  const thumb = Math.max(THUMB_MIN, Math.round((viewH * viewH) / total));
  const top = Math.round((app.state.boardScroll / (total - viewH)) * (viewH - thumb));
  return div().absolute().right(2).top(top).w(4).h(thumb).rounded(2).bg(shade(t.dim, "hover"));
}

function lanesArea(app, t, view) {
  const animate = Date.now() - app.state.boardWheelAt > WHEEL_QUIET_MS;
  const range = builtWindow(app);
  return div().id("jira-board-view").relative().flex_1().min_h(0).mx(10).overflow_hidden()
    .on_size_change((size, cx) => app.measureBoard(size, cx))
    .on_scroll_wheel((e, cx) => scrollBy(app, -e.delta.y, cx))
    .on_mouse_move((e, cx) => board.trackDrag(app, e, cx))
    .on_mouse_up("left", (_e, cx) => board.endDrag(app, cx))
    .on_hover((hovered, cx) => { if (!hovered) board.endDrag(app, cx); })
    .child(v_flex().id("jira-board-lanes").absolute().left(0).right(0).top(-app.state.boardScroll).px(4).gap(LANE_GAP)
      .when(animate, (el) => el.transition("top", MOTION))
      .children(view.lanes.map((lane, index) => laneBox(app, t, lane, { top: view.tops[index], range }))))
    .child(scrollThumb(app, t, view) ?? div())
    .child(dragGhost(app, t) ?? div());
}

function loadingNote(t, title) {
  return v_flex().mx(14).mt(14).px(14).py(16).gap(6).items_center().rounded(10).border_1().border_dashed().border_color(t.border)
    .child(spinner(t, title))
    .child(div().text_size(11).text_color(t.dim).child("First load maps every story's sub-tasks; later opens come from the cache."));
}

function mappingBar(app, t) {
  const p = app.state.boardProgress;
  if (!p?.total) return null;
  return h_flex().mx(14).mt(8).gap(8).items_center().text_size(11)
    .child(spinner(t, `mapping sub-tasks ${p.done}/${p.total}`))
    .child(div().flex_none().w(MAP_BAR_W).h(4).rounded(2).bg(t.border).overflow_hidden()
      .child(div().id("jira-map-fill").h_full().bg(t.accent).w(Math.round((p.done / p.total) * MAP_BAR_W)).transition("width", MOTION)));
}

function emptyBoard(app, t) {
  if (app.loadState().loading && !app.state.boardEntry) return loadingNote(t, "Reading the active sprint\u{2026}");
  if (app.state.boardEntry?.items.length) return emptyNote(t, "search", "No cards match these filters", "x clears labels/people/mine, esc clears search");
  return emptyNote(t, "inbox", "Nothing in the active sprint", "");
}

export function boardBody(app, t) {
  const view = boardView(app);
  return v_flex().id("jira-board").flex_1().min_h(0).mx(10).mb(4).rounded(10).border_1().border_color(t.border).bg(t.background).overflow_hidden()
    .child(boardHeader(app, t))
    .child(mappingBar(app, t) ?? div())
    .when(Boolean(app.loadState().error), (el) => el.child(errorBox(t, "jira-board-error", app.loadState().error, (_e, cx) => app.refresh(cx))))
    .when(view.lanes.length > 0, (el) => el.child(columnRow(t, view)).child(lanesArea(app, t, view)))
    .when(view.lanes.length === 0, (el) => el.child(emptyBoard(app, t)));
}
