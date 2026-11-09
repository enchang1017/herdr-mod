import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { shade } from "./tokens.js";

export const ICONS = Object.freeze({
  orbit: "boxes", resources: "server", logs: "file-text", traces: "network", agent: "square-terminal",
  error: "circle-alert", filter: "filter", link: "external-link", warning: "triangle-alert", db: "database",
});

const PULSE = { from: 0.35, to: 1, period: 1100 };

export function icon(name, size, color) {
  return svg(`mods/orbit/icons/${name}.svg`).flex_none().size(size).text_color(color);
}

export function stateDot(color, isPulsing) {
  return div().flex_none().w(8).h(8).rounded_full().bg(color)
    .when(isPulsing, (el) => el.loop("opacity", PULSE));
}

export function kbd(t, text, isOnSolid) {
  return div().flex_none().px(4).h(15).flex().items_center().rounded(4).text_size(9.5).font_semibold()
    .bg(isOnSolid ? shade(t.solid_foreground, "subtle") : t.background).border_1().border_color(isOnSolid ? shade(t.solid_foreground, "soft") : t.border)
    .text_color(isOnSolid ? t.solid_foreground : t.dim).child(text);
}

function iconButtonLook(t, options) {
  if (options.tone === "danger") return { color: t.ansi1, hover: shade(t.ansi1, "soft"), border: shade(t.ansi1, "border"), bg: options.active ? shade(t.ansi1, "soft") : t.raised };
  if (options.tone === "primary") return { color: t.accent, hover: shade(t.accent, "soft"), border: shade(t.accent, "border"), bg: t.raised };
  if (options.active) return { color: t.accent, hover: t.hover, border: t.accent, bg: shade(t.accent, "subtle") };
  return { color: t.muted, hover: t.hover, border: t.border, bg: t.raised };
}

export function iconButton(t, id, name, onClick, options = {}) {
  const look = iconButtonLook(t, options);
  return h_flex().id(id).flex_none().h(26).px(6).gap(4).items_center().rounded(7).border_1().border_color(look.border).bg(look.bg)
    .when(Boolean(options.tooltip), (el) => el.tooltip(options.tooltip))
    .when(!options.disabled, (el) => el.cursor_pointer().hover((s) => s.bg(look.hover)).active((s) => s.opacity(0.7)))
    .when(Boolean(options.disabled), (el) => el.opacity(0.45))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((e, cx) => {
      if (!options.disabled) onClick(e, cx);
    })
    .child(icon(name, 14, look.color))
    .when(Boolean(options.label), (el) => el.child(div().text_size(11.5).text_color(look.color).child(options.label ?? "")))
    .when(Boolean(options.hotkey), (el) => el.child(kbd(t, options.hotkey ?? "", false)));
}
