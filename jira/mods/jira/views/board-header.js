import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import * as board from "../board-controller.js";
import { progressOf, daysLeft } from "../board-model.js";
import { labelColor } from "./board-card.js";
import { icon, iconButton, avatar, kbd, shade } from "./widgets.js";

const BAR_WIDTH = 160;
const MOTION = Object.freeze({ duration: 520, easing: "ease-out" });
const GOAL_CHARS = 80;

function progressBar(t, entry) {
  const { done, total } = progressOf(entry);
  const ratio = total ? done / total : 0;
  const tip = `${done} of ${total} sub-tasks done`;
  return h_flex().id("jira-board-progress").flex_none().gap(7).items_center().tooltip(tip)
    .child(div().flex_none().w(BAR_WIDTH).h(7).rounded(4).bg(t.raised).border_1().border_color(t.border).overflow_hidden()
      .child(div().id("jira-board-progress-fill").h_full().w(Math.round(ratio * BAR_WIDTH)).bg(t.ansi2).transition("width", MOTION)))
    .child(div().flex_none().text_size(10.5).font_semibold().text_color(t.ansi2).child(`${Math.round(ratio * 100)}%`))
    .child(div().flex_none().text_size(10.5).text_color(t.dim).child(`${done}/${total}`));
}

function daysChip(t, sprint) {
  const left = daysLeft(sprint);
  if (left === null) return div();
  const color = left <= 1 ? t.ansi1 : left <= 3 ? t.ansi3 : t.muted;
  const text = left < 0 ? `${-left}d over` : left === 0 ? "ends today" : `${left}d left`;
  const tip = sprint.end ? `ends ${new Date(sprint.end).toLocaleString()}` : "";
  return h_flex().id("jira-board-days").flex_none().h(20).px(7).gap(4).items_center().rounded(5).bg(shade(color, "subtle")).border_1().border_color(shade(color, "border"))
    .tooltip(tip).child(icon("calendar", 11, color)).child(div().text_size(10.5).font_semibold().text_color(color).child(text));
}

function goalText(goal) {
  return goal.length > GOAL_CHARS ? `${goal.slice(0, GOAL_CHARS - 1)}\u{2026}` : goal;
}

function sprintStrip(app, t) {
  const entry = app.state.boardEntry;
  const sprint = entry?.sprint;
  const all = board.filterChips(app).length;
  return h_flex().flex_none().h(36).px(12).gap(10).items_center().border_b(1).border_color(t.border)
    .child(icon("square-kanban", 15, t.accent))
    .child(div().flex_none().text_size(12.5).font_bold().text_color(t.foreground).child(sprint?.name ?? "Active sprint"))
    .child(daysChip(t, sprint))
    .child(h_flex().id("jira-board-goal").flex_1().min_w(0).gap(5).items_center().when(Boolean(sprint?.goal), (el) => el.tooltip(sprint?.goal ?? ""))
      .when(Boolean(sprint?.goal), (el) => el.child(icon("target", 12, t.ansi5)).child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child(goalText(sprint?.goal ?? "")))))
    .when(Boolean(entry), (el) => el.child(progressBar(t, entry)))
    .child(iconButton(t, "jira-board-all", app.state.collapsed.length ? "chevrons-up-down" : "chevrons-down-up", (_e, cx) => board.toggleAllLanes(app, cx),
      { hotkey: "Z", tooltip: app.state.collapsed.length ? "Expand all lanes" : "Collapse all lanes", disabled: !all && !entry }));
}

function labelToggle(app, t, chip, index) {
  const isOn = app.state.boardFilter.labels.includes(chip.name);
  const isFocused = app.state.labelFocus === index;
  const color = labelColor(t, chip.name);
  return h_flex().id(`jira-bl-${chip.name}`).flex_none().h(22).px(8).gap(5).items_center().rounded(11).cursor_pointer()
    .bg(isOn ? color : shade(color, "subtle")).border_1().border_color(isFocused ? t.foreground : shade(color, isOn ? "strong" : "border"))
    .hover((s) => s.bg(isOn ? shade(color, "strong") : shade(color, "soft")))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => board.toggleLabel(app, chip.name, cx))
    .child(icon(isOn ? "check" : "tag", 11, isOn ? t.background : color))
    .child(div().text_size(11).font_semibold().text_color(isOn ? t.background : color).child(chip.name))
    .child(div().text_size(10).text_color(isOn ? t.background : t.dim).child(String(chip.count)));
}

function assigneeToggle(app, t, chip, index) {
  const isOn = app.state.boardFilter.assignees.includes(chip.name);
  const isFocused = app.state.labelFocus === index;
  return div().id(`jira-ba-${index}`).flex_none().p(1).rounded_full().cursor_pointer().border_2()
    .border_color(isFocused ? t.foreground : isOn ? t.accent : shade(t.accent, "clear"))
    .when(!isOn && app.state.boardFilter.assignees.length > 0, (el) => el.opacity(0.45))
    .hover((s) => s.opacity(1))
    .tooltip(`${chip.name} \u{b7} ${chip.count}`)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => board.toggleAssignee(app, chip.name, cx))
    .child(avatar(t, chip.name, 22));
}

function focusHint(app, t) {
  if (app.state.labelFocus === null) return h_flex().flex_none().gap(4).items_center().child(kbd(t, "L", false)).child(div().text_size(10).text_color(t.dim).child("filter keys"));
  return div().flex_none().text_size(10).text_color(t.accent).child("h/l pick \u{b7} space toggle \u{b7} x clear \u{b7} esc done");
}

function filterBar(app, t) {
  const chips = board.filterChips(app);
  const { labels, assignees, onlyMine: mine } = app.state.boardFilter;
  const active = Boolean(labels.length || assignees.length || mine);
  return h_flex().flex_none().min_h(38).px(12).py(6).gap(6).items_center().flex_wrap().border_b(1).border_color(t.border)
    .when(app.state.labelFocus !== null, (el) => el.bg(shade(t.accent, "subtle")))
    .child(icon("tag", 13, t.dim))
    .children(chips.map((chip, index) => [chip, index]).filter(([chip]) => chip.kind === "label").map(([chip, index]) => labelToggle(app, t, chip, index)))
    .child(div().flex_none().w(1).h(18).mx(4).bg(t.border))
    .child(icon("users", 13, t.dim))
    .children(chips.map((chip, index) => [chip, index]).filter(([chip]) => chip.kind === "assignee").map(([chip, index]) => assigneeToggle(app, t, chip, index)))
    .child(div().flex_none().w(1).h(18).mx(4).bg(t.border))
    .child(iconButton(t, "jira-board-mine", "user", (_e, cx) => board.toggleMine(app, cx), { label: "Only mine", hotkey: "u", active: mine, disabled: !app.state.me, tooltip: app.state.me ? `Only ${app.state.me}` : "Learning who you are\u{2026}" }))
    .when(active, (el) => el.child(iconButton(t, "jira-board-clear", "x", (_e, cx) => board.clearFilters(app, cx), { label: "Clear", hotkey: "x", tooltip: "Clear label, people and mine filters" })))
    .child(div().flex_1())
    .child(focusHint(app, t));
}

export function boardHeader(app, t) {
  return v_flex().flex_none().child(sprintStrip(app, t)).child(filterBar(app, t));
}
