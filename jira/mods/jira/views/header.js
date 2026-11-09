import { div } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";
import { props } from "herdr";
import { VIEWS } from "../queries.js";
import { clock } from "../text.js";
import { icon, kbd, button, spinner, categoryColor, shade } from "./widgets.js";

const BAR_WIDTH = 150;
const BAR_MOTION = Object.freeze({ duration: 520, easing: "ease-out" });
const CATEGORIES = ["done", "indeterminate", "new"];
const CATEGORY_WORDS = { done: "done", indeterminate: "in progress", new: "to do" };
const BOARD_HINTS = [["hjkl", "move"], ["\u{21b5}", "open"], ["space", "fold"], ["Z", "fold all"], ["[ ]", "move card"], ["L", "labels"], ["u", "mine"], ["x", "clear"], ["/", "search"], ["r", "refresh"], ["R", "remap"], ["1-7", "views"]];
const HINTS = [["j/k", "move"], ["\u{21b5}", "open"], ["esc", "close"], ["1-7", "views"], ["/", "search"], ["r", "refresh"], ["t", "status"], ["a", "assign"], ["m", "comment"], ["b", "branch"], ["d", "start dev"], ["o", "open"]];

function counts(rows) {
  return CATEGORIES.map((key) => ({ key, count: rows.filter((row) => row.category === key).length }));
}

function distribution(t, rows) {
  const total = rows.length || 1;
  const parts = counts(rows);
  const tip = parts.map((one) => `${one.count} ${CATEGORY_WORDS[one.key]}`).join(" \u{b7} ");
  return h_flex().id("jira-dist").flex_none().w(BAR_WIDTH).h(6).rounded(3).bg(t.raised).overflow_hidden().tooltip(tip)
    .children(parts.map((one) => div().id(`jira-dist-${one.key}`).h_full().w(Math.round((one.count / total) * BAR_WIDTH))
      .bg(categoryColor(t, one.key)).transition("width", BAR_MOTION)));
}

function meta(app, t) {
  if (app.loadState().loading) return spinner(t, "loading");
  const at = app.state.at;
  return div().flex_none().text_size(10.5).text_color(t.dim).child(at ? `updated ${clock(at)}` : "");
}

function placeButton(app, t) {
  const isWindow = Boolean(props()?.overlay);
  const tooltip = isWindow ? "Dock beside the focused pane (\u{2318}\u{21b5}). New tab: \u{2318}\u{21e7}T" : "Back to a floating window (\u{2318}\u{21b5})";
  return button(t, "jira-place", isWindow ? "Dock" : "Float", (_e, cx) => app.togglePlace(cx), { hotkey: "\u{2318}\u{21b5}", tooltip });
}

function topBar(app, t) {
  return h_flex().flex_none().h(44).px(12).gap(10).items_center().bg(t.surface).border_b(1).border_color(t.border)
    .child(div().flex_none().w(28).h(28).rounded(8).flex().items_center().justify_center().bg(shade(t.accent, "soft")).border_1().border_color(shade(t.accent, "border"))
      .child(icon("ticket", 16, t.accent)))
    .child(v_flex().flex_none()
      .child(div().text_size(13.5).font_bold().text_color(t.foreground).child("Jira"))
      .child(div().text_size(10).text_color(t.dim).child(app.state.site ?? "acli")))
    .child(div().flex_1())
    .when(app.state.rows.length > 0, (el) => el.child(distribution(t, app.state.rows)))
    .child(meta(app, t))
    .child(button(t, "jira-refresh", "Refresh", (_e, cx) => app.refresh(cx), { icon: "rotate-cw", hotkey: "r", disabled: app.loadState().loading }))
    .child(placeButton(app, t));
}

function viewTab(app, t, view, index) {
  const isCurrent = view.key === app.state.view;
  const color = isCurrent ? t.solid_foreground : t.muted;
  return h_flex().id(`jira-view-${view.key}`).flex_1().max_w(170).h(28).px(8).gap(6).items_center().justify_center().rounded(6)
    .text_size(11).cursor_pointer()
    .when(isCurrent, (el) => el.bg(t.solid).font_semibold())
    .when(!isCurrent, (el) => el.hover((s) => s.bg(t.hover)))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => app.pickView(view.key, cx))
    .child(icon(view.icon, 13, isCurrent ? t.solid_foreground : t.dim))
    .child(div().text_color(color).child(view.label))
    .when(isCurrent && !app.loadState().loading, (el) => el.child(div().text_size(10).text_color(color).child(String(app.state.rows.length))))
    .child(kbd(t, String(index + 1), isCurrent));
}

function viewBar(app, t) {
  return h_flex().mx(10).mt(8).p(2).gap(2).rounded(8).bg(t.surface).border_1().border_color(t.border).flex_wrap()
    .children(VIEWS.map((view, index) => viewTab(app, t, view, index)));
}

function inputBox(t, id, iconName, input, isActive) {
  return h_flex().id(id).flex_1().min_w(0).h(28).px(8).gap(6).items_center().rounded(7).border_1()
    .border_color(isActive ? t.accent : t.border).bg(t.background)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(icon(iconName, 13, isActive ? t.accent : t.dim))
    .child(Input.new(input).flex_1().h_full().text_size(11.5).text_color(t.foreground));
}

function filterRow(app, t) {
  const shown = app.shownRows().length;
  const total = app.state.rows.length;
  return v_flex().px(10).pt(8).pb(6).gap(6)
    .when(app.state.view === "jql", (el) => el.child(h_flex().gap(6).items_center()
      .child(inputBox(t, "jira-jql", "filter", app.jqlInput, app.typing.has("jql")))
      .child(button(t, "jira-jql-run", "Run", (_e, cx) => app.runJql(cx), { primary: true, hotkey: "\u{21b5}" }))))
    .child(h_flex().gap(8).items_center()
      .child(inputBox(t, "jira-filter", "search", app.filterInput, Boolean(app.state.filter)))
      .child(div().flex_none().text_size(10.5).text_color(t.dim).child(shown === total ? `${total} items` : `${shown} of ${total}`))
      .child(kbd(t, "/", false)));
}

export function header(app, t) {
  return v_flex().flex_none().child(topBar(app, t)).child(viewBar(app, t)).child(filterRow(app, t));
}

export function keyHint(app, t) {
  return h_flex().flex_none().h(24).px(10).gap(10).items_center().bg(t.surface).border_t(1).border_color(t.border).overflow_hidden()
    .when(Boolean(app.state.message), (el) => el.child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.ansi3).child(app.state.message)))
    .when(!app.state.message, (el) => el.children((app.state.view === "board" ? BOARD_HINTS : HINTS).map(([key, word]) => h_flex().flex_none().gap(4).items_center()
      .child(kbd(t, key, false)).child(div().text_size(10).text_color(t.dim).child(word)))));
}
