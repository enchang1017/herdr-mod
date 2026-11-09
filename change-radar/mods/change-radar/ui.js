import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { fonts, settings } from "herdr";
import { button, chip, icon, shade, ICONS } from "./kit.js";

export { button };

export const KINDS = {
  work: { icon: "pencil", label: "uncommitted", tone: (t) => t.ansi3 },
  local: { icon: "arrow-up", label: "unpushed", tone: (t) => t.ansi4 },
  pushed: { icon: "git-fork", label: "unmerged", tone: (t) => t.ansi5 },
};

export const REVIEW = {
  todo: { icon: "circle", label: "to review", tone: (t) => t.accent },
  changed: { icon: "triangle-alert", label: "changed since review", tone: (t) => t.blocked },
  reviewed: { icon: "check", label: "reviewed", tone: (t) => t.ansi2 },
  checking: { icon: "circle", label: "checking review", tone: (t) => t.dim },
  unknown: { icon: "triangle-alert", label: "review check failed", tone: (t) => t.ansi1 },
};

export function monoFont() {
  const nerd = fonts().find((f) => f === "JetBrainsMono Nerd Font" || f === "JetBrainsMono Nerd Font Mono");
  return nerd ?? settings().font_family ?? "JetBrains Mono";
}

export function ago(ms) {
  if (!ms) return "";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function lines(t, add, del) {
  return h_flex().gap(6).flex_none().text_size(11)
    .when(add > 0, (e) => e.child(div().text_color(t.ansi2).child(`+${add}`)))
    .when(del > 0, (e) => e.child(div().text_color(t.ansi1).child(`−${del}`)));
}

export function marker(kind, t, text) {
  const k = KINDS[kind];
  return chip(t, text, k.tone(t), "tint", k.icon);
}

export function reviewChip(state, t) {
  const r = REVIEW[state];
  return chip(t, r.label, r.tone(t), state === "reviewed" ? "tint" : "outline", r.icon);
}

export function errorRow(t, text, id, retry) {
  return h_flex().w_full().gap(8).px(10).py(7).items_start().text_size(11).text_color(t.ansi1).bg(shade(t.ansi1, "subtle"))
    .border_1().border_color(shade(t.ansi1, "border")).rounded(8)
    .child(icon(ICONS.error, 13, t.ansi1))
    .child(div().flex_1().min_w(0).child(text))
    .when(Boolean(retry), (e) => e.child(button(`${id}-retry`, "Retry", t, retry)));
}

export function note(t, text) {
  return div().px(10).py(4).text_size(11).text_color(t.dim).child(text);
}

export function spinner(t, text) {
  return h_flex().gap(6).px(10).py(6).text_size(11).text_color(t.muted)
    .child(div().text_color(t.accent).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 90))
    .child(div().child(text));
}

export function summaryBox(t, state, onRetry) {
  if (!state) return null;
  if (state.loading) return spinner(t, `Summarizing with haiku${state.truncated ? " (diff truncated)" : ""}…`);
  if (state.error) return errorRow(t, `AI summary failed: ${state.error}`, "summary", onRetry);
  const s = state.value;
  return v_flex().gap(4).px(12).py(10).rounded(10).bg(t.background).border_1().border_color(shade(t.accent, "border")).text_size(12)
    .child(h_flex().gap(8).items_start().child(icon(ICONS.summary, 13, t.accent)).child(div().flex_1().min_w(0).font_bold().child(s.headline)))
    .children(s.points.map((p, i) => h_flex().id(`pt-${i}`).pl(20).gap(6).items_start().text_color(t.muted)
      .child(div().flex_none().text_color(t.accent).child("\u{2022}")).child(div().flex_1().min_w(0).child(p))))
    .when(Boolean(state.truncated), (e) => e.child(div().text_size(10).text_color(t.dim).child(`Diff truncated for the model (${state.size} chars, first ${state.limit} sent)`)))
    .when(Boolean(state.cached), (e) => e.child(div().text_size(10).text_color(t.dim).child("cached")));
}

export function fileRow(id, file, t, selected, onClick) {
  const parts = file.path.split("/"), name = parts.pop();
  const tone = file.status === "A" ? t.ansi2 : file.status === "D" || file.status === "U" ? t.ansi1 : t.blocked;
  return h_flex().id(id).h(26).flex_none().px(10).gap(8).items_center().cursor_pointer().text_size(12)
    .border_l(2).border_color(selected ? t.accent : t.background)
    .when(selected, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover)).on_click((ev, cx) => onClick(ev, cx))
    .child(div().w(16).h(16).flex_none().flex().items_center().justify_center().rounded(4).bg(shade(tone, "soft")).text_size(10).font_bold().text_color(tone).child(file.untracked ? "?" : file.status))
    .child(h_flex().flex_1().min_w(0)
      .child(div().min_w(0).flex_shrink(1).truncate().text_color(t.dim).child(parts.length ? `${parts.join("/")}/` : ""))
      .child(div().flex_none().max_w(240).truncate().child(name)))
    .child(file.binary ? div().text_size(10).text_color(t.dim).child("bin") : lines(t, file.add, file.del));
}

export function commitRow(id, c, t, onClick, selected) {
  return h_flex().id(id).h(24).flex_none().px(10).gap(8).items_center().text_size(11)
    .when(Boolean(onClick), (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((ev, cx) => onClick(ev, cx)))
    .when(Boolean(selected), (e) => e.bg(t.selected))
    .child(icon(ICONS.commit, 12, t.dim))
    .child(div().flex_none().font_family(monoFont()).text_color(t.muted).child(c.short))
    .child(div().flex_1().min_w(0).truncate().child(c.subject))
    .child(div().flex_none().text_color(t.dim).child(ago(c.at)));
}
