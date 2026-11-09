import { div, svg } from "gpui-kit";
import { h_flex, v_flex, Avatar, AvatarFallback } from "gpui-base";
import { settings, fonts } from "herdr";
import { shade } from "../tokens.js";
import { initials } from "../text.js";

const NERD_FONT = "JetBrainsMono Nerd Font";
const PULSE = Object.freeze({ from: 0.35, to: 1, period: 1100 });
const SPINNER = ["\u{280b}", "\u{2819}", "\u{2839}", "\u{2838}", "\u{283c}", "\u{2834}", "\u{2826}", "\u{2827}", "\u{2807}", "\u{280f}"];
const TYPE_ICONS = Object.freeze({
  bug: ["bug", "ansi1"], story: ["bookmark", "ansi2"], epic: ["zap", "ansi5"], task: ["square-check-big", "ansi4"],
  "sub-task": ["corner-down-right", "accent"], subtask: ["corner-down-right", "accent"], incident: ["triangle-alert", "ansi1"],
});
const PRIORITY_ICONS = Object.freeze({
  highest: ["chevrons-up", "ansi1"], high: ["chevron-up", "ansi1"], medium: ["equal", "ansi3"], low: ["chevron-down", "ansi4"], lowest: ["chevrons-down", "ansi4"],
});
const CATEGORY_COLORS = Object.freeze({ new: "muted", indeterminate: "ansi4", done: "ansi2" });
const AVATAR_COLORS = ["ansi1", "ansi2", "ansi3", "ansi4", "ansi5", "ansi6"];

export { shade };

export function mono() {
  return fonts().includes(NERD_FONT) ? NERD_FONT : settings().font_family ?? "JetBrains Mono";
}

export function icon(name, size, color) {
  return svg(`mods/jira/icons/${name}.svg`).flex_none().size(size).text_color(color);
}

export function categoryColor(t, category) {
  return t[CATEGORY_COLORS[category] ?? "dim"] ?? t.dim;
}

export function typeLook(t, type) {
  const [name, color] = TYPE_ICONS[String(type ?? "").toLowerCase()] ?? ["file", "dim"];
  return { name, color: t[color] ?? t.dim };
}

export function typeIcon(t, type, size = 13) {
  const look = typeLook(t, type);
  return icon(look.name, size, look.color);
}

export function priorityIcon(t, priority, size = 13) {
  const [name, color] = PRIORITY_ICONS[String(priority ?? "").toLowerCase()] ?? ["minus", "dim"];
  return icon(name, size, t[color] ?? t.dim);
}

export function spinner(t, label) {
  return div().flex_none().text_color(t.accent).frames(SPINNER.map((one) => `${one} ${label}`), 90);
}

export function statusPill(t, status, category, wide) {
  const color = categoryColor(t, category);
  return h_flex().flex_none().when(Boolean(wide), (el) => el.max_w(wide)).h(18).px(7).gap(5).items_center().rounded(9)
    .bg(shade(color, "soft")).border_1().border_color(shade(color, "border"))
    .child(div().flex_none().w(6).h(6).rounded_full().bg(color).when(category === "indeterminate", (el) => el.loop("opacity", PULSE)))
    .child(div().truncate().text_size(10).font_semibold().text_color(color).child(String(status || "?").toUpperCase()));
}

export function hashColor(t, name) {
  const sum = [...String(name)].reduce((total, ch) => total + ch.codePointAt(0), 0);
  return t[AVATAR_COLORS[sum % AVATAR_COLORS.length]] ?? t.accent;
}

export function avatar(t, name, size = 20) {
  if (!name) return div().flex_none().w(size).h(size).rounded_full().border_1().border_dashed().border_color(t.dim);
  const color = hashColor(t, name);
  return Avatar.new().flex_none().w(size).h(size).rounded_full().overflow_hidden().bg(shade(color, "hover")).border_1().border_color(shade(color, "strong"))
    .fallback(AvatarFallback.new().size_full().flex().items_center().justify_center()
      .text_size(Math.max(8, Math.round(size * 0.42))).font_bold().text_color(t.foreground).child(initials(name)));
}

export function kbd(t, text, isOnSolid) {
  return div().flex_none().px(4).h(15).flex().items_center().rounded(4).text_size(9.5).font_semibold()
    .bg(isOnSolid ? shade(t.solid_foreground, "soft") : t.background).border_1().border_color(isOnSolid ? shade(t.solid_foreground, "hover") : t.border)
    .text_color(isOnSolid ? t.solid_foreground : t.dim).child(text);
}

function iconButtonLook(t, options) {
  if (options.tone === "write") return { color: t.ansi3, hover: shade(t.ansi3, "soft"), border: shade(t.ansi3, "border") };
  if (options.tone === "go") return { color: t.ansi2, hover: shade(t.ansi2, "soft"), border: shade(t.ansi2, "border") };
  if (options.active) return { color: t.accent, hover: t.hover, border: t.accent };
  return { color: t.muted, hover: t.hover, border: t.border };
}

export function iconButton(t, id, name, onClick, options = {}) {
  const look = iconButtonLook(t, options);
  return h_flex().id(id).flex_none().h(26).px(6).gap(4).items_center().rounded(7).border_1().border_color(look.border).bg(options.active ? shade(look.color, "subtle") : t.raised)
    .when(Boolean(options.tooltip), (el) => el.tooltip(options.tooltip))
    .when(!options.disabled, (el) => el.cursor_pointer().hover((s) => s.bg(look.hover)).active((s) => s.opacity(0.7)))
    .when(Boolean(options.disabled), (el) => el.opacity(0.45))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((e, cx) => { if (!options.disabled) onClick(e, cx); })
    .child(icon(name, 14, look.color))
    .when(Boolean(options.label), (el) => el.child(div().text_size(11.5).text_color(look.color).child(options.label ?? "")))
    .when(Boolean(options.hotkey), (el) => el.child(kbd(t, options.hotkey ?? "", false)));
}

function buttonLook(t, options) {
  if (options.disabled) return { bg: t.surface, border: t.border, text: t.dim, hover: t.surface };
  if (options.danger) return { bg: t.ansi3, border: t.ansi3, text: t.background, hover: shade(t.ansi3, "strong") };
  if (options.primary) return { bg: t.solid, border: t.solid, text: t.solid_foreground, hover: t.solid };
  return { bg: t.raised, border: t.border, text: t.foreground, hover: t.hover };
}

export function button(t, id, label, onClick, options = {}) {
  const look = buttonLook(t, options);
  return h_flex().id(id).flex_none().h(26).px(10).gap(6).items_center().rounded(7).border_1().border_color(look.border).bg(look.bg)
    .text_size(11.5).font_semibold().text_color(look.text)
    .when(!options.disabled, (el) => el.cursor_pointer().hover((s) => s.bg(look.hover)).active((s) => s.opacity(0.75)))
    .when(Boolean(options.tooltip), (el) => el.tooltip(options.tooltip))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((e, cx) => { if (!options.disabled) onClick(e, cx); })
    .when(Boolean(options.icon), (el) => el.child(icon(options.icon, 13, look.text)))
    .child(div().child(label))
    .when(Boolean(options.hotkey), (el) => el.child(kbd(t, options.hotkey ?? "", Boolean(options.primary))));
}

export function chip(t, iconName, text, color) {
  return h_flex().flex_none().max_w(240).h(20).px(7).gap(4).items_center().rounded(5).bg(t.raised).border_1().border_color(t.border)
    .child(icon(iconName, 11, color)).child(div().truncate().text_size(10.5).text_color(t.foreground).child(text));
}

export function section(t, title, iconName, extra) {
  return h_flex().px(14).pt(14).pb(6).gap(6).items_center()
    .child(icon(iconName, 13, t.dim))
    .child(div().flex_none().text_size(10.5).font_bold().text_color(t.dim).child(title.toUpperCase()))
    .child(div().flex_1().h(1).bg(t.border))
    .when(Boolean(extra), (el) => el.child(extra));
}

export function errorBox(t, id, text, onRetry) {
  return h_flex().id(id).mx(10).my(4).px(10).py(7).gap(8).items_start().rounded(8)
    .border_1().border_color(shade(t.ansi1, "border")).bg(shade(t.ansi1, "subtle")).text_size(11.5)
    .child(icon("triangle-alert", 13, t.ansi1))
    .child(div().flex_1().min_w(0).text_color(t.ansi1).child(text))
    .when(Boolean(onRetry), (el) => el.child(button(t, `${id}-retry`, "Retry", onRetry)));
}

export function emptyNote(t, iconName, title, body) {
  return v_flex().mx(14).mt(14).px(14).py(16).gap(6).items_center().rounded(10).border_1().border_dashed().border_color(t.border)
    .child(icon(iconName, 20, t.dim))
    .child(div().text_size(12).font_semibold().text_color(t.muted).child(title))
    .when(Boolean(body), (el) => el.child(div().text_size(11).text_color(t.dim).child(body ?? "")));
}
