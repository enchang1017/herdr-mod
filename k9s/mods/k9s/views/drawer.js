import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shortContext, isProdContext } from "../kubectl.js";
import { canWrite } from "../write-guard.js";
import { lokiHost } from "../grafana.js";
import { targetHint } from "../target.js";
import { tabsFor } from "../drawer-actions.js";
import { tint, toneColor, targetField } from "./widgets.js";
import { icon, iconButton, kbd, kindIcon } from "./icons.js";
import { drawerBody, emptyDrawer } from "./drawer-body.js";
import { writePanel } from "./write-panel.js";

const MOTION = { duration: 180, easing: "ease-out" };
const MIN_WIDTH = 420;
const DRAG_MIN = 360;
const HANDLE = 6;
const RATIO = 0.45;
const NARROW = 760;
const LIST_KEEP = 300;
const EDGE = 8;
const TAB_HEIGHT = 34;
const BAR_INSET = 54;
const KIND_NAMES = { pods: "pod", deployments: "deployment", services: "service", nodes: "node", ingresses: "ingress" };

export function drawerWidth(area, preferred) {
  if (area.width < NARROW) return Math.max(280, area.width - EDGE * 2);
  const wanted = typeof preferred === "number" ? Math.max(DRAG_MIN, preferred) : Math.max(MIN_WIDTH, Math.round(area.width * RATIO));
  return Math.max(DRAG_MIN, Math.min(area.width - LIST_KEEP, Math.round(wanted)));
}

export function isResizable(area) {
  return area.width >= NARROW;
}

function resizeHandle(t, app) {
  const isDragging = Boolean(app.resize);
  return div().id("dr-resize").absolute().top(0).left(0).w(HANDLE).h_full().cursor_col_resize()
    .flex().items_center().justify_center()
    .hover((s) => s.bg(tint(t.accent, "22")))
    .when(isDragging, (el) => el.bg(tint(t.accent, "33")))
    .on_mouse_down("left", (e, cx) => {
      cx.stop_propagation();
      app.beginResize(e, cx);
    })
    .child(div().w(2).h(28).rounded(1).bg(isDragging ? t.accent : tint(t.dim, "66")));
}

function modeBadge(t, context) {
  if (isProdContext(context)) return h_flex().flex_none().h(20).px(7).gap(4).items_center().rounded(5).bg(t.ansi1)
    .child(icon("shield-alert", 11, t.background)).child(div().text_size(10.5).font_bold().text_color(t.background).child("PRODUCTION \u{00b7} read-only"));
  const isWritable = canWrite(context);
  const color = isWritable ? t.ansi3 : t.muted;
  return h_flex().flex_none().h(20).px(7).gap(4).items_center().rounded(5).bg(tint(color, "1f")).border_1().border_color(tint(color, "55"))
    .child(icon(isWritable ? "lock-open" : "shield", 11, color)).child(div().text_size(10.5).font_semibold().text_color(color).child(isWritable ? "writable" : "read-only"));
}

function scopeChip(t, iconName, text, color) {
  return h_flex().flex_none().max_w(200).h(20).px(7).gap(4).items_center().rounded(5).bg(t.raised).border_1().border_color(t.border)
    .child(icon(iconName, 11, color)).child(div().truncate().text_size(10.5).text_color(t.foreground).child(text));
}

function readActions(t, app, row, tab) {
  const { scope } = app.state;
  const isText = tab === "yaml" || tab === "logs" || tab === "describe";
  const followable = scope.resource === "pods" || scope.resource === "deployments";
  const loki = lokiHost(scope.context, row.namespace ?? scope.namespace);
  return [
    ...(followable ? [iconButton(t, "dr-follow", "radio", (_e, cx) => app.followSelected(cx), { hotkey: "w", tooltip: "Follow logs live" })] : []),
    iconButton(t, "dr-ask", "sparkles", (_e, cx) => app.askAgent(cx), { hotkey: "c", tooltip: isText ? `Ask the agent about this ${tab}` : "Ask the agent to triage", disabled: app.state.asking }),
    ...(loki ? [iconButton(t, "dr-loki", "external-link", (_e, cx) => app.openLoki(cx), { tooltip: `Loki on ${loki}` })] : []),
    ...(isText ? [iconButton(t, "dr-copy", "copy", (_e, cx) => app.copyDetail(cx), { tooltip: "Copy the whole text" })] : []),
    iconButton(t, "dr-refresh", "rotate-cw", (_e, cx) => app.refreshDrawer(cx), { hotkey: "r", tooltip: "Reload this tab" }),
  ];
}

function writeActions(t, app) {
  const { scope } = app.state;
  if (!canWrite(scope.context) || (scope.resource !== "pods" && scope.resource !== "deployments")) return [];
  const isPod = scope.resource === "pods";
  return [
    div().flex_none().w(1).h(18).mx(2).bg(tint(t.ansi3, "66")),
    ...(isPod ? [iconButton(t, "dw-delete", "trash", (_e, cx) => app.beginWrite("delete", cx), { tone: "danger", hotkey: "\u{21e7}D", tooltip: "Delete pod" })] : []),
    iconButton(t, "dw-restart", "rotate-cw", (_e, cx) => app.beginWrite("restart", cx), { tone: "caution", hotkey: "\u{21e7}R", tooltip: "Rollout restart" }),
    iconButton(t, "dw-scale", "arrow-up-down", (_e, cx) => app.beginWrite("scale", cx), { tone: "caution", hotkey: "\u{21e7}S", tooltip: "Scale replicas" }),
    ...(isPod ? [iconButton(t, "dw-shell", "square-terminal", (_e, cx) => app.startShell(null, cx), { tone: "caution", hotkey: "s", tooltip: "Shell (/bin/sh) in a new tab" })] : []),
  ];
}

function header(t, app, row, tab, tone) {
  const { scope } = app.state;
  const color = toneColor(t, tone);
  return v_flex().flex_none().px(14).pt(12).pb(10).gap(9).bg(t.surface).border_b(1).border_color(t.border)
    .child(h_flex().gap(10).items_center()
      .child(div().flex_none().w(32).h(32).rounded(9).flex().items_center().justify_center().bg(tint(color, "22")).border_1().border_color(tint(color, "55"))
        .child(icon(kindIcon(scope.resource), 17, color)))
      .child(v_flex().flex_1().min_w(0)
        .child(div().id("dr-name").truncate().text_size(14).font_bold().text_color(t.foreground).tooltip(row.name).child(row.name))
        .child(div().text_size(10.5).text_color(t.dim).child(KIND_NAMES[scope.resource] ?? scope.resource)))
      .child(iconButton(t, "dr-close", "x", (_e, cx) => app.closeDetail(cx), { hotkey: "esc", tooltip: "Close" })))
    .child(h_flex().gap(5).items_center().flex_wrap()
      .child(scopeChip(t, "server", shortContext(scope.context), isProdContext(scope.context) ? t.ansi1 : t.ansi4))
      .when(scope.resource !== "nodes", (el) => el.child(scopeChip(t, "layers", row.namespace ?? scope.namespace, t.muted)))
      .child(modeBadge(t, scope.context)))
    .child(h_flex().gap(5).items_center().flex_wrap().children([...readActions(t, app, row, tab), ...writeActions(t, app)]));
}

function tabBar(t, app, width, current) {
  const tabs = tabsFor(app.state.scope.resource);
  const tabWidth = Math.floor((width - 16) / tabs.length);
  const at = Math.max(0, tabs.findIndex((one) => one.key === current));
  return div().id("dr-tabs").relative().flex_none().h(TAB_HEIGHT).px(8).flex().flex_row().items_center().border_b(1).border_color(t.border).bg(t.surface)
    .children(tabs.map((one, index) => h_flex().id(`dr-tab-${one.key}`).w(tabWidth).h_full().gap(5).items_center().justify_center().cursor_pointer()
      .hover((s) => s.bg(t.hover)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => app.setTab(one.key, cx))
      .child(icon(one.icon, 13, one.key === current ? t.accent : t.dim))
      .when(tabWidth >= 92, (el) => el.child(div().text_size(11.5).font_semibold().text_color(one.key === current ? t.foreground : t.muted).child(one.label)))
      .when(tabWidth >= 112, (el) => el.child(kbd(t, String(index + 1), false)))))
    .child(div().id("dr-tab-ink").absolute().bottom(0).left(8 + at * tabWidth + 10).w(tabWidth - 20).h(2).rounded(1).bg(t.accent).transition("left", MOTION));
}

function footer(t, app) {
  const via = app.state.overview.data?.via ?? app.proxies.mode(app.state.scope.context);
  return h_flex().flex_none().px(10).py(7).gap(8).items_center().border_t(1).border_color(t.border).bg(t.surface)
    .child(targetField(t, "dr-target", app.targetInput, app.targetInput.value().trim() ? targetHint(app.targetInput.value()) : ""))
    .child(h_flex().id("dr-via").flex_none().gap(4).items_center().tooltip(via === "proxy" ? "Read-only kubectl proxy (GET only)" : "One kubectl process per call")
      .child(icon("plug", 11, via === "proxy" ? t.ansi2 : t.dim)).child(div().text_size(10.5).text_color(via === "proxy" ? t.ansi2 : t.dim).child(via)));
}

function card(t, app, area, spec) {
  const width = drawerWidth(area, app.state.drawerWidth);
  const left = spec.open ? area.width - EDGE - width : area.width + EDGE;
  const drawer = app.state.drawer;
  const tab = drawer?.tab ?? "overview";
  const ui = { tab, token: drawer?.token ?? 0, revealed: drawer?.revealed === true, key: spec.key, barWidth: width - BAR_INSET, canShell: canWrite(app.state.scope.context) };
  return v_flex().id("k9s-drawer").absolute().top(4).left(left).w(width).h(Math.max(160, area.height - 8))
    .opacity(spec.open ? 1 : 0).when(!app.resize, (el) => el.transition("left", MOTION)).transition("opacity", MOTION)
    .rounded(12).border_1().border_color(spec.tone === "error" ? tint(t.ansi1, "88") : t.border).bg(t.popover).shadow_lg().overflow_hidden()
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .when(!spec.row, (el) => el.child(emptyDrawer(t)))
    .when(Boolean(spec.row), (el) => el
      .child(header(t, app, spec.row, tab, spec.tone))
      .child(writePanel(t, app) ?? div())
      .child(tabBar(t, app, width, tab))
      .child(drawerBody(t, app, ui))
      .child(footer(t, app)))
    .when(spec.open && isResizable(area), (el) => el.child(resizeHandle(t, app)));
}

export function drawerArea(app, t, spec) {
  const area = app.drawerArea;
  return div().id("k9s-drawer-area").relative().flex().flex_col().flex_1().min_h(0).overflow_hidden()
    .on_size_change((size, cx) => app.measureDrawer(size, cx))
    .on_mouse_move((e, cx) => app.moveResize(e, cx))
    .on_mouse_up("left", (_e, cx) => app.endResize(cx))
    .on_hover((hovered, cx) => { if (!hovered) app.endResize(cx); })
    .child(spec.table)
    .when(Boolean(area), (el) => el.child(card(t, app, area, spec)));
}
