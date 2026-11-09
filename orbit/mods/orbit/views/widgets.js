import { div } from "gpui-kit";
import { h_flex, v_flex, Input } from "gpui-base";
import { settings, fonts, props } from "herdr";
import { ICONS, icon, iconButton, kbd, stateDot } from "./icons.js";
import { shade } from "./tokens.js";

export { ICONS, icon, iconButton, kbd, stateDot, shade };

const NERD_FONT = "JetBrainsMono Nerd Font";

export function mono() {
  return fonts().includes(NERD_FONT) ? NERD_FONT : settings().font_family ?? "JetBrains Mono";
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
  if (options.danger) return { bg: t.ansi1, border: t.ansi1, text: t.background, hover: t.ansi9 };
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
      .when(Boolean(options.hotkey), (el) => el.child(div().px(3).rounded(3).bg(options.primary || options.danger ? shade(look.text, "soft") : t.background)
        .text_size(10).text_color(options.primary || options.danger ? look.text : t.dim).child(options.hotkey ?? ""))));
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
  return el.bg(shade(color, "soft")).text_color(color).child(text);
}

export function note(t, text, tone) {
  return div().px(10).py(5).text_size(11.5).text_color(tone ? toneColor(t, tone) : t.dim).child(text);
}

export function errorRow(t, id, text, onRetry) {
  return h_flex().id(id).mx(8).my(4).px(10).py(7).gap(8).items_start().rounded(8)
    .border_1().border_color(shade(t.ansi1, "border")).bg(shade(t.ansi1, "subtle")).text_size(12)
    .child(icon(ICONS.error, 13, t.ansi1))
    .child(div().flex_1().min_w(0).text_color(t.ansi1).child(text))
    .when(Boolean(onRetry), (el) => el.child(button(t, `${id}-retry`, "Retry", onRetry)));
}

export function sectionTitle(t, text) {
  return div().px(10).pt(8).pb(4).text_size(10.5).font_bold().text_color(t.dim).child(text);
}

export function targetField(t, id, input, label) {
  return h_flex().id(id).flex_1().min_w(90).h(24).px(7).gap(6).items_center().rounded(6).border_1().border_color(t.border).bg(t.surface)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(icon(ICONS.agent, 13, t.accent))
    .child(div().flex_1().min_w(0).child(Input.new(input).h_full().text_size(11.5).text_color(t.foreground)))
    .when(Boolean(label), (el) => el.child(div().flex_none().max_w(110).truncate().text_size(10.5).text_color(t.dim).child(label ?? "")));
}
