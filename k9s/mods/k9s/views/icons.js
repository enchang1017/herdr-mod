import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { toneColor, tint } from "./widgets.js";

const KIND_ICONS = { pods: "box", deployments: "layers", services: "network", nodes: "server", ingresses: "globe", events: "bell", statefulsets: "database" };
const PULSE = { from: 0.35, to: 1, period: 1100 };

export function icon(name, size, color) {
  return svg(`mods/k9s/icons/${name}.svg`).flex_none().size(size).text_color(color);
}

export function kindIcon(resource) {
  return KIND_ICONS[resource] ?? "box";
}

export function stateIcon(tone, word) {
  if (/terminat|deleting/i.test(word ?? "")) return "circle-stop";
  if (tone === "error") return /crashloop|backoff/i.test(word ?? "") ? "rotate-cw" : "circle-x";
  if (tone === "warning") return "circle-dashed";
  if (tone === "success") return "circle-check";
  return "circle-alert";
}

export function stateDot(t, tone, isPulsing) {
  const color = toneColor(t, tone);
  return div().flex_none().w(8).h(8).rounded_full().bg(color)
    .when(isPulsing, (el) => el.loop("opacity", PULSE));
}

export function kbd(t, text, isOnSolid) {
  return div().flex_none().px(4).h(15).flex().items_center().rounded(4).text_size(9.5).font_semibold()
    .bg(isOnSolid ? tint(t.solid_foreground, "26") : t.background).border_1().border_color(isOnSolid ? tint(t.solid_foreground, "33") : t.border)
    .text_color(isOnSolid ? t.solid_foreground : t.dim).child(text);
}

function iconButtonLook(t, options) {
  if (options.tone === "danger") return { color: t.ansi1, hover: tint(t.ansi1, "22"), border: tint(t.ansi1, "55") };
  if (options.tone === "caution") return { color: t.ansi3, hover: tint(t.ansi3, "22"), border: tint(t.ansi3, "55") };
  if (options.active) return { color: t.accent, hover: t.hover, border: t.accent };
  return { color: t.muted, hover: t.hover, border: t.border };
}

export function iconButton(t, id, name, onClick, options = {}) {
  const look = iconButtonLook(t, options);
  return h_flex().id(id).flex_none().h(26).px(6).gap(4).items_center().rounded(7).border_1().border_color(look.border).bg(t.raised)
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
