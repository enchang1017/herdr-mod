import { div } from "gpui-kit";
import { v_flex, h_flex, HoverCard } from "gpui-base";
import { splitCells } from "../table.js";
import { overviewKey } from "../overview-source.js";
import { podModel } from "../model-pod.js";
import { formatCpu, formatMemory } from "../quantity.js";
import { toneColor, mono } from "./widgets.js";
import { meter, usageRatio } from "./meter.js";

const HOVER_RESOURCES = new Set(["pods", "deployments"]);
const SKIPPED = new Set(["NAME", "NAMESPACE"]);
const OPEN_DELAY_MS = 650;
const CLOSE_DELAY_MS = 120;
const CARD_WIDTH = 280;
const BAR_WIDTH = 110;

export function isHoverable(resource) {
  return HOVER_RESOURCES.has(resource);
}

function loadedPod(app, row) {
  const { overview, scope } = app.state;
  const data = overview.data;
  if (scope.resource !== "pods" || !data?.object || overview.key !== overviewKey(scope, row)) return null;
  return { model: podModel(data.object, data.metrics?.ok ? data.metrics.value : null, data.owners ?? []), node: data.object.spec?.nodeName ?? "" };
}

function factLine(t, label, value, color) {
  return h_flex().gap(8).items_center()
    .child(div().w(72).flex_none().text_color(t.dim).child(label))
    .child(div().flex_1().min_w(0).truncate().text_color(color ?? t.foreground).child(value));
}

function cellFacts(t, header, row) {
  return splitCells(header, row.line)
    .filter((cell) => !SKIPPED.has(cell.column) && cell.text.trim())
    .map((cell) => factLine(t, cell.column.toLowerCase(), cell.text.trim(), cell.tone === "plain" ? t.foreground : toneColor(t, cell.tone)));
}

function usageText(spec, format) {
  const base = spec.limit !== null ? `lim ${format(spec.limit)}` : spec.request !== null ? `req ${format(spec.request)}` : "no req/lim";
  return `${spec.usage === null ? "-" : format(spec.usage)} / ${base}`;
}

function usageLine(t, id, label, spec, format) {
  const ratio = usageRatio(spec);
  return h_flex().gap(8).items_center()
    .child(div().w(72).flex_none().text_color(t.dim).child(label))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(usageText(spec, format)))
    .when(spec.limit !== null || spec.request !== null, (el) => el.child(meter(t, id, { ratio, width: BAR_WIDTH, height: 5 })));
}

function podExtras(t, pod, key) {
  if (!pod) return [div().text_color(t.dim).child("usage: open the row to load metrics")];
  return [
    ...(pod.node ? [factLine(t, "node", pod.node)] : []),
    usageLine(t, `${key}-cpu`, "cpu", pod.model.usage.cpu, formatCpu),
    usageLine(t, `${key}-mem`, "memory", pod.model.usage.memory, formatMemory),
  ];
}

function hoverContent(app, t, row, key) {
  const isPod = app.state.scope.resource === "pods";
  return v_flex().w(CARD_WIDTH).px(10).py(8).gap(4).rounded(8).bg(t.popover).border_1().border_color(t.border).shadow_lg()
    .font_family(mono()).text_size(11).text_color(t.foreground)
    .child(div().truncate().font_bold().text_size(12).child(row.namespace ? `${row.namespace}/${row.name}` : row.name))
    .children(cellFacts(t, app.state.listing.header, row))
    .when(isPod, (el) => el.children(podExtras(t, loadedPod(app, row), key)))
    .child(div().pt(2).text_size(10).text_color(t.dim).child("click or enter for details"));
}

export function withHover(app, t, rowEl, rowId, index) {
  const key = `row-hover-${index}`;
  const card = HoverCard.new(key).anchor("top_left").open_delay(OPEN_DELAY_MS).close_delay(CLOSE_DELAY_MS).trigger(rowEl);
  const row = app.state.listing.rows.find((one) => one.id === rowId);
  return row ? card.content(hoverContent(app, t, row, key)) : card;
}
