import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { fonts, settings } from "herdr";

const ALPHA = Object.freeze({ clear: "00", subtle: "14", soft: "24", hover: "40", border: "66" });

export const ICONS = Object.freeze({
  radar: "radar", blocked: "circle-alert", done: "circle-check", idle: "circle", close: "x",
  agent: "square-terminal", space: "folder", clock: "clock", tab: "git-branch",
});

export function shade(color, step) {
  return `${String(color).slice(0, 7)}${ALPHA[step]}`;
}

export function monoFont() {
  const nerd = fonts().find((f) => f === "JetBrainsMono Nerd Font" || f === "JetBrainsMono Nerd Font Mono");
  return nerd ?? settings().font_family ?? "JetBrains Mono";
}

export function icon(name, size, color) {
  return svg(`mods/agent-radar/icons/${name}.svg`).flex_none().size(size).text_color(color);
}

function buttonLook(t, opts) {
  if (opts.ghost) return { bg: shade(t.background, "clear"), border: shade(t.background, "clear"), text: t.muted, hover: t.hover };
  return { bg: t.raised, border: t.border, text: t.foreground, hover: t.hover };
}

export function button(id, label, t, onClick, opts = {}) {
  const look = buttonLook(t, opts);
  return div().id(id).h(opts.small ? 24 : 28).px(opts.small ? 9 : 11).flex().flex_none().items_center().gap(5).rounded(12)
    .text_size(opts.small ? 12 : 12.5).border_1().border_color(look.border).bg(look.bg).text_color(look.text)
    .cursor_pointer().hover((s) => s.bg(look.hover))
    .when(Boolean(opts.tooltip), (e) => e.tooltip(opts.tooltip))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((ev, cx) => { cx.stop_propagation(); onClick(ev, cx); })
    .when(Boolean(opts.icon), (e) => e.child(icon(opts.icon, 13, look.text)))
    .when(Boolean(label), (e) => e.child(label));
}

export function chip(t, text, color, variant = "tint", iconName = null) {
  const ink = variant === "solid" ? t.background : color;
  const el = div().flex_none().h(22).px(9).flex().items_center().gap(5).rounded(11).text_size(12).font_medium()
    .whitespace_nowrap().text_color(ink)
    .when(Boolean(iconName), (e) => e.child(icon(iconName ?? "", 12, ink)));
  if (variant === "solid") return el.bg(color).child(text);
  if (variant === "outline") return el.border_1().border_color(shade(color, "border")).child(text);
  return el.bg(shade(color, "soft")).child(text);
}

export function pill(t, iconName, text, color) {
  return chip(t, text, color ?? t.muted, "outline", iconName);
}

export function card(t, id) {
  return v_flex().id(id).flex_none().rounded(10).border_1().border_color(t.border).bg(t.background).overflow_hidden();
}

export function cardHeader(t, spec) {
  return h_flex().h(38).flex_none().px(12).gap(8).items_center().bg(t.surface).border_b(1).border_color(t.border)
    .child(spec.lead ?? div())
    .child(div().flex_none().font_bold().text_size(13.5).text_color(spec.color ?? t.foreground).child(spec.title))
    .child(div().flex_1())
    .child(chip(t, spec.meta ?? "", spec.color ?? t.muted, "tint"));
}
