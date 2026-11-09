import { div } from "gpui-kit";
import { v_flex, h_flex, Input, Scrollbar, v_virtual_list } from "gpui-base";
import { displayTitle, folderLabel, ageLabel, sizeLabel, branchLabel } from "./data.js";

const ROW_HEIGHT = 46;
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function tag(t, text, color) {
  return div().flex_none().px(5).rounded(4).border_1().border_color(color).text_size(10).text_color(color).child(text);
}

function metaLine(t, session, now) {
  const branch = branchLabel(session);
  return h_flex().gap(8).min_w(0).text_size(11).text_color(t.dim)
    .child(div().flex_none().text_color(t.muted).child(folderLabel(session)))
    .when(Boolean(branch), (el) => el.child(div().flex_none().max_w(180).truncate().child(branch)))
    .when(Boolean(session.snippet), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(session.snippet)))
    .when(!session.snippet, (el) => el.child(div().flex_1()))
    .child(div().flex_none().child(sizeLabel(session.size)))
    .child(div().flex_none().w(32).child(ageLabel(session.mtime, now)));
}

function sessionRow(app, t, session, index, now) {
  const selected = index === app.state.selected;
  return v_flex().id(`row-${session.kind}-${session.id}`).h(ROW_HEIGHT).px(12).py(5).gap(3).justify_center().cursor_pointer()
    .when(selected, (el) => el.bg(t.selected))
    .child(h_flex().gap(6).min_w(0).items_center()
      .when(Boolean(session.pid), (el) => el.child(tag(t, "live", t.working)))
      .when(session.kind === "codex", (el) => el.child(tag(t, "codex", t.ansi4)))
      .when(Boolean(session.name), (el) => el.child(div().flex_none().text_color(t.accent).font_semibold().child("✎")))
      .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.foreground).child(displayTitle(session))))
    .child(metaLine(t, session, now));
}

function searchBox(app, t) {
  const busy = app.state.searching;
  return h_flex().mx(12).mt(12).mb(8).h(34).flex_none().px(10).gap(8).items_center().rounded(8)
    .border_1().border_color(t.accent).bg(t.surface)
    .child(Input.new(app.queryInput).flex_1().h_full().text_size(13).text_color(t.foreground))
    .when(busy, (el) => el.child(div().flex_none().text_size(11).text_color(t.accent).frames(SPIN.map((s) => `${s} searching text`), 90).child("searching text")));
}

function statusLine(app, t, count) {
  const { indexing, pending, hits, truncated, query } = app.state;
  const message = app.state.message || app.state.indexError;
  const parts = [`${count} of ${app.state.sessions.length} sessions`];
  if (query.trim() && hits) parts.push(`${hits.length} text match${hits.length === 1 ? "" : "es"}${truncated ? " (limited)" : ""}`);
  if (indexing || pending) parts.push("indexing…");
  return h_flex().flex_none().px(14).pb(6).gap(10).text_size(11)
    .child(div().text_color(t.dim).child(parts.join(" · ")))
    .when(Boolean(message), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.ansi1).child(message)));
}

function emptyState(app, t) {
  const text = app.state.sessions.length === 0 ? (app.state.indexing ? "Indexing transcripts…" : "No sessions found.") : "No session matches.";
  return div().flex_1().p(16).text_size(12).text_color(t.dim).child(text);
}

function list(app, t, rows) {
  const now = Date.now();
  return v_flex().flex_1().min_h(0).relative()
    .child(v_virtual_list("session-rows", rows.length, ROW_HEIGHT, (i) => `${rows[i].kind}-${rows[i].id}`,
      (range) => rows.slice(range.start, range.end).map((s, k) => sessionRow(app, t, s, range.start + k, now)))
      .on_item_click((key, cx) => app.clickRow(rows.findIndex((r) => `${r.kind}-${r.id}` === key), cx))
      .track_scroll(app.scroll).flex_1())
    .child(Scrollbar.vertical("session-rows").absolute().inset_0());
}

function footer(t) {
  const keys = [["↑↓", "move"], ["Enter", "resume / focus live"], ["⌘Enter", "fork"], ["Esc", "clear, then close"]];
  return h_flex().flex_none().px(14).py(6).gap(14).border_t(1).border_color(t.border).text_size(10.5).text_color(t.dim)
    .children(keys.map(([key, word], i) => h_flex().id(`key-${i}`).gap(4).child(div().text_color(t.muted).child(key)).child(div().child(word))));
}

function titleBar(t) {
  return h_flex().flex_none().h(30).px(14).items_center().border_b(1).border_color(t.border)
    .child(div().text_size(12).font_semibold().text_color(t.muted).child("Session history"));
}

export function panelView(app, t, rows) {
  return v_flex().size_full().min_h(0)
    .child(titleBar(t))
    .child(searchBox(app, t))
    .child(statusLine(app, t, rows.length))
    .child(rows.length ? list(app, t, rows) : emptyState(app, t))
    .child(footer(t));
}
