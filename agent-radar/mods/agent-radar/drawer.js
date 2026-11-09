import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { placement, run } from "herdr";
import { ICONS, icon, button, pill, monoFont } from "./kit.js";
import { programIcon, statusIcon, ago, jump } from "./ui.js";

const WIDTH = 360;
const EDGE_W = 36;
const MAX_ROWS = 6;

function sided(rightSide, body, edge) {
  return rightSide ? [body, edge] : [edge, body];
}

function edgeCell(content) {
  return h_flex().w(EDGE_W).flex_none().items_center().justify_center().child(content);
}

const openPanel = () => run("mod.open", { name: "agent-radar" });

function header(t, view, list, rightSide) {
  const blocked = list.filter((item) => item.status === "blocked").length;
  const tone = blocked ? t.blocked : t.done;
  const title = blocked ? `${blocked} need you` : `${list.length} done`;
  const body = h_flex().flex_1().min_w(0).gap(6).items_center().px(8)
    .child(icon(ICONS.radar, 15, t.accent))
    .child(div().flex_1().min_w(0).truncate().font_bold().text_size(13.5).text_color(tone).child(title))
    .child(button("radar-open", "All", t, openPanel, { small: true, ghost: true, tooltip: "Open Agent radar (cmd-shift-a)" }))
    .child(button("radar-dismiss", "", t, (_e, cx) => view.dismiss(cx), { small: true, ghost: true, icon: ICONS.close, tooltip: "Hide until something new needs you" }));
  const badge = div().size(24).rounded(12).bg(tone).text_color(t.background)
    .text_size(12.5).font_bold().flex().items_center().justify_center().child(String(list.length));
  return h_flex().h(40).flex_none().items_center().border_b(1).border_color(t.border)
    .children(sided(rightSide, body, edgeCell(badge)));
}

function row(t, item, now, rightSide) {
  const body = v_flex().flex_1().min_w(0).px(8).gap(5)
    .child(h_flex().gap(8).items_center()
      .child(programIcon(item.program, 16, t.foreground))
      .child(div().flex_1().min_w(0).truncate().font_bold().text_size(13.5).child(item.name))
      .when(Boolean(item.since), (e) => e.child(pill(t, ICONS.clock, ago(item, now), t.foreground))))
    .child(h_flex().min_w(0).child(pill(t, ICONS.space, item.where, t.accent)));
  return h_flex().id(`drawer-${item.address}`).h(60).flex_none().items_center().rounded(6).cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click(() => jump(item))
    .children(sided(rightSide, body, edgeCell(statusIcon(t, item.status, 17))));
}

function more(t, extra, rightSide) {
  const body = div().flex_1().px(8).text_size(12).text_color(t.muted).child(`+${extra} more`);
  return h_flex().id("drawer-more").h(28).flex_none().items_center().rounded(6).cursor_pointer()
    .hover((s) => s.bg(t.hover))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click(openPanel)
    .children(sided(rightSide, body, edgeCell(div())));
}

export function drawer(t, view, list, now) {
  const rightSide = placement()?.edge !== "left";
  const shown = list.slice(0, MAX_ROWS);
  const extra = list.length - shown.length;
  return v_flex().w(WIDTH).px(2).gap(2).font_family(monoFont()).text_color(t.foreground)
    .child(header(t, view, list, rightSide))
    .children(shown.map((item) => row(t, item, now, rightSide)))
    .when(extra > 0, (el) => el.child(more(t, extra, rightSide)));
}
