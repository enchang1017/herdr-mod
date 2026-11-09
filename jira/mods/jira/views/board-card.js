import { div } from "gpui-kit";
import { v_flex, h_flex, HoverCard } from "gpui-base";
import { CARD_H } from "../board-layout.js";
import * as board from "../board-controller.js";
import { icon, typeLook, typeIcon, priorityIcon, statusPill, avatar, shade, mono } from "./widgets.js";

const OPEN_DELAY_MS = 700;
const CLOSE_DELAY_MS = 120;
const HOVER_WIDTH = 300;
const PALETTE = ["ansi3", "ansi6", "ansi5", "ansi4", "ansi1", "ansi2"];

export function labelColor(t, name) {
  const hash = [...String(name)].reduce((x, ch) => (((x * 33) ^ ch.codePointAt(0)) >>> 0), 5381);
  return t[PALETTE[hash % PALETTE.length]] ?? t.accent;
}

export function labelChip(t, name, size = 9.5) {
  const color = labelColor(t, name);
  return div().flex_none().h(size + 6).px(5).flex().items_center().rounded(4).bg(shade(color, "soft")).border_1().border_color(shade(color, "border"))
    .text_size(size).font_semibold().text_color(color).child(name);
}

function fact(t, label, value, color) {
  return h_flex().gap(8).items_center()
    .child(div().w(60).flex_none().text_color(t.dim).child(label))
    .child(div().flex_1().min_w(0).truncate().text_color(color ?? t.foreground).child(value));
}

function hoverContent(t, card, lane) {
  return v_flex().w(HOVER_WIDTH).px(12).py(10).gap(5).rounded(10).bg(t.popover).border_1().border_color(t.border).shadow_lg()
    .text_size(11).text_color(t.foreground)
    .child(h_flex().gap(6).items_center().child(typeIcon(t, card.type)).child(div().font_bold().text_size(12).child(card.key))
      .child(div().flex_1()).child(statusPill(t, card.status, card.category)))
    .child(div().text_size(12).child(card.summary))
    .when(Boolean(lane.story) && lane.story.key !== card.key, (el) => el.child(fact(t, "parent", `${lane.story?.key} ${lane.story?.summary}`, t.ansi2)))
    .child(fact(t, "assignee", card.assignee || "Unassigned", card.assignee ? t.foreground : t.dim))
    .child(fact(t, "priority", card.priority || "none"))
    .when(card.labels.length > 0, (el) => el.child(h_flex().gap(4).flex_wrap().children(card.labels.map((one) => labelChip(t, one)))))
    .child(div().pt(2).text_size(10).text_color(t.dim).child("click / \u{21b5} drawer \u{b7} drag or [ ] to move"));
}

function withHover(app, t, element, card, lane) {
  const hover = HoverCard.new(`jira-bh-${card.key}`).anchor("top_left").open_delay(OPEN_DELAY_MS).close_delay(CLOSE_DELAY_MS)
    .trigger(element.on_hover((hovered, cx) => app.hoverRow(card.key, hovered, cx)));
  return app.hovered === card.key && !app.state.drag ? hover.content(hoverContent(t, card, lane)) : hover;
}

function footer(t, card, isSelected) {
  const look = typeLook(t, card.type);
  const isDone = card.category === "done";
  return h_flex().flex_none().h(18).gap(5).items_center()
    .child(icon(look.name, 12, look.color))
    .child(div().font_family(mono()).text_size(10.5).font_semibold().text_color(isSelected ? t.accent : isDone ? t.dim : t.muted).child(card.key))
    .when(isDone, (el) => el.child(icon("check", 11, t.ansi2)))
    .child(div().flex_1())
    .child(priorityIcon(t, card.priority, 12))
    .child(avatar(t, card.assignee, 18));
}

function cardLook(app, t, card) {
  const isSelected = card.key === app.state.selected;
  const isOpen = app.state.drawer?.key === card.key;
  const isDragged = Boolean(app.state.drag?.moved) && app.state.drag?.key === card.key;
  return { isSelected, isOpen, isDragged, bg: isOpen ? shade(t.accent, "soft") : isSelected ? t.selected : t.surface, border: isSelected ? t.accent : t.border };
}

export function boardCard(app, t, card, col, lane) {
  const look = cardLook(app, t, card);
  const element = v_flex().id(`jira-bc-${card.key}`).flex_none().h(CARD_H).px(9).py(6).gap(4).rounded(8).overflow_hidden()
    .bg(look.bg).border_1().border_color(look.border).cursor_pointer()
    .when(look.isSelected, (el) => el.shadow_lg())
    .when(card.category === "done" && !look.isSelected, (el) => el.opacity(0.7))
    .when(look.isDragged, (el) => el.opacity(0.3))
    .hover((s) => s.bg(t.hover).border_color(look.isSelected ? t.accent : shade(t.accent, "border")))
    .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); board.startDrag(app, card.key, col, e, cx); })
    .on_click((_e, cx) => app.clickRow(card.key, cx))
    .child(div().flex_none().h(30).overflow_hidden().text_size(11.5).font_semibold().text_color(t.foreground).child(card.summary))
    .child(h_flex().flex_none().h(16).gap(4).items_center().overflow_hidden().children(card.labels.map((one) => labelChip(t, one))))
    .child(footer(t, card, look.isSelected));
  return withHover(app, t, element, card, lane);
}

export function dragGhost(app, t) {
  const drag = app.state.drag;
  const card = drag?.moved ? app.state.rows.find((one) => one.key === drag.key) : null;
  if (!card) return null;
  const target = app.state.dropCol;
  return h_flex().absolute().left(drag.x + 12).top(drag.y + 10).h(26).px(9).gap(6).items_center().rounded(8)
    .bg(t.popover).border_1().border_color(t.accent).shadow_lg().opacity(0.95)
    .child(typeIcon(t, card.type, 12))
    .child(div().font_family(mono()).text_size(11).font_bold().text_color(t.accent).child(card.key))
    .child(div().max_w(180).truncate().text_size(11).text_color(t.foreground).child(card.summary))
    .when(target !== null && target !== drag.from, (el) => el.child(icon("arrow-right", 12, t.ansi3)));
}
