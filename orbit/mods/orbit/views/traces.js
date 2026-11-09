import { div } from "gpui-kit";
import { v_flex, v_virtual_list, Scrollbar } from "gpui-base";
import { shownTraces } from "../actions.js";
import { formatMs, clockOf, clock, serviceColor, isErrorTrace } from "../model.js";
import { errorRow, iconButton, stateDot, ICONS } from "./widgets.js";
import { drawerArea, coveredWidth } from "./drawer.js";
import { cell, columnHeader, rowShell, toolbar, metaText, emptyNote, ROW_PX } from "./parts.js";
import { listHover, factLine } from "./row-hover.js";
import { meter } from "./meter.js";
import { traceDrawerSpec } from "./trace-drawer.js";

const COLUMNS = [["time", 64], ["status", 52], ["service", 120], ["duration", 120], ["spans", 56]];

function tools(app, t, list) {
  const { errorsOnly, includeHealth, traces } = app.state;
  const meta = `${list.length}/${traces.list.length} \u{b7} ${traces.loading ? "loading" : `updated ${clock(traces.at)}`}`;
  return toolbar(t)
    .child(iconButton(t, "tr-errors", "circle-x", (_e, cx) => app.toggle("errorsOnly", cx), { hotkey: "e", active: errorsOnly, label: errorsOnly ? "Errors only" : "All traces" }))
    .child(iconButton(t, "tr-health", "gauge", (_e, cx) => app.toggle("includeHealth", cx), { hotkey: "h", active: includeHealth, label: includeHealth ? "With health checks" : "No health checks" }))
    .child(div().flex_1())
    .child(metaText(t, meta));
}

function hoverSpec(t, trace) {
  const isError = isErrorTrace(trace);
  return {
    title: trace.rootName || "(unnamed)",
    lines: [
      factLine(t, "status", isError ? "error" : trace.status, isError ? t.ansi1 : t.ansi2), factLine(t, "root", trace.rootService, serviceColor(t, trace.rootService)),
      factLine(t, "duration", formatMs(trace.durationMs)), factLine(t, "spans", String(trace.spanCount)),
      factLine(t, "services", trace.services.join(", ") || "-"), factLine(t, "trace id", trace.id, t.dim),
    ],
  };
}

function traceRow(app, t, trace, slowest, index) {
  const isError = isErrorTrace(trace);
  const isSelected = trace.id === app.state.traceCursor;
  const ratio = slowest > 0 ? trace.durationMs / slowest : 0;
  const element = rowShell(t, `tr-${trace.id}`, { isSelected, isOpen: isSelected && Boolean(app.state.trace) }).w_full()
    .child(div().w(12).flex_none().child(stateDot(isError ? t.ansi1 : t.ansi2, false)))
    .child(cell(64, div().text_color(t.dim).child(clockOf(trace.start))))
    .child(cell(52, div().text_color(isError ? t.ansi1 : t.ansi2).font_semibold().child(isError ? "ERROR" : "ok")))
    .child(cell(120, div().text_color(serviceColor(t, trace.rootService)).child(trace.rootService)))
    .child(div().w(120).flex_none().flex().flex_row().gap(6).items_center()
      .child(meter(t, `tr-dur-${index}`, { ratio, width: 50, height: 4, color: isError ? t.ansi1 : t.accent }))
      .child(div().text_color(t.muted).child(formatMs(trace.durationMs))))
    .child(cell(56, div().text_color(t.dim).child(String(trace.spanCount))))
    .child(div().flex_1().min_w(0).truncate().text_color(isError ? t.ansi1 : t.foreground).child(trace.rootName || "(unnamed)"));
  return listHover(t, element, { key: `tr-hover-${index}`, build: () => hoverSpec(t, trace) });
}

function rowList(app, t, list, slowest) {
  return div().id("trace-rows-box").relative().flex_1().min_h(0)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(v_virtual_list("trace-rows", list.length, ROW_PX, (index) => list[index].id,
      (range) => list.slice(range.start, range.end).map((trace, offset) => traceRow(app, t, trace, slowest, range.start + offset)))
      .on_item_click((id, cx) => app.clickTrace(id, cx))
      .track_scroll(app.traceScroll).size_full())
    .child(Scrollbar.vertical("trace-rows").absolute().inset_0());
}

function table(app, t, list) {
  const { traces, errorsOnly } = app.state;
  const slowest = Math.max(0, ...list.map((one) => one.durationMs));
  const empty = traces.loading ? "Loading traces..." : errorsOnly ? "No error traces" : "No traces yet";
  return v_flex().flex_1().min_h(0).min_w(0).pr(app.state.trace ? coveredWidth(app) : 0)
    .child(columnHeader(t, COLUMNS, "ROOT SPAN"))
    .when(Boolean(traces.error), (el) => el.child(errorRow(t, "traces-error", traces.error, (_e, cx) => app.refresh(cx))))
    .when(list.length > 0, (el) => el.child(rowList(app, t, list, slowest)))
    .when(list.length === 0, (el) => el.child(v_flex().id("trace-rows").flex_1().min_h(0)
      .when(!traces.error, (inner) => inner.child(emptyNote(t, ICONS.traces, empty, app.state.includeHealth ? "" : "Health-check traces are hidden (h).")))));
}

export function tracesView(app, t) {
  const list = shownTraces(app);
  return v_flex().flex_1().min_h(0)
    .child(tools(app, t, list))
    .child(drawerArea(app, t, { ...traceDrawerSpec(app, t), table: table(app, t, list) }));
}
