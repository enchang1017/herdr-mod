import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { icon, iconButton, typeLook, statusPill, priorityIcon, avatar, chip, shade, mono } from "./widgets.js";
import { drawerBody } from "./drawer-body.js";
import { actionPanel } from "./action-panel.js";

const MOTION = Object.freeze({ duration: 180, easing: "ease-out" });
const MIN_WIDTH = 440;
const DRAG_MIN = 360;
const HANDLE = 6;
const RATIO = 0.5;
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

function resizeHandle(t, app) {
  const isDragging = Boolean(app.resize);
  return div().id("jira-dr-resize").absolute().top(0).left(0).w(HANDLE).h_full().cursor_col_resize().flex().items_center().justify_center()
    .hover((s) => s.bg(shade(t.accent, "soft")))
    .when(isDragging, (el) => el.bg(shade(t.accent, "hover")))
    .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); app.beginResize(e, cx); })
    .child(div().w(2).h(28).rounded(1).bg(isDragging ? t.accent : shade(t.dim, "border")));
}

function titleRow(t, app, issue) {
  const look = typeLook(t, issue.type);
  return h_flex().gap(10).items_center()
    .child(div().flex_none().w(34).h(34).rounded(9).flex().items_center().justify_center().bg(shade(look.color, "soft")).border_1().border_color(shade(look.color, "border"))
      .child(icon(look.name, 18, look.color)))
    .child(v_flex().flex_1().min_w(0)
      .child(div().font_family(mono()).text_size(14).font_bold().text_color(t.accent).child(issue.key))
      .child(div().text_size(10.5).text_color(t.dim).child(issue.type || "work item")))
    .child(iconButton(t, "jira-dr-close", "x", (_e, cx) => app.closeDrawer(cx), { hotkey: "esc", tooltip: "Close" }));
}

function epicChip(t, app, epic) {
  return h_flex().id("jira-dr-epic").flex_none().cursor_pointer().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .tooltip(`${epic.key} ${epic.summary}`.trim()).on_click((_e, cx) => app.openKey(epic.key, cx))
    .child(chip(t, "layers", `${epic.key} ${epic.summary}`.trim(), t.ansi5));
}

function chipsRow(t, app, issue, detail) {
  return h_flex().gap(5).items_center().flex_wrap()
    .child(statusPill(t, issue.status, issue.category))
    .child(h_flex().flex_none().h(20).px(7).gap(4).items_center().rounded(5).bg(t.raised).border_1().border_color(t.border)
      .child(priorityIcon(t, issue.priority, 12)).child(div().text_size(10.5).child(issue.priority || "no priority")))
    .child(h_flex().flex_none().h(20).pl(2).pr(7).gap(5).items_center().rounded(10).bg(t.raised).border_1().border_color(t.border)
      .child(avatar(t, issue.assignee, 16)).child(div().text_size(10.5).text_color(issue.assignee ? t.foreground : t.dim).child(issue.assignee || "Unassigned")))
    .when(Boolean(detail?.sprint), (el) => el.child(chip(t, "zap", detail?.sprint ?? "", t.ansi4)))
    .when(Boolean(detail?.epic), (el) => el.child(epicChip(t, app, detail.epic)));
}

function writeButtons(t, app, issue, busy) {
  const kind = app.state.action?.kind;
  const assign = issue.assignee && issue.assignee === app.state.me ? "unassign" : "assign";
  return [
    iconButton(t, "jira-dw-status", "arrow-right", (_e, cx) => app.beginAction("transition", cx), { tone: "write", label: "Status", hotkey: "t", active: kind === "transition", disabled: busy }),
    iconButton(t, "jira-dw-assign", assign === "assign" ? "user-check" : "user-x", (_e, cx) => app.beginAction(assign, cx),
      { tone: "write", label: assign === "assign" ? "Assign me" : "Unassign", hotkey: "a", active: kind === assign, disabled: busy }),
    iconButton(t, "jira-dw-comment", "message-square", (_e, cx) => app.beginAction("comment", cx), { tone: "write", label: "Comment", hotkey: "m", active: kind === "comment", disabled: busy }),
  ];
}

function readButtons(t, app) {
  return [
    iconButton(t, "jira-dr-dev", "rocket", (_e, cx) => app.startDev(cx), { tone: "go", label: "Start dev", hotkey: "d", tooltip: "Open Team \u{b7} Start dev with this key and its plan link" }),
    iconButton(t, "jira-dr-copy", "copy", (_e, cx) => app.copyKey(cx), { hotkey: "c", tooltip: "Copy the key" }),
    iconButton(t, "jira-dr-branch", "git-branch", (_e, cx) => app.copyBranch(cx), { hotkey: "b", tooltip: "Copy a branch name" }),
    iconButton(t, "jira-dr-web", "external-link", (_e, cx) => app.browse(cx), { hotkey: "o", tooltip: "Open in the browser" }),
    iconButton(t, "jira-dr-refresh", "rotate-cw", (_e, cx) => app.refreshDetail(cx), { hotkey: "r", tooltip: "Reload this issue" }),
  ];
}

function drawerHeader(t, app, issue, detail) {
  const busy = app.state.action?.stage === "running";
  return v_flex().flex_none().px(14).pt(12).pb(10).gap(9).bg(t.surface).border_b(1).border_color(t.border)
    .child(titleRow(t, app, issue))
    .child(div().text_size(13.5).font_semibold().text_color(t.foreground).child(issue.summary))
    .child(chipsRow(t, app, issue, detail))
    .child(h_flex().gap(5).items_center().flex_wrap()
      .children(writeButtons(t, app, issue, busy))
      .child(div().flex_none().w(1).h(18).mx(2).bg(t.border))
      .children(readButtons(t, app)));
}

function drawerCard(t, app, area) {
  const width = drawerWidth(area, app.state.drawerWidth);
  const isOpen = Boolean(app.state.drawer);
  const shown = app.drawnIssue();
  const left = isOpen ? area.width - EDGE - width : area.width + EDGE;
  const detail = shown ? app.detailFor(shown.key) : null;
  return v_flex().id("jira-drawer").absolute().top(4).left(left).w(width).h(Math.max(160, area.height - 8))
    .opacity(isOpen ? 1 : 0).when(!app.resize, (el) => el.transition("left", MOTION)).transition("opacity", MOTION)
    .rounded(12).border_1().border_color(t.border).bg(t.popover).shadow_lg().overflow_hidden()
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .when(Boolean(shown), (el) => el
      .child(drawerHeader(t, app, shown, detail))
      .child(actionPanel(t, app, shown) ?? div())
      .child(drawerBody(t, app, shown.key)))
    .when(isOpen && isResizable(area), (el) => el.child(resizeHandle(t, app)));
}

export function drawerArea(app, t, table) {
  const area = app.drawerArea;
  return div().id("jira-drawer-area").relative().flex().flex_col().flex_1().min_h(0).overflow_hidden()
    .on_size_change((size, cx) => app.measureDrawer(size, cx))
    .on_mouse_move((e, cx) => app.moveResize(e, cx))
    .on_mouse_up("left", (_e, cx) => app.endResize(cx))
    .on_hover((hovered, cx) => { if (!hovered) app.endResize(cx); })
    .child(table)
    .when(Boolean(area), (el) => el.child(drawerCard(t, app, area)));
}
