import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { toneColor, tint, mono } from "./widgets.js";
import { icon } from "./icons.js";
import { section, factGrid, usageBar, conditionRows, textList, emptyNote, pill } from "./parts.js";
import { hero } from "./overview-pod.js";
import { formatCpu, formatMemory, age } from "../quantity.js";

const BAR_MOTION = { duration: 520, easing: "ease-out" };

function replicaBar(t, id, label, value, desired, ui) {
  const ratio = desired > 0 ? Math.min(1, value / desired) : 1;
  const tone = value >= desired ? "success" : value === 0 ? "error" : "warning";
  return h_flex().gap(10).items_center()
    .child(div().w(70).flex_none().text_size(11.5).text_color(t.muted).child(label))
    .child(div().id(id).relative().flex_1().h(8).rounded(4).bg(t.raised)
      .child(div().id(`${id}-fill`).absolute().top(0).left(0).h(8).rounded(4).bg(toneColor(t, tone))
        .w(ui.revealed ? ratio * (ui.barWidth - 150) : 0).transition("width", BAR_MOTION)))
    .child(div().w(52).flex_none().text_size(12).font_bold().text_color(toneColor(t, tone)).child(`${value}/${desired}`));
}

function replicasBlock(t, replicas, ui) {
  return v_flex().mx(14).px(12).py(10).gap(9).rounded(10).bg(t.surface).border_1().border_color(t.border)
    .children(replicas.bars.map(([label, value], index) => replicaBar(t, `rep-${index}`, label, value, replicas.desired, ui)));
}

function imageRows(t, images) {
  return v_flex().mx(14).gap(5).children(images.map((one, index) => h_flex().id(`img-${index}`).gap(8).items_center().tooltip(one.image)
    .child(icon("container", 13, t.muted))
    .child(div().flex_none().text_size(11.5).text_color(t.foreground).child(one.name))
    .child(div().flex_1().min_w(0).truncate().font_family(mono()).text_size(11).text_color(t.dim).child(one.image))));
}

function rolloutRows(t, rollouts) {
  return v_flex().mx(14).rounded(10).border_1().border_color(t.border).overflow_hidden()
    .children(rollouts.map((one, index) => h_flex().id(`ro-${index}`).px(10).py(6).gap(8).items_center().tooltip(one.images)
      .when(index > 0, (el) => el.border_t(1).border_color(t.border))
      .when(index === 0, (el) => el.bg(tint(t.accent, "10")))
      .child(div().w(34).flex_none().text_size(11.5).font_bold().text_color(index === 0 ? t.accent : t.muted).child(`#${one.revision}`))
      .child(div().flex_1().min_w(0).truncate().font_family(mono()).text_size(11).text_color(t.foreground).child(one.images))
      .child(div().flex_none().text_size(11).text_color(one.replicas > 0 ? t.ansi2 : t.dim).child(`${one.ready}/${one.replicas}`))
      .child(div().w(44).flex_none().text_size(10.5).text_color(t.dim).child(age(one.created)))));
}

export function workloadOverview(t, model, ui) {
  return v_flex().pb(14)
    .child(hero(t, model.headline, null))
    .child(section(t, "Replicas", "layers"))
    .child(replicasBlock(t, model.replicas, ui))
    .child(section(t, "Overview", "gauge"))
    .child(factGrid(t, "wl-facts", model.facts))
    .child(section(t, "Images", "container"))
    .child(imageRows(t, model.images))
    .when(model.rollouts.length > 0, (el) => el.child(section(t, "Recent rollouts", "clock")).child(rolloutRows(t, model.rollouts)))
    .when(model.conditions.length > 0, (el) => el.child(section(t, "Conditions", "list")).child(conditionRows(t, "wl-cond", model.conditions)));
}

function listSections(t, lists) {
  return lists.flatMap(([title, items], index) => [section(t, title, "list"), textList(t, `list-${index}`, items)]);
}

export function genericOverview(t, model, ui) {
  return v_flex().pb(14)
    .child(hero(t, model.headline, null))
    .child(section(t, "Overview", "gauge"))
    .child(factGrid(t, "gen-facts", model.facts))
    .when(Boolean(model.usage), (el) => el.child(section(t, "Usage", "cpu", ui.metricsNote ? pill(t, ui.metricsNote, "subtle", "circle-alert") : null))
      .child(v_flex().mx(14).px(12).py(10).gap(12).rounded(10).bg(t.surface).border_1().border_color(t.border)
        .child(usageBar(t, "node-cpu", { ...model.usage?.cpu, label: "CPU", icon: "cpu", format: formatCpu, width: ui.barWidth, revealed: ui.revealed, missing: ui.metricsNote }))
        .child(usageBar(t, "node-mem", { ...model.usage?.memory, label: "Memory", icon: "memory-stick", format: formatMemory, width: ui.barWidth, revealed: ui.revealed, missing: ui.metricsNote }))))
    .when((model.conditions ?? []).length > 0, (el) => el.child(section(t, "Conditions", "list")).child(conditionRows(t, "gen-cond", model.conditions ?? [])))
    .children(listSections(t, model.lists ?? []));
}

function eventRow(t, one, index) {
  const color = toneColor(t, one.tone);
  return h_flex().id(`ev-${index}`).mx(14).px(10).py(8).gap(10).items_start().rounded(8)
    .bg(one.tone === "warning" ? tint(t.ansi3, "12") : t.surface).border_1().border_color(one.tone === "warning" ? tint(t.ansi3, "44") : t.border)
    .child(icon(one.tone === "warning" ? "triangle-alert" : "circle-check", 14, color))
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(h_flex().gap(6).items_center()
        .child(div().flex_none().text_size(12).font_bold().text_color(color).child(one.reason))
        .when(one.count > 1, (el) => el.child(pill(t, `${one.count}\u{00d7}`, one.tone)))
        .child(div().flex_1())
        .child(div().flex_none().text_size(10.5).text_color(t.dim).child(`${age(one.at)} ago`)))
      .child(div().text_size(11.5).text_color(t.muted).whitespace_normal().child(one.message))
      .when(Boolean(one.source), (el) => el.child(div().text_size(10.5).text_color(t.dim).child(one.source))));
}

export function eventsView(t, events, error) {
  if (error) return emptyNote(t, "circle-alert", "Events unavailable", error);
  if (events.length === 0) return emptyNote(t, "bell", "No recent events", "Kubernetes keeps events for about an hour.");
  const warnings = events.filter((one) => one.tone === "warning").length;
  return v_flex().pb(14).gap(6)
    .child(section(t, `Events \u{00b7} ${events.length}`, "bell", warnings > 0 ? pill(t, `${warnings} warning${warnings === 1 ? "" : "s"}`, "warning", "triangle-alert") : null))
    .children(events.map((one, index) => eventRow(t, one, index)));
}
