import { div } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { monoFont, errorRow, spinner, summaryBox, note } from "./ui.js";
import { button, chip, tabs, icon, caret, shade, ICONS } from "./kit.js";
import { diffView, diffWidth, diffText } from "./diff-view.js";

const SPLIT_PX = 760;
const INDENT = 14;
const AI_LABEL = "AI explain";

export function statusColor(t, status) {
  if (status === "A") return t.ansi2;
  if (status === "D") return t.ansi1;
  if (status === "R" || status === "C") return t.ansi5;
  return t.ansi3;
}

function insertPath(tree, parts, file) {
  const [head, ...rest] = parts;
  if (!rest.length) return { ...tree, files: [...tree.files, { name: head, file }] };
  const child = tree.dirs[head] ?? { dirs: {}, files: [] };
  return { ...tree, dirs: { ...tree.dirs, [head]: insertPath(child, rest, file) } };
}

export function fileTree(files) {
  return files.reduce((tree, file) => insertPath(tree, file.path.split("/"), file), { dirs: {}, files: [] });
}

export function treeRows(tree, prefix, depth, collapsed) {
  const dirs = Object.keys(tree.dirs).sort().flatMap((name) => {
    const folder = prefix ? `${prefix}/${name}` : name;
    const open = !collapsed.has(folder);
    return [{ kind: "dir", name, folder, depth, open }, ...(open ? treeRows(tree.dirs[name], folder, depth + 1, collapsed) : [])];
  });
  const files = [...tree.files].sort((a, b) => a.name.localeCompare(b.name)).map((one) => ({ kind: "file", name: one.name, file: one.file, depth }));
  return [...dirs, ...files];
}

function treeRow(graph, t, row, index) {
  const base = h_flex().id(`ct-${index}`).h(22).flex_none().pl(8 + row.depth * INDENT).pr(8).gap(6).items_center().cursor_pointer().text_size(11).hover((s) => s.bg(t.hover));
  if (row.kind === "dir") {
    return base.on_click((_ev, cx) => graph.toggleFolder(row.folder, cx))
      .child(caret(row.open, t.dim))
      .child(icon(row.open ? ICONS.folderOpen : ICONS.folder, 13, t.ansi4))
      .child(div().min_w(0).truncate().text_color(t.muted).child(row.name));
  }
  const color = statusColor(t, row.file.status), isOpen = graph.detail.file === row.file.path;
  return base.when(isOpen, (e) => e.bg(t.selected)).on_click((_ev, cx) => graph.pickFile(row.file.path, cx))
    .child(div().w(14).h(14).flex_none().flex().items_center().justify_center().rounded(3).bg(shade(color, "soft")).text_size(9.5).font_bold().text_color(color).child(row.file.status))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(row.name))
    .when(Boolean(row.file.from), (e) => e.child(div().flex_none().max_w(140).truncate().text_size(10).text_color(t.dim).child(`from ${row.file.from}`)));
}

function kvRow(t, id, key, value, onClick) {
  return h_flex().id(id).gap(8).items_start().text_size(11)
    .child(div().w(54).flex_none().text_color(t.dim).child(key))
    .child(value.when(Boolean(onClick), (e) => e.cursor_pointer().hover((s) => s.underline()).on_click(onClick)));
}

function parentsValue(graph, t, parents) {
  return h_flex().flex_1().gap(6).flex_wrap().children(parents.map((p, i) => div().id(`parent-${i}`).font_family(monoFont()).text_color(t.accent).cursor_pointer()
    .hover((s) => s.underline()).on_click((_ev, cx) => graph.selectHash(p, cx)).child(p.slice(0, 8))));
}

function fenced(text) {
  const fence = "~".repeat(Math.max(3, ...(text.match(/~+/g) ?? []).map((run) => run.length + 1)));
  return `${fence}\n${text}\n${fence}`;
}

function messageBlock(t, message) {
  const [subject = "", ...body] = message.split("\n");
  const rest = body.join("\n").trim();
  return v_flex().id("commit-message").gap(4).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(div().font_bold().text_size(12.5).text_color(t.foreground).child(subject))
    .when(Boolean(rest), (e) => e.child(TextView.markdown("commit-message-body", fenced(rest)).selectable(true).text_size(11).text_color(t.muted)));
}

function infoPane(graph, t) {
  const { info, loading, error, collapsed } = graph.detail;
  if (loading) return spinner(t, "Reading commit…");
  if (error) return errorRow(t, error, "commit-info");
  const rows = treeRows(fileTree(info.files), "", 0, collapsed);
  return v_flex().id("commit-info").flex_1().min_h(0).overflow_y_scrollbar().p(10).gap(10)
    .child(messageBlock(t, info.message))
    .child(v_flex().gap(4).p(8).rounded(8).bg(t.surface).border_1().border_color(t.border)
      .child(kvRow(t, "kv-hash", "Commit", div().flex_1().min_w(0).truncate().font_family(monoFont()).text_color(t.foreground).tooltip("Click to copy").child(info.hash),
        (_ev, cx) => cx.write_to_clipboard(info.hash)))
      .child(kvRow(t, "kv-parents", "Parents", info.parents.length ? parentsValue(graph, t, info.parents) : div().text_color(t.dim).child("root commit")))
      .child(kvRow(t, "kv-author", "Author", div().flex_1().min_w(0).truncate().text_color(t.foreground).child(`${info.author} <${info.email}>`)))
      .child(kvRow(t, "kv-date", "Date", div().text_color(t.foreground).child(new Date(info.at).toLocaleString()))))
    .child(v_flex().rounded(8).border_1().border_color(t.border).overflow_hidden()
      .child(h_flex().h(26).px(8).gap(6).items_center().bg(t.surface).border_b(1).border_color(t.border)
        .child(icon(ICONS.file, 13, t.accent)).child(div().font_bold().text_size(11).child(`Changed files (${info.files.length})`))
        .child(div().flex_1()).when(Boolean(graph.detail.file), (e) => e.child(button("all-files", "Whole commit", t, (_ev, cx) => graph.pickFile(graph.detail.file, cx), { small: true, ghost: true }))))
      .children(rows.slice(0, 600).map((row, i) => treeRow(graph, t, row, i))));
}

function diffPane(graph, t) {
  const { rows, diffLoading, diffError, file } = graph.detail;
  return v_flex().flex_1().min_h(0)
    .child(h_flex().px(10).py(4).gap(8).items_center()
      .child(div().flex_1().min_w(0).text_size(10.5).text_color(t.dim).truncate().child(file ?? "whole commit (first parent)"))
      .child(button("copy-diff", "Copy", t, (_ev, cx) => cx.write_to_clipboard(diffText(rows)), { small: true, disabled: diffLoading || !rows.length, tooltip: "Copy the diff" })))
    .when(diffLoading, (e) => e.child(spinner(t, "Loading diff…")))
    .when(Boolean(diffError), (e) => e.child(div().p(8).child(errorRow(t, diffError, "commit-diff"))))
    .when(!diffLoading && !diffError, (e) => e.child(diffView("commit-diff", rows, t, diffWidth(rows))));
}

function aiPane(graph, t) {
  const explain = graph.detail.explain;
  return v_flex().id("commit-ai").flex_1().min_h(0).overflow_y_scrollbar().p(10).gap(8)
    .when(!explain, (e) => e.child(v_flex().gap(8).items_start()
      .child(note(t, "Explains this commit with claude haiku from its message and diff (lock and secret files left out). Runs only when you ask."))
      .child(button("explain", "Explain this commit", t, (_ev, cx) => graph.explain(cx, false), { primary: true, disabled: !graph.detail.info }))))
    .when(Boolean(explain), (e) => e.child(summaryBox(t, explain, (_ev, cx) => graph.explain(cx, true))))
    .when(Boolean(explain && !explain.loading), (e) => e.child(button("re-explain", "Explain again", t, (_ev, cx) => graph.explain(cx, true), { small: true })));
}

function compareBar(graph, t) {
  const commit = graph.detail.commit, picking = graph.compare.picking === commit.hash;
  return h_flex().h(28).flex_none().px(10).gap(6).items_center().bg(t.surface).border_b(1).border_color(t.border)
    .child(div().text_size(10.5).text_color(t.dim).child("Compare"))
    .child(button("cmp-with", picking ? "Pick a commit… (esc)" : "Compare with…", t, (_ev, cx) => graph.beginPick(cx), { small: true, active: picking, tooltip: "Then click another commit in the graph (or cmd/shift-click, or press c)" }))
    .child(button("cmp-head", "Compare with HEAD", t, (_ev, cx) => graph.compareWith("HEAD", cx), { small: true }))
    .child(button("cmp-work", "Compare with working tree", t, (_ev, cx) => graph.compareWith(null, cx), { small: true, tooltip: "This commit vs the working tree, uncommitted changes included" }));
}

function header(graph, t, tabItems, current) {
  const commit = graph.detail.commit;
  return h_flex().h(32).flex_none().px(10).gap(8).items_center().bg(t.surface).border_y(1).border_color(t.border)
    .child(icon(ICONS.commit, 13, t.accent))
    .child(div().flex_none().font_family(monoFont()).text_size(11).text_color(t.muted).child(commit.short))
    .child(div().flex_1().min_w(0).truncate().font_bold().text_size(11.5).child(commit.subject))
    .when(commit.parents.length > 1, (e) => e.child(chip(t, "merge", t.ansi5, "outline")))
    .child(tabs(t, "commit-tabs", tabItems, current, (key, _ev, cx) => graph.setTab(key, cx)))
    .child(button("close-commit", "", t, (_ev, cx) => graph.closeDetail(cx), { icon: ICONS.close, ghost: true, small: true, tooltip: "Close (esc)" }));
}

export function commitDetail(graph, t, width) {
  const split = width >= SPLIT_PX, tab = graph.detail.tab;
  const items = split ? [["diff", "Diff"], ["ai", AI_LABEL]] : [["info", "Commit"], ["diff", "Diff"], ["ai", AI_LABEL]];
  const right = tab === "ai" ? aiPane(graph, t) : diffPane(graph, t);
  const body = split
    ? h_flex().flex_1().min_h(0).items_start()
      .child(v_flex().w(Math.round(width * 0.4)).h_full().flex_none().border_r(1).border_color(t.border).child(infoPane(graph, t)))
      .child(v_flex().flex_1().min_w(0).h_full().child(right))
    : v_flex().flex_1().min_h(0).child(tab === "info" ? infoPane(graph, t) : right);
  return v_flex().flex_1().min_h(0).child(header(graph, t, items, split && tab === "info" ? "diff" : tab)).child(compareBar(graph, t)).child(body);
}
