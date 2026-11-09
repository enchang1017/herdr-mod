import { div } from "gpui-kit";
import { h_flex, v_flex, Input } from "gpui-base";
import { settings, fonts, props } from "herdr";

export const PROD_GLYPH = "\u{f071}";
export const REFRESH_GLYPH = "\u{f021}";
export const LIVE_GLYPH = "\u{f111}";
export const ICONS = {
  find: "\u{f002}", browse: "\u{f03a}", context: "\u{f233}", live: "\u{f111}", agent: "\u{f120}", detail: "\u{f15c}",
  error: "\u{f06a}", help: "\u{f11c}", filter: "\u{f0b0}", stale: "\u{f017}",
};

const NERD_FONT = "JetBrainsMono Nerd Font";

export function tint(color, alpha) {
  return `${String(color).slice(0, 7)}${alpha}`;
}

export function mono() {
  return fonts().includes(NERD_FONT) ? NERD_FONT : settings().font_family ?? "JetBrains Mono";
}

export function glyph(color, text) {
  return div().flex_none().font_family(mono()).text_color(color).child(text);
}

export function toneColor(t, tone) {
  switch (tone) {
    case "error": return t.ansi1;
    case "warning": return t.ansi3;
    case "success": return t.ansi2;
    case "subtle": return t.muted;
    case "dim": return t.dim;
    default: return t.foreground;
  }
}

function buttonLook(t, options) {
  if (options.disabled) return { bg: t.surface, border: t.border, text: t.dim, hover: t.surface };
  if (options.primary) return { bg: t.solid, border: t.solid, text: t.solid_foreground, hover: t.solid };
  if (options.active) return { bg: t.selected, border: t.accent, text: t.foreground, hover: t.selected };
  return { bg: t.raised, border: t.border, text: t.foreground, hover: t.hover };
}

export function button(t, id, label, onClick, options = {}) {
  const look = buttonLook(t, options);
  return div().id(id).flex_none().h(24).px(9).flex().items_center().rounded(6)
    .border_1().border_color(look.border).bg(look.bg).text_size(11.5).text_color(look.text)
    .when(!options.disabled, (el) => el.cursor_pointer().hover((s) => s.bg(look.hover)))
    .when(Boolean(options.tooltip), (el) => el.tooltip(options.tooltip))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((e, cx) => {
      if (!options.disabled) onClick(e, cx);
    })
    .child(h_flex().gap(5).items_center()
      .child(typeof label === "string" ? div().child(label) : label)
      .when(Boolean(options.hotkey), (el) => el.child(div().px(3).rounded(3).bg(options.primary ? tint(t.solid_foreground, "22") : t.background)
        .text_size(10).text_color(options.primary ? t.solid_foreground : t.dim).child(options.hotkey ?? ""))));
}

export function placeButton(t, app) {
  const isWindow = Boolean(props()?.overlay);
  const tooltip = isWindow ? "Dock beside the focused pane (cmd-enter). New tab: cmd-shift-t" : "Back to a floating window (cmd-enter)";
  return button(t, "place", isWindow ? "Dock" : "Float", (_e, cx) => app.togglePlace(cx), { hotkey: "\u{2318}\u{21b5}", tooltip });
}

export function chip(t, text, color, variant = "tint") {
  const el = div().flex_none().h(18).px(6).flex().items_center().rounded(5).text_size(10.5).font_semibold();
  if (variant === "solid") return el.bg(color).text_color(t.background).child(text);
  if (variant === "outline") return el.border_1().border_color(color).text_color(color).child(text);
  return el.bg(tint(color, "24")).text_color(color).child(text);
}

export function card(t, id) {
  return v_flex().id(id).mx(8).my(4).rounded(10).border_1().border_color(t.border).bg(t.background).overflow_hidden();
}

export function cardHeader(t, spec) {
  return h_flex().h(32).flex_none().px(10).gap(8).items_center().bg(t.surface).border_b(1).border_color(t.border)
    .child(glyph(spec.color ?? t.accent, spec.icon))
    .child(div().flex_none().font_bold().text_size(12.5).text_color(t.foreground).child(spec.title))
    .children(spec.chips ?? [])
    .child(div().flex_1())
    .when(Boolean(spec.meta), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(spec.meta ?? "")))
    .children(spec.actions ?? []);
}

export function contextLabel(t, context, short) {
  const isProd = /prod/i.test(context ?? "");
  return h_flex().gap(4).items_center().min_w(0)
    .when(isProd, (el) => el.child(glyph(t.ansi1, PROD_GLYPH)))
    .child(div().truncate().text_color(isProd ? t.ansi1 : t.ansi4).when(isProd, (el) => el.font_semibold()).child(short));
}

export function prodBanner(t, context) {
  return h_flex().flex_none().mx(8).mt(8).px(10).h(28).gap(8).items_center().rounded(8).bg(t.ansi1).text_color(t.background)
    .child(glyph(t.background, PROD_GLYPH))
    .child(div().flex_none().font_bold().text_size(12).child("PRODUCTION"))
    .child(div().flex_1().min_w(0).truncate().text_size(11.5).font_semibold().child(context.split("/").pop() || context))
    .child(div().flex_none().text_size(10.5).font_semibold().child("read-only"));
}

export function note(t, text, tone) {
  return div().px(10).py(5).text_size(11.5).text_color(tone ? toneColor(t, tone) : t.dim).child(text);
}

export function errorRow(t, id, text, onRetry) {
  return h_flex().id(id).mx(8).my(4).px(10).py(7).gap(8).items_start().rounded(8)
    .border_1().border_color(tint(t.ansi1, "66")).bg(tint(t.ansi1, "14")).text_size(12)
    .child(glyph(t.ansi1, ICONS.error))
    .child(div().flex_1().min_w(0).text_color(t.ansi1).child(text))
    .when(Boolean(onRetry), (el) => el.child(button(t, `${id}-retry`, "Retry", onRetry)));
}

export function sectionTitle(t, text) {
  return div().px(10).pt(8).pb(4).text_size(10.5).font_bold().text_color(t.dim).child(text);
}

export function targetField(t, id, input, label) {
  return h_flex().id(id).flex_1().min_w(90).h(24).px(7).gap(6).items_center().rounded(6).border_1().border_color(t.border).bg(t.surface)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(glyph(t.accent, ICONS.agent))
    .child(div().flex_1().min_w(0).child(Input.new(input).h_full().text_size(11.5).text_color(t.foreground)))
    .when(Boolean(label), (el) => el.child(div().flex_none().max_w(110).truncate().text_size(10.5).text_color(t.dim).child(label ?? "")));
}
