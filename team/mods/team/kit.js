import { div } from "gpui-kit";
import { h_flex, v_flex, Input } from "gpui-base";
import { ICONS, icon } from "./icons.js";
import { shade } from "./tokens.js";

export { ICONS, icon, shade };

function buttonLook(t, opts) {
  if (opts.disabled) return { bg: t.surface, border: t.border, text: t.dim, hover: t.surface };
  if (opts.primary) return { bg: t.solid, border: t.solid, text: t.solid_foreground, hover: t.solid };
  if (opts.active) return { bg: t.selected, border: t.accent, text: t.foreground, hover: t.selected };
  if (opts.ghost) return { bg: shade(t.background, "clear"), border: shade(t.background, "clear"), text: t.muted, hover: t.hover };
  return { bg: t.raised, border: t.border, text: t.foreground, hover: t.hover };
}

export function button(id, label, t, onClick, opts = {}) {
  const look = buttonLook(t, opts);
  return div().id(id).h(opts.small ? 20 : 24).px(opts.small ? 6 : 9).flex().flex_none().items_center().rounded(6).text_size(opts.small ? 10.5 : 11)
    .border_1().border_color(look.border).bg(look.bg).text_color(look.text)
    .when(Boolean(opts.tooltip), (e) => e.tooltip(opts.tooltip))
    .when(!opts.disabled, (e) => e.cursor_pointer().hover((s) => s.bg(look.hover)).on_click((ev, cx) => onClick(ev, cx)))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(label);
}

export function chip(t, text, color, variant = "tint") {
  const el = div().flex_none().h(18).px(6).flex().items_center().rounded(5).text_size(10.5).font_semibold().whitespace_nowrap();
  if (variant === "solid") return el.bg(color).text_color(t.background).child(text);
  if (variant === "outline") return el.border_1().border_color(color).text_color(color).child(text);
  return el.bg(shade(color, "soft")).text_color(color).child(text);
}

export function card(t, id) {
  return v_flex().id(id).flex_none().rounded(10).border_1().border_color(t.border).bg(t.background).overflow_hidden();
}

export function cardHeader(t, spec) {
  return h_flex().h(32).flex_none().px(10).gap(8).items_center().bg(t.surface).border_b(1).border_color(t.border)
    .child(icon(spec.icon, 13, spec.color ?? t.accent))
    .child(div().flex_none().font_bold().text_size(12).text_color(t.foreground).child(spec.title))
    .children(spec.chips ?? [])
    .child(div().flex_1())
    .when(Boolean(spec.meta), (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child(spec.meta ?? "")))
    .children(spec.actions ?? []);
}

export function tabs(t, id, items, current, onPick) {
  return h_flex().id(id).flex_none().p(2).gap(2).rounded(7).bg(t.surface).border_1().border_color(t.border)
    .children(items.map(([key, label]) => div().id(`${id}-${key}`).h(22).px(10).flex().items_center().rounded(5).text_size(11).cursor_pointer()
      .when(key === current, (e) => e.bg(t.solid).text_color(t.solid_foreground).font_semibold())
      .when(key !== current, (e) => e.text_color(t.muted).hover((s) => s.bg(t.hover)))
      .on_click((ev, cx) => onPick(key, ev, cx))
      .child(label)));
}

export function targetField(t, id, input, hint) {
  return h_flex().id(id).flex_1().min_w(90).h(24).px(7).gap(6).items_center().rounded(6).border_1().border_color(t.border).bg(t.surface)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(icon(ICONS.agent, 13, t.accent))
    .child(div().flex_1().min_w(0).child(Input.new(input).h_full().text_size(11).text_color(t.foreground)))
    .when(Boolean(hint), (el) => el.child(div().flex_none().max_w(120).truncate().text_size(10).text_color(t.dim).child(hint ?? "")));
}

const LABEL_W = 64;

function fieldTitle(t, label) {
  return div().flex_none().text_size(10.5).font_bold().text_color(t.dim).child(label);
}

export function labeled(t, label, content, inline) {
  if (inline) return h_flex().gap(8).items_center().child(fieldTitle(t, label).w(LABEL_W)).child(content);
  return v_flex().gap(3).child(fieldTitle(t, label)).child(content);
}

export function field(t, id, label, input, inline, extras = []) {
  const box = h_flex().id(id).flex_1().min_w(0).h(26).px(8).items_center().rounded(6).border_1().border_color(t.input).bg(t.background)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(div().flex_1().min_w(0).child(Input.new(input).h_full().text_size(12).text_color(t.foreground)));
  return labeled(t, label, h_flex().flex_1().min_w(0).gap(6).items_center().child(box).children(extras), inline);
}

export function errorRow(t, text) {
  return div().text_size(11).text_color(t.ansi1).child(text);
}
