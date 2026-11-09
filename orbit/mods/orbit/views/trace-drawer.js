import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { formatMs, clockOf, waterfall, serviceColor, isErrorTrace, lineTone } from "../model.js";
import { note, errorRow, iconButton, toneColor, shade, ICONS } from "./widgets.js";
import { drawerWidth } from "./drawer.js";
import { section, factGrid, pill } from "./parts.js";

const NAME_PX = 170;
const DURATION_PX = 56;
const ROW_CHROME = 28 + 16;
const MIN_BAR = 60;
const MAX_LOG_ROWS = 400;

function barWidth(app) {
  const area = app.drawerArea;
  const width = area ? drawerWidth(area, app.state.drawerWidth) : 420;
  return Math.max(MIN_BAR, width - NAME_PX - DURATION_PX - ROW_CHROME);
}

function spanRow(t, row, index, bar) {
  const { span } = row;
  const isError = span.status === "error";
  const color = serviceColor(t, span.service);
  return h_flex().id(`span-${index}`).flex_none().h(22).mx(14).gap(8).items_center().text_size(11.5).rounded(4)
    .when(isError, (el) => el.bg(shade(t.ansi1, "subtle")))
    .tooltip(`${span.service} \u{b7} ${span.name || "(unnamed)"}${span.kind ? ` \u{b7} ${span.kind}` : ""}`)
    .child(h_flex().w(NAME_PX).flex_none().min_w(0).gap(5).items_center().pl(Math.min(row.depth, 10) * 10)
      .child(div().flex_none().max_w(70).truncate().text_color(color).font_semibold().child(span.service))
      .child(div().flex_1().min_w(0).truncate().text_color(isError ? t.ansi1 : t.foreground).child(span.name || "(unnamed)")))
    .child(div().w(bar).flex_none().h(8).rounded(3).bg(t.raised)
      .child(div().ml(row.offset * bar).w(Math.max(row.width * bar, 2)).h_full().rounded(3).bg(isError ? t.ansi1 : color)))
    .child(div().w(DURATION_PX).flex_none().text_color(isError ? t.ansi1 : t.muted).child(formatMs(span.durationMs)));
}

function logRows(t, logs) {
  if (logs.length === 0) return [div().mx(14).text_size(11.5).text_color(t.dim).child("No log lines carry this trace id.")];
  return logs.slice(-MAX_LOG_ROWS).map((line, index) => div().id(`tl-${index}`).mx(14).text_size(11)
    .text_color(lineTone(line) ? toneColor(t, lineTone(line)) : t.foreground).child(line));
}

function detailBody(app, t, trace) {
  if (trace.loading) return note(t, "Loading trace...");
  if (trace.error) return errorRow(t, "trace-error", trace.error, (_e, cx) => app.openTraceRow(trace.id, cx));
  const detail = trace.detail;
  const rows = waterfall(detail);
  const bar = barWidth(app);
  const isError = isErrorTrace(detail);
  return v_flex()
    .child(section(t, "Summary", "gauge"))
    .child(factGrid(t, "trace-facts", [["status", isError ? "error" : detail.status, isError ? t.ansi1 : t.ansi2], ["duration", formatMs(detail.durationMs)],
      ["started", clockOf(detail.start)], ["spans", String(detail.spans.length)], ["services", detail.services.join(", ") || "-"], ["trace id", trace.id]]))
    .child(section(t, `Waterfall ${rows.length}`, ICONS.traces))
    .children(rows.length ? rows.map((row, index) => spanRow(t, row, index, bar)) : [div().mx(14).text_size(11.5).text_color(t.dim).child("No spans in this trace.")])
    .child(section(t, `Logs ${trace.logs.length}`, ICONS.logs))
    .children(logRows(t, trace.logs));
}

function titleOf(trace) {
  const detail = trace.detail;
  return detail ? `${detail.rootService} \u{b7} ${detail.rootName || "(unnamed)"}` : `Trace ${trace.id.slice(0, 8)}`;
}

export function traceDrawerSpec(app, t) {
  const trace = app.state.trace ?? app.state.lastTrace;
  if (!trace) return { id: "traces", open: false };
  const detail = trace.detail;
  const isError = detail ? isErrorTrace(detail) : false;
  const color = isError ? t.ansi1 : t.accent;
  return {
    id: "traces", open: Boolean(app.state.trace), icon: ICONS.traces, tone: color, alert: isError,
    title: titleOf(trace), subtitle: detail ? `${clockOf(detail.start)} \u{b7} ${trace.id}` : trace.id,
    chips: detail ? [pill(t, isError ? "error" : detail.status, isError ? t.ansi1 : t.ansi2), pill(t, formatMs(detail.durationMs), t.accent, "clock"), pill(t, `${detail.spans.length} spans`, t.muted, "layers")] : [],
    actions: [
      iconButton(t, "tr-ask", "sparkles", (_e, cx) => app.askTrace(cx), { hotkey: "c", tone: "primary", disabled: app.state.asking || !detail, label: app.state.asking ? "Asking" : "Ask agent", tooltip: "Send this trace to the agent" }),
      iconButton(t, "tr-copy-id", "copy", (_e, cx) => app.copyLines(trace.id, cx), { tooltip: "Copy trace id" }),
      iconButton(t, "tr-reload", "rotate-cw", (_e, cx) => app.openTraceRow(trace.id, cx), { tooltip: "Reload this trace" }),
    ],
    body: detailBody(app, t, trace),
  };
}
