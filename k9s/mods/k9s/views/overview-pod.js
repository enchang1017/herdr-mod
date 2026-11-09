import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { toneColor, tint, mono } from "./widgets.js";
import { icon, stateIcon, stateDot, iconButton } from "./icons.js";
import { section, factGrid, usageBar, conditionRows, pill } from "./parts.js";
import { formatCpu, formatMemory, age } from "../quantity.js";
import { isTransitional } from "../model-pod.js";

const PULSE = { from: 0.45, to: 1, period: 1000 };

export function hero(t, head, side) {
  const color = toneColor(t, head.tone);
  return h_flex().mx(14).mt(14).px(14).py(12).gap(12).items_center().rounded(12).bg(tint(color, "14")).border_1().border_color(tint(color, "44"))
    .child(div().flex_none().w(36).h(36).rounded(10).flex().items_center().justify_center().bg(tint(color, "22"))
      .child(icon(stateIcon(head.tone, head.word), 20, color).when(head.pulse, (el) => el.loop("opacity", PULSE))))
    .child(v_flex().flex_1().min_w(0).gap(3)
      .child(div().text_size(17).font_bold().text_color(color).truncate().child(head.word))
      .when(Boolean(head.why), (el) => el.child(div().text_size(11.5).text_color(t.muted).whitespace_normal().child(head.why))))
    .when(Boolean(side), (el) => el.child(side));
}

function restartsBadge(t, restarts) {
  const tone = restarts >= 10 ? "error" : restarts > 0 ? "warning" : "subtle";
  return v_flex().flex_none().items_center()
    .child(div().text_size(20).font_bold().text_color(toneColor(t, tone)).child(String(restarts)))
    .child(div().text_size(10).text_color(t.dim).child(restarts === 1 ? "restart" : "restarts"));
}

function usageBlock(t, id, usage, ui) {
  const missing = ui.metricsNote;
  return v_flex().mx(14).px(12).py(10).gap(12).rounded(10).bg(t.surface).border_1().border_color(t.border)
    .child(usageBar(t, `${id}-cpu`, { ...usage.cpu, label: "CPU", icon: "cpu", format: formatCpu, width: ui.barWidth, revealed: ui.revealed, missing }))
    .child(usageBar(t, `${id}-mem`, { ...usage.memory, label: "Memory", icon: "memory-stick", format: formatMemory, width: ui.barWidth, revealed: ui.revealed, missing }));
}

function containerHeader(t, app, one, ui, index) {
  const tone = one.state.tone;
  return h_flex().gap(8).items_center()
    .child(stateDot(t, tone, isTransitional(one.state.word)))
    .child(icon("container", 14, t.muted))
    .child(div().flex_1().min_w(0).truncate().text_size(12.5).font_bold().text_color(t.foreground).child(one.name))
    .when(one.isInit, (el) => el.child(pill(t, "init", "subtle")))
    .child(pill(t, one.state.word, tone, stateIcon(tone, one.state.word)))
    .when(one.restarts > 0, (el) => el.child(pill(t, `${one.restarts}\u{00d7}`, one.restarts >= 10 ? "error" : "warning", "rotate-cw")))
    .when(ui.canShell, (el) => el.child(iconButton(t, `shell-${index}`, "square-terminal", (_e, cx) => app.startShell(one.name, cx), { tone: "caution", tooltip: `Shell into ${one.name} (/bin/sh, new tab)` })));
}

function containerCard(t, app, one, ui, index) {
  const width = ui.barWidth;
  return v_flex().id(`container-${index}`).mx(14).px(12).py(10).gap(7).rounded(10).bg(t.surface).border_1()
    .border_color(one.state.tone === "error" ? tint(t.ansi1, "66") : t.border)
    .child(containerHeader(t, app, one, ui, index))
    .child(div().id(`image-${index}`).truncate().font_family(mono()).text_size(11).text_color(t.dim).tooltip(one.image).child(one.image))
    .when(Boolean(one.last), (el) => el.child(h_flex().gap(6).items_center()
      .child(icon("triangle-alert", 12, t.ansi3))
      .child(div().text_size(11).text_color(t.ansi3).child(`last: ${one.last?.reason} (exit ${one.last?.exitCode}) ${age(one.last?.at)} ago`))))
    .when(one.ports.length > 0, (el) => el.child(h_flex().gap(4).flex_wrap().child(icon("plug", 12, t.dim)).children(one.ports.map((port) => pill(t, port, "subtle")))))
    .when(!one.isInit, (el) => el.child(v_flex().gap(10).pt(2)
      .child(usageBar(t, `c${index}-cpu`, { ...one.cpu, label: "CPU", icon: "cpu", format: formatCpu, width, revealed: ui.revealed, missing: ui.metricsNote }))
      .child(usageBar(t, `c${index}-mem`, { ...one.memory, label: "Memory", icon: "memory-stick", format: formatMemory, width, revealed: ui.revealed, missing: ui.metricsNote }))));
}

function ownerChain(t, app, owners) {
  return h_flex().mx(14).gap(6).items_center().flex_wrap()
    .children(owners.flatMap((one, index) => [
      ...(index > 0 ? [icon("chevron-right", 12, t.dim)] : []),
      h_flex().id(`owner-${index}`).h(22).px(8).gap(5).items_center().rounded(6).bg(t.raised).border_1().border_color(t.border)
        .when(one.kind === "Deployment", (el) => el.cursor_pointer().hover((s) => s.border_color(t.accent)).on_click((_e, cx) => app.jumpToWorkload(one, cx)))
        .child(icon(one.kind === "Deployment" ? "layers" : one.kind === "StatefulSet" ? "database" : "link", 12, one.kind === "Deployment" ? t.accent : t.muted))
        .child(div().text_size(11.5).text_color(one.kind === "Deployment" ? t.accent : t.foreground).child(`${one.kind}/${one.name}`)),
    ]));
}

export function podOverview(t, app, model, data, ui) {
  return v_flex().pb(14)
    .child(hero(t, model.headline, restartsBadge(t, model.headline.restarts)))
    .child(section(t, "Overview", "gauge"))
    .child(factGrid(t, "pod-facts", model.facts))
    .when(data.owners.length > 0, (el) => el.child(section(t, "Owner chain", "link")).child(ownerChain(t, app, data.owners)))
    .child(section(t, "Usage", "cpu", ui.metricsNote ? pill(t, ui.metricsNote, "subtle", "circle-alert") : null))
    .child(usageBlock(t, "pod-usage", model.usage, ui))
    .child(section(t, `Containers \u{00b7} ${model.containers.length}`, "container"))
    .child(v_flex().gap(8).children(model.containers.map((one, index) => containerCard(t, app, one, ui, index))))
    .when(model.conditions.length > 0, (el) => el.child(section(t, "Conditions", "list")).child(conditionRows(t, "pod-cond", model.conditions)));
}
