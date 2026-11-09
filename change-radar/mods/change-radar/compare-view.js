import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { monoFont, errorRow, spinner, summaryBox, note, lines, commitRow } from "./ui.js";
import { button, chip, tabs, icon, caret, shade, ICONS } from "./kit.js";
import { diffView, diffWidth, diffText } from "./diff-view.js";
import { fileTree, treeRows, statusColor } from "./commit-detail.js";

const SPLIT_PX = 760;
const INDENT = 14;
const MAX_COMMITS = 100;
const MAX_TREE = 600;

function sideChip(t, letter, side, color) {
  return h_flex().flex_1().min_w(0).gap(6).items_center()
    .child(chip(t, letter, color, "solid"))
    .child(div().flex_none().font_family(monoFont()).text_size(11).text_color(t.muted).child(side ? side.short : "working tree"))
    .when(Boolean(side), (e) => e.child(div().flex_1().min_w(0).truncate().text_size(11.5).child(side.subject)))
    .when(!side, (e) => e.child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child("uncommitted changes included")));
}

function sidesRow(cmp, t) {
  const s = cmp.state;
  const pending = s.loading ? spinner(t, `Comparing ${s.aRef}..${s.bRef ?? "working tree"}…`) : null;
  return h_flex().h(32).flex_none().px(10).gap(8).items_center().bg(t.surface).border_y(1).border_color(t.border)
    .child(icon(ICONS.compare, 13, t.accent))
    .when(Boolean(pending), (e) => e.child(div().flex_1().child(pending)))
    .when(!pending && Boolean(s.a), (e) => e.child(sideChip(t, "A", s.a, t.ansi4))
      .child(button("cmp-swap", "Swap", t, (_ev, cx) => cmp.swap(cx), { icon: ICONS.swap, small: true, ghost: true, disabled: !s.b, tooltip: s.b ? "Swap base and target" : "The working tree is always B" }))
      .child(sideChip(t, "B", s.b, t.ansi5)))
    .when(!pending && !s.a, (e) => e.child(div().flex_1().text_size(11).text_color(t.muted).child(`${s.aRef ?? ""}..${s.bRef ?? "working tree"}`)))
    .child(button("cmp-clear", "", t, (_ev, cx) => cmp.clear(cx), { icon: ICONS.close, ghost: true, small: true, tooltip: "Clear the compare (x)" }));
}

function actionsRow(cmp, t, opts, tabItems, current) {
  const s = cmp.state, r = s.result, range = cmp.reviewRange();
  const reviewTip = range ? "Start a reviewer on this range (or send it to the named agent)" : "Review range needs two commits";
  return h_flex().h(30).flex_none().px(10).gap(6).items_center().border_b(1).border_color(t.border)
    .child(div().flex_none().font_family(monoFont()).font_bold().text_size(11).text_color(t.foreground).child(cmp.label()))
    .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(`${r.commits.length} commits · ${r.files.length} files`))
    .child(tabs(t, "cmp-tabs", tabItems, current, (key, _ev, cx) => cmp.setTab(key, cx)))
    .child(button("cmp-copy", "Copy", t, (_ev, cx) => cx.write_to_clipboard(diffText(s.rows)), { small: true, disabled: s.diffLoading || !s.rows.length, tooltip: "Copy the shown diff" }))
    .child(button("cmp-ai", "AI summary", t, (_ev, cx) => cmp.summarize(cx, false), { small: true, disabled: Boolean(s.summary?.loading) }))
    .when(Boolean(opts.review), (e) => e.child(button("cmp-review", opts.sending ? "Starting…" : "Review range", t, (_ev, cx) => cmp.review(cx), { small: true, disabled: !range || opts.sending, tooltip: reviewTip })));
}

function treeRow(cmp, t, row, index) {
  const base = h_flex().id(`cmpt-${index}`).h(22).flex_none().pl(8 + row.depth * INDENT).pr(8).gap(6).items_center().cursor_pointer().text_size(11).hover((s) => s.bg(t.hover));
  if (row.kind === "dir") {
    return base.on_click((_ev, cx) => cmp.toggleFolder(row.folder, cx))
      .child(caret(row.open, t.dim))
      .child(icon(row.open ? ICONS.folderOpen : ICONS.folder, 13, t.ansi4))
      .child(div().min_w(0).truncate().text_color(t.muted).child(row.name));
  }
  const f = row.file, color = statusColor(t, f.status);
  return base.when(cmp.state.file === f.path, (e) => e.bg(t.selected)).on_click((_ev, cx) => cmp.pickFile(f, cx))
    .child(div().w(14).h(14).flex_none().flex().items_center().justify_center().rounded(3).bg(shade(color, "soft")).text_size(9.5).font_bold().text_color(color).child(f.untracked ? "?" : f.status))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(row.name))
    .child(f.binary ? div().text_size(10).text_color(t.dim).child("bin") : lines(t, f.add, f.del));
}

function section(t, name, title, extra) {
  return h_flex().h(26).px(8).gap(6).items_center().bg(t.surface).border_b(1).border_color(t.border)
    .child(icon(name, 13, t.accent)).child(div().font_bold().text_size(11).child(title)).child(div().flex_1()).children(extra ?? []);
}

function listPane(cmp, t, opts) {
  const s = cmp.state, r = s.result;
  const rows = treeRows(fileTree(r.files), "", 0, s.collapsed);
  const pick = opts.selectCommit;
  return v_flex().id("cmp-list").flex_1().min_h(0).overflow_y_scrollbar().p(8).gap(8)
    .when(Boolean(r.note), (e) => e.child(errorRow(t, `Unrelated histories: ${r.note}`, "cmp-note")))
    .child(v_flex().rounded(8).border_1().border_color(t.border).overflow_hidden()
      .child(section(t, ICONS.commit, `Commits in range (${r.commits.length})`))
      .when(!r.commits.length, (e) => e.child(note(t, s.b ? "No commits: B is not ahead of A" : "No commits between A and HEAD")))
      .children(r.commits.slice(0, MAX_COMMITS).map((c, i) => commitRow(`cmpc-${i}`, c, t, pick ? (_ev, cx) => pick(c.sha, cx) : null)))
      .when(r.commits.length > MAX_COMMITS, (e) => e.child(note(t, `${r.commits.length - MAX_COMMITS} more commits`))))
    .child(v_flex().rounded(8).border_1().border_color(t.border).overflow_hidden()
      .child(section(t, ICONS.file, `Changed files (${r.files.length})`, s.file ? [button("cmp-all", "Whole range", t, (_ev, cx) => cmp.pickFile({ path: s.file }, cx), { small: true, ghost: true })] : []))
      .when(!r.files.length, (e) => e.child(note(t, "No file changes")))
      .children(rows.slice(0, MAX_TREE).map((row, i) => treeRow(cmp, t, row, i))));
}

function diffPane(cmp, t) {
  const { rows, diffLoading, diffError, file, b } = cmp.state;
  return v_flex().flex_1().min_h(0)
    .child(div().px(10).py(4).text_size(10.5).text_color(t.dim).truncate().child(file ?? `whole range${b ? "" : " (tracked files; untracked ones open one by one)"}`))
    .when(diffLoading, (e) => e.child(spinner(t, "Loading diff…")))
    .when(Boolean(diffError), (e) => e.child(div().p(8).child(errorRow(t, diffError, "cmp-diff"))))
    .when(!diffLoading && !diffError, (e) => e.child(diffView("cmp-diff", rows, t, diffWidth(rows))));
}

function aiPane(cmp, t) {
  const summary = cmp.state.summary;
  return v_flex().id("cmp-ai-pane").flex_1().min_h(0).overflow_y_scrollbar().p(10).gap(8)
    .when(!summary, (e) => e.child(v_flex().gap(8).items_start()
      .child(note(t, "Summarizes this range with claude haiku (lock and secret files left out). Runs only when you ask."))
      .child(button("cmp-sum", "Summarize range", t, (_ev, cx) => cmp.summarize(cx, false), { primary: true }))))
    .when(Boolean(summary), (e) => e.child(summaryBox(t, summary, (_ev, cx) => cmp.summarize(cx, true))))
    .when(Boolean(summary && !summary.loading), (e) => e.child(button("cmp-resum", "Summarize again", t, (_ev, cx) => cmp.summarize(cx, true), { small: true })));
}

function body(cmp, t, width, opts) {
  const split = width >= SPLIT_PX, tab = cmp.state.tab;
  const right = tab === "ai" ? aiPane(cmp, t) : diffPane(cmp, t);
  if (!split) return v_flex().flex_1().min_h(0).child(tab === "files" ? listPane(cmp, t, opts) : right);
  return h_flex().flex_1().min_h(0).items_start()
    .child(v_flex().w(Math.round(width * 0.4)).h_full().flex_none().border_r(1).border_color(t.border).child(listPane(cmp, t, opts)))
    .child(v_flex().flex_1().min_w(0).h_full().child(right));
}

export function compareView(cmp, t, width, opts = {}) {
  const s = cmp.state, split = width >= SPLIT_PX;
  const items = split ? [["diff", "Diff"], ["ai", "AI"]] : [["files", "Files"], ["diff", "Diff"], ["ai", "AI"]];
  const current = split && s.tab === "files" ? "diff" : s.tab;
  return v_flex().flex_1().min_h(0).bg(t.background)
    .child(sidesRow(cmp, t))
    .when(Boolean(s.error), (e) => e.child(div().p(8).child(errorRow(t, s.error, "cmp-error", (_ev, cx) => cmp.rerun(cx)))))
    .when(Boolean(s.result), (e) => e.child(actionsRow(cmp, t, opts, items, current)).child(body(cmp, t, width, opts)));
}

export function pickBanner(cmp, t, short) {
  return h_flex().h(26).flex_none().px(10).gap(8).items_center().bg(shade(t.accent, "soft")).border_b(1).border_color(shade(t.accent, "border")).text_size(11)
    .child(icon(ICONS.compare, 13, t.accent))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(`Pick a commit to compare with ${short}`))
    .child(button("cmp-pick-cancel", "Cancel (esc)", t, (_ev, cx) => cmp.cancelPick(cx), { small: true, ghost: true }));
}
