import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { selectedResource, isLive } from "../actions.js";
import { stateTone } from "../model.js";
import { button, note, icon, iconButton, stateDot, shade, ICONS } from "./widgets.js";
import { drawerArea, coveredWidth } from "./drawer.js";
import { section, factGrid, pill, cell, columnHeader, tableRow, emptyNote } from "./parts.js";
import { withHover, factLine, meterLine } from "./row-hover.js";
import { meter } from "./meter.js";

const RESOURCE_ACTIONS = new Set(["restart", "stop"]);
const COLUMNS = [["name", 160], ["kind", 78], ["state", 120], ["probe", 84], ["ports", 170], ["uptime", 70], ["restarts", 66]];

export function toneOf(t, state) {
  const tone = stateTone(state);
  if (tone === "healthy") return t.ansi2;
  if (tone === "starting") return t.ansi3;
  if (tone === "unhealthy") return t.ansi1;
  return t.dim;
}

export function probeOf(row) {
  const [attempts, max] = String(row.health || "").split("/").map(Number);
  if (!max) return null;
  return { text: `${attempts}/${max}`, ratio: attempts / max };
}

function stateText(row) {
  return row.phase && row.phase !== row.state ? `${row.state} \u{b7} ${row.phase}` : row.state;
}

function probeCell(t, row) {
  const probe = probeOf(row);
  if (!probe) return cell(84, div().text_color(t.dim).child("-"));
  return h_flex().w(84).flex_none().gap(5).items_center()
    .child(meter(t, `probe-${row.name}`, { ratio: probe.ratio, width: 40, height: 4 }))
    .child(div().text_size(10.5).text_color(t.muted).child(probe.text));
}

function hoverLines(t, row) {
  const probe = probeOf(row);
  return {
    title: row.name,
    lines: [
      factLine(t, "state", stateText(row), toneOf(t, row.state)), factLine(t, "kind", [row.kind, row.role].filter(Boolean).join(" / ") || "-"),
      ...(row.image ? [factLine(t, "image", row.image)] : []), factLine(t, "ports", row.ports.join("  ") || "-"),
      factLine(t, "uptime", row.uptime || "-"), factLine(t, "restarts", String(row.restarts), row.restarts > 0 ? t.ansi3 : t.dim),
      ...(probe ? [meterLine(t, `hover-probe-${row.name}`, "probe", probe)] : []),
      ...(row.url ? [factLine(t, "url", row.url, t.accent)] : []),
    ],
  };
}

function resourceRow(app, t, row, index) {
  const isSelected = row.name === app.state.selected;
  const color = toneOf(t, row.state);
  const element = tableRow(t, `res-${row.name}`, { isSelected, isOpen: isSelected && app.state.drawerOpen, onClick: (_e, cx) => app.clickRow(row.name, cx) })
    .child(div().w(12).flex_none().child(stateDot(color, stateTone(row.state) === "starting")))
    .child(cell(160, div().font_semibold().child(row.name)))
    .child(cell(78, div().text_color(t.muted).child(row.kind || "-")))
    .child(cell(120, div().text_color(color).child(stateText(row))))
    .child(probeCell(t, row))
    .child(cell(170, div().text_color(t.muted).child(row.ports.join("  ") || "-")))
    .child(cell(70, div().text_color(t.muted).child(row.uptime || "-")))
    .child(cell(66, div().text_color(row.restarts > 0 ? t.ansi3 : t.dim).child(String(row.restarts))))
    .child(div().flex_1().min_w(0).truncate().text_color(t.accent).child(row.url || ""));
  return withHover(app, t, element, { key: `res-hover-${index}`, id: `res:${row.name}`, build: () => hoverLines(t, row) });
}

function table(app, t) {
  const { resources, source } = app.state.status;
  return v_flex().flex_1().min_h(0).min_w(0).pr(app.state.drawerOpen ? coveredWidth(app) : 0)
    .child(columnHeader(t, COLUMNS, "URL"))
    .child(v_flex().id("resource-rows").flex_1().min_h(0).overflow_y_scrollbar()
      .children(resources.map((row, index) => resourceRow(app, t, row, index)))
      .when(resources.length === 0, (el) => el.child(note(t, source === "loading" ? "Reading Orbit status..." : "No resources reported."))));
}

function confirmStrip(app, t) {
  const { confirm } = app.state;
  if (!confirm || !RESOURCE_ACTIONS.has(confirm.action)) return null;
  const verb = confirm.action === "restart" ? "Restart" : "Stop";
  return h_flex().flex_none().mx(10).mb(6).px(10).py(6).gap(8).items_center().rounded(8).border_1().border_color(shade(t.ansi1, "border")).bg(shade(t.ansi1, "subtle"))
    .child(icon(ICONS.warning, 14, t.ansi1))
    .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.foreground).child(`${verb} ${confirm.name}? Press ${confirm.action === "restart" ? "R" : "S"} again or confirm.`))
    .child(button(t, "confirm-yes", `Confirm ${verb.toLowerCase()}`, (_e, cx) => app.confirmAction(cx), { danger: true }))
    .child(button(t, "confirm-no", "Cancel", (_e, cx) => app.cancelConfirm(cx), { hotkey: "esc" }));
}

function linkRow(t, id, label, url, app) {
  return h_flex().id(id).mx(14).py(3).gap(6).items_center().text_size(11.5).cursor_pointer().hover((s) => s.underline())
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => app.openUrl(url, cx))
    .child(icon(ICONS.link, 13, t.accent))
    .child(div().w(90).flex_none().truncate().text_color(t.muted).child(label))
    .child(div().flex_1().min_w(0).truncate().text_color(t.accent).child(url));
}

function drawerActions(app, t, row) {
  const live = isLive(app);
  const busy = app.state.acting === row.name;
  const { confirm } = app.state;
  const pending = confirm?.name === row.name && RESOURCE_ACTIONS.has(confirm.action) ? confirm.action : "";
  const needs = live ? "" : " (needs the Orbit daemon)";
  return [
    iconButton(t, "act-open", ICONS.link, (_e, cx) => app.openUrl(row.url, cx), { hotkey: "o", disabled: !row.url, tooltip: row.url || "No URL" }),
    iconButton(t, "act-logs", ICONS.logs, (_e, cx) => app.logsOf(row.name, cx), { hotkey: "l", tooltip: "Show logs" }),
    iconButton(t, "act-restart", "rotate-cw", (_e, cx) => app.requestAction("restart", cx),
      { tone: "danger", active: pending === "restart", hotkey: "\u{21e7}R", disabled: !live || busy, tooltip: `Restart, asks to confirm${needs}`, label: pending === "restart" ? "Confirm?" : "" }),
    iconButton(t, "act-stop", "circle-stop", (_e, cx) => app.requestAction("stop", cx),
      { tone: "danger", active: pending === "stop", hotkey: "\u{21e7}S", disabled: !live || busy, tooltip: `Stop, asks to confirm${needs}`, label: pending === "stop" ? "Confirm?" : "" }),
  ];
}

function drawerBody(app, t, row) {
  const probe = probeOf(row);
  const facts = [["state", stateText(row), toneOf(t, row.state)], ["uptime", row.uptime || "-"], ["startup", row.startup || "-"],
    ["restarts", String(row.restarts), row.restarts > 0 ? t.ansi3 : undefined], ["role", row.role || "-"], ["kind", row.kind || "-"]];
  return v_flex()
    .child(section(t, "Overview", "gauge")).child(factGrid(t, "res-facts", facts))
    .when(Boolean(probe), (el) => el.child(section(t, "Health probe", "circle-dashed"))
      .child(h_flex().mx(14).gap(8).items_center().child(meter(t, "dr-probe", { ratio: probe?.ratio ?? 0, width: 180, height: 6 }))
        .child(div().text_size(11.5).text_color(t.muted).child(`attempt ${probe?.text ?? ""}`))))
    .when(Boolean(row.image), (el) => el.child(section(t, "Image", "container")).child(div().mx(14).text_size(11.5).text_color(t.muted).child(row.image)))
    .child(section(t, "Ports", "plug"))
    .child(v_flex().mx(14).gap(2).children(row.ports.length ? row.ports.map((one) => div().text_size(11.5).text_color(t.foreground).child(one)) : [div().text_size(11.5).text_color(t.dim).child("none")]))
    .when(Boolean(row.url) || row.sidecars.length > 0, (el) => el.child(section(t, "Links", "globe")))
    .when(Boolean(row.url), (el) => el.child(linkRow(t, "link-main", "url", row.url, app)))
    .children(row.sidecars.map((one, index) => linkRow(t, `link-side-${index}`, one.name, one.url, app)));
}

function drawerSpec(app, t) {
  const row = selectedResource(app);
  const isOpen = Boolean(app.state.drawerOpen && row);
  if (!row) return { id: "resources", open: false };
  const color = toneOf(t, row.state);
  return {
    id: "resources", open: isOpen, icon: ICONS.resources, tone: color, alert: stateTone(row.state) === "unhealthy",
    title: row.name, subtitle: [row.kind, row.role].filter(Boolean).join(" \u{b7} ") || "resource",
    chips: [pill(t, row.state, color), ...(row.restarts > 0 ? [pill(t, `${row.restarts} restarts`, t.ansi3, "rotate-cw")] : [])],
    actions: drawerActions(app, t, row), body: drawerBody(app, t, row),
  };
}

export function resourcesView(app, t) {
  const strip = confirmStrip(app, t);
  const { resources, source } = app.state.status;
  const empty = resources.length === 0 && source !== "loading";
  return v_flex().flex_1().min_h(0)
    .when(Boolean(strip), (el) => el.child(strip))
    .child(drawerArea(app, t, { ...drawerSpec(app, t), table: empty ? emptyNote(t, ICONS.resources, "No resources", "This environment reports nothing yet.") : table(app, t) }));
}
