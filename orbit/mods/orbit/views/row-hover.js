import { div } from "gpui-kit";
import { v_flex, h_flex, HoverCard } from "gpui-base";
import { mono } from "./widgets.js";
import { meter } from "./meter.js";

const OPEN_DELAY_MS = 650;
const CLOSE_DELAY_MS = 120;
const CARD_WIDTH = 300;
const BAR_WIDTH = 110;

export function factLine(t, label, value, color) {
  return h_flex().gap(8).items_center()
    .child(div().w(72).flex_none().text_color(t.dim).child(label))
    .child(div().flex_1().min_w(0).truncate().text_color(color ?? t.foreground).child(value));
}

export function meterLine(t, id, label, spec) {
  return h_flex().gap(8).items_center()
    .child(div().w(72).flex_none().text_color(t.dim).child(label))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(spec.text))
    .child(meter(t, id, { ratio: spec.ratio, width: BAR_WIDTH, height: 5, color: spec.color }));
}

function hoverContent(t, spec) {
  return v_flex().w(CARD_WIDTH).px(10).py(8).gap(4).rounded(8).bg(t.popover).border_1().border_color(t.border).shadow_lg()
    .font_family(mono()).text_size(11).text_color(t.foreground)
    .child(div().truncate().font_bold().text_size(12).child(spec.title))
    .children(spec.lines)
    .child(div().pt(2).text_size(10).text_color(t.dim).child("click or enter for details"));
}

export function listHover(t, rowEl, spec) {
  return HoverCard.new(spec.key).anchor("top_left").open_delay(OPEN_DELAY_MS).close_delay(CLOSE_DELAY_MS)
    .trigger(rowEl).content(hoverContent(t, spec.build()));
}

export function withHover(app, t, rowEl, spec) {
  const card = HoverCard.new(spec.key).anchor("top_left").open_delay(OPEN_DELAY_MS).close_delay(CLOSE_DELAY_MS)
    .trigger(rowEl.on_hover((hovered, cx) => app.hoverRow(spec.id, hovered, cx)));
  return app.hoveredRow === spec.id ? card.content(hoverContent(t, spec.build())) : card;
}
