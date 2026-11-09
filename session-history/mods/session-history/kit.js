import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { fonts, settings } from "herdr";

const ALPHA = Object.freeze({ soft: "24", border: "66" });

export const ICONS = Object.freeze({
  history: "history", search: "search", branch: "git-branch", folder: "folder", live: "circle-dot", named: "pencil",
  clock: "clock", size: "database",
});

export function shade(color, step) {
  return `${String(color).slice(0, 7)}${ALPHA[step]}`;
}

export function monoFont() {
  const nerd = fonts().find((f) => f === "JetBrainsMono Nerd Font" || f === "JetBrainsMono Nerd Font Mono");
  return nerd ?? settings().font_family ?? "JetBrains Mono";
}

export function icon(name, size, color) {
  return svg(`mods/session-history/icons/${name}.svg`).flex_none().size(size).text_color(color);
}

export function chip(t, text, color, variant = "tint", iconName = null) {
  const el = div().flex_none().h(22).px(9).flex().items_center().gap(5).rounded(11).text_size(12).font_medium()
    .whitespace_nowrap().text_color(color)
    .when(Boolean(iconName), (e) => e.child(icon(iconName ?? "", 12, color)));
  if (variant === "outline") return el.border_1().border_color(shade(color, "border")).child(text);
  return el.bg(shade(color, "soft")).child(text);
}

export function pill(t, iconName, text, color = t.muted) {
  return chip(t, text, color, "outline", iconName);
}

export function keyHint(t, key, word, id) {
  return h_flex().id(id).flex_none().gap(5).text_size(11.5)
    .child(div().text_color(t.muted).child(key))
    .child(div().text_color(t.dim).child(word));
}
