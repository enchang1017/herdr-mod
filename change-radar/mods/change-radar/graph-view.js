import { div, PathBuilder } from "gpui-kit";
import { v_flex, h_flex, v_virtual_list, Scrollbar } from "gpui-base";
import { monoFont, ago, errorRow, spinner, note } from "./ui.js";
import { button, chip, cardHeader, tabs, icon, shade, ICONS } from "./kit.js";
import { commitDetail } from "./commit-detail.js";
import { compareView, pickBanner } from "./compare-view.js";
import { PAGE } from "./graph-data.js";

const ROW_H = 26;
const LANE_W = 12;
const MAX_GRAPH_PX = 168;
const GRAPH_LABEL_MIN = 44;
const NODE = 8;
const AUTHOR_W = 110;
const DATE_W = 44;
const HASH_W = 64;
const WIDE_PX = 620;

function laneColors(t) {
  return [t.ansi4, t.ansi5, t.ansi2, t.ansi3, t.ansi6, t.ansi1, t.ansi12, t.ansi13, t.ansi10, t.ansi11];
}

function segmentPath(builder, seg, laneW) {
  const y0 = seg.half === "top" ? 0 : ROW_H / 2, y1 = seg.half === "top" ? ROW_H / 2 : ROW_H;
  const x0 = seg.from * laneW + laneW / 2, x1 = seg.to * laneW + laneW / 2;
  const moved = builder.move_to(x0, y0);
  if (x0 === x1) return moved.line_to(x1, y1);
  const mid = (y0 + y1) / 2;
  return moved.cubic_bezier_to(x1, y1, x0, mid, x1, mid);
}

function lanePaths(row, colors, laneW) {
  const groups = row.segments.reduce((acc, seg) => {
    const color = colors[seg.lane % colors.length];
    return { ...acc, [color]: [...(acc[color] ?? []), seg] };
  }, {});
  return Object.entries(groups).map(([color, segs]) => {
    const path = segs.reduce((builder, seg) => segmentPath(builder, seg, laneW), PathBuilder.stroke(1.6)).build();
    return window.paint_path(path, color).absolute().top(0).left(0).size_full();
  });
}

function graphCell(t, row, commit, width, laneW) {
  const colors = laneColors(t);
  const color = colors[row.col % colors.length];
  const isHead = commit.refs.some((ref) => ref.kind === "head");
  const x = row.col * laneW + laneW / 2 - NODE / 2;
  const node = div().absolute().left(x).top(ROW_H / 2 - NODE / 2).size(NODE).rounded(NODE)
    .when(isHead, (e) => e.bg(t.background).border(2).border_color(color))
    .when(!isHead && row.isMerge, (e) => e.bg(t.background).border(1.5).border_color(color))
    .when(!isHead && !row.isMerge, (e) => e.bg(color));
  return div().relative().w(width).h(ROW_H).flex_none().overflow_hidden().children([...lanePaths(row, colors, laneW), node]);
}

function refChip(t, ref) {
  if (ref.kind === "head") return chip(t, ref.name, t.accent, "solid", ref.name === "HEAD" ? null : ICONS.check);
  if (ref.kind === "tag") return chip(t, ref.name, t.ansi3, "tint", ICONS.tag);
  if (ref.kind === "remote") return chip(t, ref.name, t.ansi6, "outline", ICONS.cloud);
  return chip(t, ref.name, t.ansi4);
}

function compareMark(graph, t, hash) {
  const s = graph.compare.state;
  if (s?.a?.hash === hash) return { letter: "A", color: t.ansi4 };
  if (s?.b?.hash === hash) return { letter: "B", color: t.ansi5 };
  if (graph.compare.picking === hash) return { letter: "A?", color: t.accent };
  return null;
}

function commitRow(graph, t, index, sizes) {
  const commit = graph.commits[index], row = graph.layout.rows[index];
  const selected = graph.selected === index, cursor = graph.cursor === index, mark = compareMark(graph, t, commit.hash);
  return h_flex().id(`gr-${index}`).h(ROW_H).w_full().flex_none().pr(8).gap(8).items_center().cursor_pointer().text_size(11.5)
    .border_l(2).border_color(mark ? mark.color : shade(t.background, "clear"))
    .when(Boolean(mark), (e) => e.bg(shade(mark.color, "soft")))
    .when(!mark && selected, (e) => e.bg(t.selected)).when(!mark && cursor && !selected, (e) => e.bg(t.hover)).hover((s) => s.bg(t.hover))
    .child(div().pl(4).flex_none().child(graphCell(t, row, commit, sizes.graph, sizes.lane)))
    .when(Boolean(mark), (e) => e.child(chip(t, mark.letter, mark.color, "solid")))
    .child(div().w(HASH_W).flex_none().font_family(monoFont()).text_size(10.5).text_color(t.dim).child(commit.short))
    .child(h_flex().flex_1().min_w(0).gap(4).items_center()
      .children(commit.refs.slice(0, 4).map((ref) => refChip(t, ref)))
      .when(commit.refs.length > 4, (e) => e.child(chip(t, `+${commit.refs.length - 4}`, t.muted, "outline")))
      .child(div().flex_1().min_w(0).truncate().text_color(row.isMerge ? t.muted : t.foreground).child(commit.subject)))
    .when(sizes.wide, (e) => e.child(div().w(AUTHOR_W).flex_none().truncate().text_size(10.5).text_color(t.muted).child(commit.author)))
    .child(div().w(DATE_W).flex_none().text_right().text_size(10.5).text_color(t.dim).child(ago(commit.at)));
}

function columnHeader(t, sizes) {
  return h_flex().h(22).flex_none().pr(8).gap(8).items_center().bg(t.raised).border_b(1).border_color(t.border).text_size(10).font_bold().text_color(t.muted)
    .child(div().pl(6).w(sizes.graph + 6).flex_none().overflow_hidden().truncate().child(sizes.graph >= GRAPH_LABEL_MIN ? "GRAPH" : ""))
    .child(div().w(HASH_W).flex_none().child("COMMIT"))
    .child(div().flex_1().child("DESCRIPTION"))
    .when(sizes.wide, (e) => e.child(div().w(AUTHOR_W).flex_none().child("AUTHOR")))
    .child(div().w(DATE_W).flex_none().text_right().child("DATE"));
}

function toolbar(graph, t, opts) {
  const expandable = opts.expandable;
  const actions = [
    ...(expandable ? [button("graph-expand", "Expand", t, () => graph.expand(), { tooltip: "Open in a large window" })] : []),
    button("graph-fetch", graph.fetching ? "Fetching…" : "Fetch", t, (_ev, cx) => graph.fetch(cx), { disabled: graph.fetching, tooltip: "git fetch (read-only, no merge)" }),
    button("graph-refresh", "Refresh", t, (_ev, cx) => graph.reload(cx)),
  ];
  const chips = [...(opts.repo ? [chip(t, opts.repo, t.muted, "outline")] : []), ...(graph.branch ? [chip(t, graph.branch, t.accent, "tint", ICONS.branch)] : [])];
  return cardHeader(t, { icon: ICONS.graph, title: "Graph", chips, actions });
}

function filterRow(graph, t) {
  const remotes = graph.filters.remotes;
  return h_flex().flex_none().px(10).py(6).gap(8).items_center().border_b(1).border_color(t.border)
    .child(tabs(t, "graph-scope", [["all", "All branches"], ["current", "Current"]], graph.filters.scope, (key, _ev, cx) => graph.setFilters({ scope: key }, cx)))
    .child(h_flex().id("graph-remotes").gap(6).items_center().cursor_pointer().text_size(11).text_color(remotes ? t.foreground : t.muted)
      .on_click((_ev, cx) => graph.setFilters({ remotes: !remotes }, cx))
      .child(div().size(14).flex_none().flex().items_center().justify_center().rounded(3).border_1().border_color(remotes ? t.accent : t.input)
        .bg(remotes ? t.accent : t.surface).when(remotes, (e) => e.child(icon(ICONS.check, 10, t.accent_foreground))))
      .child(div().child("Remotes")))
    .child(div().flex_1())
    .child(div().text_size(10.5).text_color(t.dim).child(`${graph.commits.length}${graph.hasMore ? "+" : ""} commits`));
}

function sizesFor(graph, width) {
  const lane = Math.max(6, Math.min(LANE_W, MAX_GRAPH_PX / graph.layout.width));
  return { lane, graph: Math.ceil(lane * graph.layout.width), wide: width >= WIDE_PX };
}

function loadMoreBar(graph, t) {
  return h_flex().h(30).flex_none().justify_center().items_center().border_t(1).border_color(t.border).bg(t.surface)
    .child(button("graph-load-more", graph.loading ? "Loading…" : `Load ${PAGE} more`, t, (_ev, cx) => graph.loadMore(cx), { disabled: graph.loading, small: true }));
}

function commitList(graph, t, width) {
  const sizes = sizesFor(graph, width);
  const render = (range) => Array.from({ length: range.end - range.start }, (_, k) => commitRow(graph, t, range.start + k, sizes));
  return v_flex().flex_1().min_h(0)
    .child(columnHeader(t, sizes))
    .child(div().id("graph-list-box").flex_1().min_h(0).relative().on_mouse_down("left", (e, cx) => { graph.pressMods = e.modifiers ?? null; cx.stop_propagation(); })
      .child(v_virtual_list("graph-list", graph.commits.length, ROW_H, (i) => graph.commits[i].hash, render).size_full()
        .on_item_click((key, cx) => graph.clickHash(key, cx)))
      .child(Scrollbar.vertical("graph-list").viewport_from_layout().absolute().inset_0()))
    .when(graph.hasMore, (e) => e.child(loadMoreBar(graph, t)));
}

function bottomPane(graph, t, width, opts) {
  if (graph.compare.state) return compareView(graph.compare, t, width, { review: opts.review, sending: opts.sending, selectCommit: (sha, cx) => graph.selectHash(sha, cx) });
  return graph.detail ? commitDetail(graph, t, width) : null;
}

export function graphView(graph, t, width, opts = {}) {
  const bottom = bottomPane(graph, t, width, opts), picking = graph.compare.picking;
  return v_flex().flex_1().min_h(0).bg(t.background)
    .child(toolbar(graph, t, opts))
    .child(filterRow(graph, t))
    .when(Boolean(graph.error), (e) => e.child(div().p(8).child(errorRow(t, graph.error, "graph", (_ev, cx) => graph.reload(cx)))))
    .when(graph.loading && !graph.commits.length, (e) => e.child(spinner(t, "Reading history…")))
    .when(!graph.loading && !graph.error && !graph.commits.length, (e) => e.child(note(t, "No commits for this filter")))
    .when(Boolean(picking), (e) => e.child(pickBanner(graph.compare, t, picking.slice(0, 8))))
    .when(graph.commits.length > 0, (e) => e.child(commitList(graph, t, width)))
    .when(Boolean(bottom), (e) => e.child(bottom));
}
