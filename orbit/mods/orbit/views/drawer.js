import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { icon, iconButton } from "./icons.js";
import { emptyNote } from "./parts.js";
import { shade } from "./tokens.js";

const MOTION = { duration: 180, easing: "ease-out" };
const MIN_WIDTH = 420;
const DRAG_MIN = 340;
const HANDLE = 6;
const RATIO = 0.45;
const NARROW = 760;
const LIST_KEEP = 300;
const EDGE = 8;

export function drawerWidth(area, preferred) {
  if (area.width < NARROW) return Math.max(280, area.width - EDGE * 2);
  const wanted = typeof preferred === "number" ? Math.max(DRAG_MIN, preferred) : Math.max(MIN_WIDTH, Math.round(area.width * RATIO));
  return Math.max(DRAG_MIN, Math.min(area.width - LIST_KEEP, Math.round(wanted)));
}

export function isResizable(area) {
  return area.width >= NARROW;
}

export function coveredWidth(app) {
  const area = app.drawerArea;
  return area && isResizable(area) ? drawerWidth(area, app.state.drawerWidth) + EDGE : 0;
}

function resizeHandle(t, app) {
  const isDragging = Boolean(app.resize);
  return div().id("dr-resize").absolute().top(0).left(0).w(HANDLE).h_full().cursor_col_resize()
    .flex().items_center().justify_center()
    .hover((s) => s.bg(shade(t.accent, "subtle")))
    .when(isDragging, (el) => el.bg(shade(t.accent, "soft")))
    .tooltip("Drag to resize, double-click to reset")
    .on_mouse_down("left", (e, cx) => {
      cx.stop_propagation();
      app.beginResize(e, cx);
    })
    .child(div().w(2).h(28).rounded(1).bg(isDragging ? t.accent : shade(t.dim, "border")));
}

function header(t, app, spec) {
  const color = spec.tone ?? t.accent;
  return v_flex().flex_none().px(14).pt(12).pb(10).gap(9).bg(t.surface).border_b(1).border_color(t.border)
    .child(h_flex().gap(10).items_center()
      .child(div().flex_none().w(32).h(32).rounded(9).flex().items_center().justify_center().bg(shade(color, "soft")).border_1().border_color(shade(color, "border"))
        .child(icon(spec.icon, 17, color)))
      .child(v_flex().flex_1().min_w(0)
        .child(div().id("dr-name").truncate().text_size(14).font_bold().text_color(t.foreground).tooltip(spec.title).child(spec.title))
        .child(div().truncate().text_size(10.5).text_color(t.dim).child(spec.subtitle ?? "")))
      .child(iconButton(t, "dr-close", "x", (_e, cx) => app.closeDrawer(cx), { hotkey: "esc", tooltip: "Close" })))
    .when((spec.chips ?? []).length > 0, (el) => el.child(h_flex().gap(5).items_center().flex_wrap().children(spec.chips ?? [])))
    .when((spec.actions ?? []).length > 0, (el) => el.child(h_flex().gap(5).items_center().flex_wrap().children(spec.actions ?? [])));
}

function bodyOf(spec) {
  if (spec.scroll === false) return v_flex().flex_1().min_h(0).child(spec.body);
  return v_flex().id(`${spec.id}-dr-scroll`).flex_1().min_h(0).overflow_y_scrollbar().pb(12).child(spec.body);
}

function card(t, app, area, spec) {
  const width = drawerWidth(area, app.state.drawerWidth);
  const left = spec.open ? area.width - EDGE - width : area.width + EDGE;
  return v_flex().id(`${spec.id}-drawer`).absolute().top(4).left(left).w(width).h(Math.max(160, area.height - 8))
    .opacity(spec.open ? 1 : 0).when(!app.resize, (el) => el.transition("left", MOTION)).transition("opacity", MOTION)
    .rounded(12).border_1().border_color(spec.alert ? shade(t.ansi1, "strong") : t.border).bg(t.popover).shadow_lg().overflow_hidden()
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .when(!spec.title, (el) => el.child(emptyNote(t, "boxes", "Nothing selected", "Pick a row on the left.")))
    .when(Boolean(spec.title), (el) => el.child(header(t, app, spec)).child(bodyOf(spec)).when(Boolean(spec.footer), (inner) => inner.child(spec.footer)))
    .when(spec.open && isResizable(area), (el) => el.child(resizeHandle(t, app)));
}

export function drawerArea(app, t, spec) {
  const area = app.drawerArea;
  return div().id(`${spec.id}-area`).relative().flex().flex_col().flex_1().min_h(0).overflow_hidden().bg(t.background)
    .on_size_change((size, cx) => app.measureDrawer(size, cx))
    .on_mouse_move((e, cx) => app.moveResize(e, cx))
    .on_mouse_up("left", (_e, cx) => app.endResize(cx))
    .on_hover((hovered, cx) => { if (!hovered) app.endResize(cx); })
    .child(spec.table)
    .when(Boolean(area), (el) => el.child(card(t, app, area, spec)));
}
