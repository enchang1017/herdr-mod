import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, shared, spaces } from "herdr";
import { MARK, RAIL_CELL, glyph, railCell, tone } from "./util.js";

const rowHeight = (tree) => (tree ? 28 : 30);

export function gitTail(g, tree, name, t) {
  const raw = g.branch ?? "detached";
  const same = (a) => a.toLowerCase() === name.toLowerCase();
  const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
  const repo = tree || same(g.name) ? "" : g.name;
  const label = [repo, branch].filter(Boolean).join(" · ");
  return h_flex().flex_1().min_w(0).gap(5).justify_end().items_center().text_size(11.5).text_color(t.dim)
    .when(Boolean(label), (el) => el.child(div().min_w(0).truncate().child(label)))
    .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`↑${g.ahead}`)))
    .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`↓${g.behind}`)));
}

export function chevron(id, open, t, toggle) {
  return div().id(id).flex_none().p(3).rounded(4).text_color(t.dim)
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); toggle(cx); })
    .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11));
}

export function statusDot(status, t) {
  return div().size(7).flex_none().rounded(4).bg(tone(t, status));
}

function avatar(w, t) {
  const colors = shared("space.colors") ?? {};
  const color = colors[w.id] ?? "ansi6";
  const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
  return h_flex().size(18).flex_none().rounded(5).bg(fill).items_center().justify_center()
    .text_size(10.5).font_bold().text_color("#ffffff").child([...w.name][0]?.toUpperCase() ?? "?");
}

function dropLine(drag, i, t) {
  return div().absolute().left(0).right(0).h(2).bg(t.accent)
    .when(drag.pressed < i, (line) => line.bottom(0))
    .when(drag.pressed > i, (line) => line.top(0));
}

function withDrag(el, drag, w, i) {
  return el
    .on_mouse_down("left", () => { drag.pressed = i; drag.over = i; })
    .on_mouse_move((_e, cx) => {
      const source = spaces()[drag.pressed];
      const over = source && (source.machine ?? null) === (w.machine ?? null) ? i : null;
      if (drag.pressed !== null && drag.over !== over) {
        drag.over = over;
        cx.notify();
      }
    })
    .on_mouse_up("left", (_e, cx) => {
      const { pressed: from, over } = drag;
      drag.pressed = null;
      drag.over = null;
      if (from !== null && over === i && from !== i) run("space.move", { id: spaces()[from].id, index: i + 1 });
      else if (from === i) run("space.select", { id: w.id });
      cx.notify();
    });
}

function spaceTail({ g, tree, w, open, summary, toggle }, t) {
  return h_flex().flex_1().min_w(0).gap(6).items_center()
    .child(g ? gitTail(g, tree, w.name, t) : div().flex_1())
    .when(!open && Boolean(summary), (el) => el.child(statusDot(summary, t)))
    .child(chevron(`space-fold-${w.id}`, open, t, toggle));
}

export function spaceRow(r, ctx) {
  const { w, i, tree } = r;
  const { t, drag, onMenu } = ctx;
  const row = v_flex().relative().id(`space-${w.id}`).px(8).h(rowHeight(tree)).flex_none().justify_center().rounded(8)
    .when(w.active, (el) => el.bg(t.selected))
    .when(!w.active, (el) => el.hover((s) => s.bg(t.hover)))
    .when(drag.pressed === i && drag.over !== i, (el) => el.opacity(0.5))
    .when(drag.pressed !== null && drag.over === i && drag.pressed !== i, (el) => el.child(dropLine(drag, i, t)))
    .on_mouse_down("right", () => onMenu(w));
  return withDrag(row, drag, w, i).child(
    h_flex().gap(9).items_center()
      .when(Boolean(tree), (el) => el.pl(22).child(svg("mods/workspace-chrome/branch.svg").size(13).text_color(t.dim)))
      .when(!tree, (el) => el.child(avatar(w, t)))
      .child(div().flex_shrink(0).max_w(150).truncate().text_color(t.foreground).child(w.name))
      .child(spaceTail(r, t)),
  );
}

export function compactRow({ w, i, summary }, t) {
  const status = summary ?? w.status;
  return railCell(h_flex().id(`space-${w.id}`).relative().w(RAIL_CELL).h(26).rounded(6).justify_center().items_center()
    .when(w.active, (el) => el.bg(t.selected))
    .when(!w.active, (el) => el.hover((s) => s.bg(t.hover)))
    .on_click(() => run("space.select", { id: w.id }))
    .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
    .child(div().absolute().right(5).text_color(tone(t, status)).child(glyph(status))));
}
