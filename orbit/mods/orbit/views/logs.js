import { div } from "gpui-kit";
import { h_flex, v_flex, Input, v_virtual_list, Scrollbar } from "gpui-base";
import { filterLines, lineTone, clock } from "../model.js";
import { toneOf } from "./resources.js";
import { note, errorRow, icon, iconButton, kbd, stateDot, toneColor, ICONS } from "./widgets.js";
import { toolbar, metaText, emptyNote } from "./parts.js";

const LINE_PX = 18;

function resourceTab(app, t, one) {
  const isOn = one.name === app.state.logResource;
  return h_flex().id(`log-pick-${one.name}`).flex_none().h(24).px(8).gap(6).items_center().rounded(5).text_size(11.5).cursor_pointer()
    .border_b(2).border_color(isOn ? t.accent : t.background)
    .when(isOn, (el) => el.bg(t.selected).text_color(t.foreground).font_semibold())
    .when(!isOn, (el) => el.text_color(one.logs ? t.muted : t.dim).hover((s) => s.bg(t.hover)))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => app.pickLogResource(one.name, cx))
    .child(stateDot(toneOf(t, one.state), false))
    .child(one.name);
}

function resourceBar(app, t) {
  return h_flex().id("log-resources").flex_none().px(10).py(6).gap(3).items_center().border_b(1).border_color(t.border).overflow_x_scroll()
    .child(kbd(t, "[", false))
    .children(app.state.status.resources.map((one) => resourceTab(app, t, one)))
    .child(kbd(t, "]", false));
}

function filterBox(app, t) {
  return h_flex().id("log-filter").flex_1().min_w(0).h(26).px(8).gap(6).items_center().rounded(6).border_1()
    .border_color(app.state.filter ? t.accent : t.border).bg(t.surface)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(icon(ICONS.filter, 13, t.dim))
    .child(Input.new(app.filterInput).flex_1().h_full().text_size(11.5).text_color(t.foreground))
    .child(kbd(t, "/", false));
}

function meta(app) {
  const { logs } = app.state;
  const shown = filterLines(logs.lines, app.state.filter);
  const count = app.state.filter ? `${shown.length}/${logs.lines.length} lines` : `${logs.lines.length} lines`;
  return `${count} \u{b7} ${logs.loading ? "loading" : `updated ${clock(logs.at)}`}`;
}

function toolRow(app, t, shown) {
  const { follow, asking } = app.state;
  return toolbar(t)
    .child(filterBox(app, t))
    .child(metaText(t, meta(app)))
    .child(iconButton(t, "log-follow", follow ? "pause" : "play", (_e, cx) => app.toggle("follow", cx),
      { hotkey: "f", active: follow, label: follow ? "Following" : "Paused", tooltip: "Re-poll every 3 s and stick to the bottom" }))
    .child(iconButton(t, "log-copy", "copy", (_e, cx) => app.copyLines(shown.join("\n"), cx), { disabled: shown.length === 0, tooltip: "Copy the shown lines" }))
    .child(iconButton(t, "log-ask", "sparkles", (_e, cx) => app.askLogs(cx),
      { hotkey: "c", tone: "primary", disabled: asking || shown.length === 0, label: asking ? "Asking" : "Ask agent", tooltip: "Send the shown lines to the agent" }));
}

function lineRow(t, line, index) {
  const tone = lineTone(line);
  return div().id(`log-${index}`).h(LINE_PX).px(12).truncate().text_size(11.5).text_color(tone ? toneColor(t, tone) : t.foreground).child(line || " ");
}

function linesArea(app, t, shown) {
  const { logs } = app.state;
  if (logs.error && shown.length === 0) return errorRow(t, "logs-error", logs.error, (_e, cx) => app.refresh(cx));
  if (shown.length === 0) return emptyNote(t, ICONS.logs, logs.loading ? "Loading logs..." : app.state.filter ? "No lines match the filter" : "No log lines", "");
  return v_flex().relative().flex_1().min_h(0)
    .child(v_virtual_list("orbit-log-lines", shown.length, LINE_PX, (index) => String(index),
      (range) => shown.slice(range.start, range.end).map((line, offset) => lineRow(t, line, range.start + offset))).track_scroll(app.logScroll).flex_1())
    .child(Scrollbar.vertical("orbit-log-lines").absolute().inset_0());
}

export function logsView(app, t) {
  const { logs, logResource } = app.state;
  const shown = filterLines(logs.name === logResource ? logs.lines : [], app.state.filter);
  return v_flex().flex_1().min_h(0).bg(t.background)
    .child(resourceBar(app, t))
    .child(toolRow(app, t, shown))
    .when(Boolean(logs.error) && shown.length > 0, (el) => el.child(note(t, logs.error, "error")))
    .child(linesArea(app, t, shown));
}
