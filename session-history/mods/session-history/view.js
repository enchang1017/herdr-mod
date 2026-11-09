import { div } from "gpui-kit";
import { v_flex, h_flex, Input, Scrollbar, v_virtual_list } from "gpui-base";
import { displayTitle, folderLabel, ageLabel, sizeLabel, branchLabel } from "./data.js";
import { ICONS, icon, chip, pill, keyHint, monoFont } from "./kit.js";

const ROW_HEIGHT = 64;
const MAX_LIST_H = 640;
const PULSE = { from: 0.45, to: 1, period: 1100 };
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function lead(t, session) {
  const live = Boolean(session.pid);
  const el = icon(live ? ICONS.live : ICONS.history, 15, live ? t.working : t.dim);
  return div().w(16).flex_none().flex().items_center().justify_center().child(live ? el.loop("opacity", PULSE) : el);
}

function titleLine(t, session, now) {
  return h_flex().gap(8).min_w(0).items_center()
    .child(lead(t, session))
    .when(Boolean(session.pid), (el) => el.child(chip(t, "live", t.working)))
    .when(session.kind === "codex", (el) => el.child(chip(t, "codex", t.ansi4)))
    .when(Boolean(session.name), (el) => el.child(icon(ICONS.named, 13, t.accent)))
    .child(div().flex_1().min_w(0).truncate().font_bold().text_size(14).child(displayTitle(session)))
    .child(pill(t, ICONS.clock, ageLabel(session.mtime, now) || "?", t.foreground));
}

function metaLine(t, session) {
  const branch = branchLabel(session);
  return h_flex().pl(24).gap(6).min_w(0).items_center().text_size(12).text_color(t.dim)
    .child(pill(t, ICONS.folder, folderLabel(session), t.accent))
    .when(Boolean(branch), (el) => el.child(pill(t, ICONS.branch, branch, t.ansi5)))
    .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(session.snippet ?? ""))
    .child(pill(t, ICONS.size, sizeLabel(session.size), t.muted));
}

function sessionRow(app, t, session, index, now) {
  const selected = index === app.state.selected;
  return v_flex().id(`row-${session.kind}-${session.id}`).h(ROW_HEIGHT).px(12).gap(6).justify_center().cursor_pointer()
    .border_l(2).border_color(selected ? t.accent : t.chrome)
    .when(selected, (el) => el.bg(t.selected))
    .when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
    .child(titleLine(t, session, now))
    .child(metaLine(t, session));
}

function searchField(app, t) {
  const busy = app.state.searching;
  return h_flex().h(34).flex_none().px(10).gap(8).items_center().rounded(8).border_1().border_color(t.accent).bg(t.background)
    .child(icon(ICONS.search, 15, t.accent))
    .child(div().flex_1().min_w(0).child(Input.new(app.queryInput).h_full().text_size(13.5).text_color(t.foreground)))
    .when(busy, (el) => el.child(div().flex_none().text_size(12).text_color(t.accent).frames(SPIN.map((s) => `${s} text`), 90).child("text")));
}

function statusText(app, count) {
  const { indexing, pending, hits, truncated, query, sessions } = app.state;
  const parts = [`${count}/${sessions.length}`];
  if (query.trim() && hits) parts.push(`${hits.length} text hit${hits.length === 1 ? "" : "s"}${truncated ? "+" : ""}`);
  if (indexing || pending) parts.push("indexing…");
  return parts.join(" · ");
}

function header(app, t, rows) {
  const live = app.state.sessions.filter((s) => s.pid).length;
  return v_flex().flex_none().bg(t.surface).border_b(1).border_color(t.border)
    .child(h_flex().h(44).px(14).gap(10).items_center()
      .child(icon(ICONS.history, 17, t.accent))
      .child(div().font_bold().text_size(15).child("Session history"))
      .when(live > 0, (el) => el.child(chip(t, `${live} live`, t.working, "tint", ICONS.live)))
      .child(div().flex_1())
      .child(pill(t, ICONS.history, statusText(app, rows.length))))
    .child(div().px(14).pb(10).child(searchField(app, t)));
}

function problem(app, t) {
  const message = app.state.message || app.state.indexError;
  if (!message) return div();
  return div().px(14).py(8).text_size(12.5).text_color(t.ansi1).border_b(1).border_color(t.border).child(message);
}

function emptyState(app, t) {
  const text = app.state.sessions.length === 0 ? (app.state.indexing ? "Indexing transcripts…" : "No sessions found.") : "No session matches.";
  return div().px(14).py(16).text_size(13).text_color(t.dim).child(text);
}

function list(app, t, rows) {
  const now = Date.now();
  const height = Math.min(rows.length * ROW_HEIGHT, MAX_LIST_H);
  return v_flex().h(height).flex_none().relative()
    .child(v_virtual_list("session-rows", rows.length, ROW_HEIGHT, (i) => `${rows[i].kind}-${rows[i].id}`,
      (range) => rows.slice(range.start, range.end).map((s, k) => sessionRow(app, t, s, range.start + k, now)))
      .on_item_click((key, cx) => app.clickRow(rows.findIndex((r) => `${r.kind}-${r.id}` === key), cx))
      .track_scroll(app.scroll).flex_1())
    .child(Scrollbar.vertical("session-rows").absolute().inset_0());
}

function footer(t) {
  const keys = [["↑↓", "move"], ["⏎", "resume / focus live"], ["⌘⏎", "fork"], ["esc", "clear, then close"]];
  return h_flex().flex_none().px(14).py(8).gap(14).items_center().border_t(1).border_color(t.border).bg(t.surface)
    .child(chip(t, "live", t.working, "tint", ICONS.live))
    .child(div().flex_1())
    .children(keys.map(([key, word], i) => keyHint(t, key, word, `key-${i}`)));
}

export function panelView(app, t, rows) {
  return v_flex().w_full().text_size(13).font_family(monoFont())
    .child(header(app, t, rows))
    .child(problem(app, t))
    .child(rows.length ? list(app, t, rows) : emptyState(app, t))
    .child(footer(t));
}
