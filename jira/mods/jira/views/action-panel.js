import { div } from "gpui-kit";
import { v_flex, h_flex, Textarea } from "gpui-base";
import { argvText } from "../writes.js";
import { icon, button, statusPill, spinner, errorBox, categoryColor, shade, mono } from "./widgets.js";

const REVEAL = Object.freeze({ duration: 160, easing: "ease-out" });
const CATEGORY_ORDER = { new: 0, indeterminate: 1, done: 2 };

function frame(t, id, color, title, iconName) {
  return v_flex().id(id).flex_none().mx(10).mt(10).p(12).gap(8).rounded(10).bg(shade(color, "subtle")).border_1().border_color(shade(color, "border"))
    .opacity(1).transition("opacity", REVEAL)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(h_flex().gap(6).items_center().child(icon(iconName, 14, color)).child(div().text_size(12).font_bold().text_color(color).child(title)));
}

function statusOption(t, app, one, index, current) {
  const isCurrent = one.status === current;
  const color = categoryColor(t, one.category);
  return h_flex().id(`jira-st-${index}`).flex_none().h(28).px(8).gap(6).items_center().rounded(8).border_1()
    .border_color(isCurrent ? t.border : shade(color, "border")).bg(t.background)
    .when(!isCurrent, (el) => el.cursor_pointer().hover((s) => s.bg(shade(color, "soft"))).on_click((_e, cx) => app.pickStatus(one.status, cx)))
    .when(isCurrent, (el) => el.opacity(0.5).tooltip("current status"))
    .child(statusPill(t, one.status, one.category))
    .when(index < 9, (el) => el.child(div().text_size(10).text_color(t.dim).child(String(index + 1))));
}

export function sortStatuses(list) {
  return [...list].sort((a, b) => (CATEGORY_ORDER[a.category] ?? 3) - (CATEGORY_ORDER[b.category] ?? 3));
}

function transitionPick(t, app, issue) {
  const known = app.state.statuses;
  const list = sortStatuses(known.list);
  return frame(t, "jira-act-transition", t.ansi3, `Move ${issue.key} to\u{2026}`, "arrow-right")
    .child(div().text_size(10.5).text_color(t.dim).child(`Statuses seen on recent ${issue.type || "issues"} in ${issue.key.split("-")[0]}. Pick one, then confirm.`))
    .when(known.loading, (el) => el.child(spinner(t, "reading statuses")))
    .when(Boolean(known.error), (el) => el.child(errorBox(t, "jira-st-error", known.error, null)))
    .child(h_flex().gap(6).flex_wrap().children(list.map((one, index) => statusOption(t, app, one, index, issue.status))))
    .child(h_flex().gap(6).child(div().flex_1()).child(button(t, "jira-act-cancel", "Cancel", (_e, cx) => app.cancelAction(cx), { hotkey: "esc" })));
}

function commentPick(t, app, issue) {
  return frame(t, "jira-act-comment", t.ansi3, `Comment on ${issue.key}`, "message-square")
    .child(div().id("jira-comment-box").h(110).rounded(8).border_1().border_color(t.input).bg(t.background)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(Textarea.new(app.commentInput).size_full().text_size(12).text_color(t.foreground)))
    .child(h_flex().gap(6).items_center()
      .child(div().flex_1().text_size(10.5).text_color(t.dim).child("Plain text. Nothing is sent until you confirm."))
      .child(button(t, "jira-act-cancel", "Cancel", (_e, cx) => app.cancelAction(cx), { hotkey: "esc" }))
      .child(button(t, "jira-act-review", "Review", (_e, cx) => app.reviewComment(cx), { primary: true })));
}

function planLines(t, plan) {
  return v_flex().gap(3).children(plan.lines.map((line, index) => div().id(`jira-plan-${index}`).text_size(11.5)
    .text_color(index === 0 ? t.foreground : t.muted).child(line)));
}

function confirmCard(t, app, action) {
  const plan = action.plan;
  const running = action.stage === "running";
  return frame(t, "jira-act-confirm", t.ansi3, plan.title, "triangle-alert")
    .child(planLines(t, plan))
    .child(v_flex().gap(3)
      .child(div().text_size(10).font_bold().text_color(t.dim).child("RUNS EXACTLY"))
      .child(div().px(8).py(6).rounded(6).bg(t.background).border_1().border_color(t.border).font_family(mono()).text_size(11).text_color(t.foreground).child(argvText(plan))))
    .when(Boolean(action.error), (el) => el.child(errorBox(t, "jira-act-error", action.error ?? "", null)))
    .child(h_flex().gap(6).items_center()
      .when(running, (el) => el.child(spinner(t, "running acli")))
      .child(div().flex_1())
      .child(button(t, "jira-act-back", "Cancel", (_e, cx) => app.cancelAction(cx), { hotkey: "esc", disabled: running }))
      .child(button(t, "jira-act-run", "Confirm", (_e, cx) => app.confirmAction(cx), { danger: true, icon: "check", hotkey: "\u{21b5}", disabled: running })));
}

export function actionPanel(t, app, issue) {
  const action = app.state.action;
  if (!action || action.key !== issue.key) return null;
  if (action.stage === "confirm" || action.stage === "running") return confirmCard(t, app, action);
  if (action.kind === "transition") return transitionPick(t, app, issue);
  if (action.kind === "comment") return commentPick(t, app, issue);
  return null;
}
