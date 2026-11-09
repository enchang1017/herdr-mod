import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { countTones } from "../model.js";
import { splitInstances } from "../instances.js";
import { icon, stateDot } from "./icons.js";
import { healthTone } from "./meter.js";
import { shade } from "./tokens.js";

const MID = " \u{b7} ";
const STALE_HELP = "Leftover instance folders under ~/.orbit/instances whose daemon is no longer running (pid gone, dashboard silent). "
  + "Listed for reference only; nothing is deleted. Remove one yourself with: orbit instance clean <name>";

function pad(number) {
  return String(number).padStart(2, "0");
}

function dayText(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function factsOf(app, one) {
  if (one.name !== app.state.instance || app.state.status.source === "loading") return one;
  const { status } = app.state;
  return { ...one, live: status.source === "daemon", healthy: countTones(status.resources).healthy ?? 0, total: status.resources.length };
}

function liveness(one) {
  if (one.live) return `daemon running${one.pid ? ` (pid ${one.pid})` : ""}, dashboard :${one.port}`;
  if (one.pidAlive) return `pid ${one.pid} alive but dashboard :${one.port} not answering`;
  return `${one.pid ? `daemon pid ${one.pid} not running` : "no daemon pid"}, dashboard ${one.port ? `:${one.port}` : "port"} not answering`;
}

function tooltipOf(one) {
  const head = one.stale ? `${one.label} (stale leftover)` : one.label;
  return [
    head, liveness(one), one.environment && `env ${one.environment}`, one.configPath && `config ${one.configPath}`,
    one.lastActive && `last active ${dayText(one.lastActive)}`,
  ].filter(Boolean).join("\n");
}

function instancePill(app, t, one) {
  const isOn = one.name === app.state.instance;
  const facts = factsOf(app, one);
  const tone = facts.live ? healthTone(t, facts.healthy, facts.total) : t.dim;
  return h_flex().id(`pill-${one.label}`).flex_none().h(24).px(9).gap(6).items_center().rounded(12).border_1().text_size(11.5).cursor_pointer()
    .border_color(isOn ? t.accent : t.border).bg(isOn ? shade(t.accent, "subtle") : t.raised).text_color(isOn ? t.foreground : t.muted)
    .when(one.stale, (el) => el.opacity(0.55))
    .when(!isOn, (el) => el.hover((s) => s.bg(t.hover)))
    .tooltip(tooltipOf(facts))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => app.pickInstance(one.name, cx))
    .child(stateDot(tone, false))
    .child(div().when(isOn, (el) => el.font_semibold()).child(one.label))
    .child(div().text_size(10.5).text_color(facts.live ? tone : t.dim).child(facts.live ? `${facts.healthy}/${facts.total}` : one.stale ? "stale" : "off"));
}

function staleToggle(app, t, count) {
  const isOpen = app.state.staleOpen;
  return h_flex().id("stale-toggle").flex_none().h(24).px(8).gap(5).items_center().rounded(12).border_1().border_dashed().border_color(t.border)
    .text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover))
    .tooltip(STALE_HELP)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => app.toggleStale(cx))
    .child(icon("history", 12, t.dim))
    .child(div().child(`${count} stale`))
    .child(icon(isOpen ? "chevron-down" : "chevron-right", 12, t.dim));
}

export function instanceStrip(app, t) {
  const { instances, instance, staleOpen } = app.state;
  const known = instances.some((one) => one.name === instance);
  const missing = { name: instance, label: instance, stale: true, live: false, pid: 0, port: 0, healthy: 0, total: 0 };
  const { shown, stale } = splitInstances(known ? instances : [...instances, missing], instance);
  return h_flex().id("orbit-instances").flex_1().min_w(0).gap(5).items_center().overflow_x_scroll()
    .child(div().flex_none().text_size(10).font_bold().text_color(t.dim).mr(2).child("INSTANCE"))
    .children(shown.map((one) => instancePill(app, t, one)))
    .when(stale.length > 0, (el) => el.child(staleToggle(app, t, stale.length)))
    .when(staleOpen, (el) => el.children(stale.map((one) => instancePill(app, t, one))));
}

export function instanceSummary(one) {
  return [one.environment && `env ${one.environment}`, one.configPath, one.lastActive && `last active ${dayText(one.lastActive)}`].filter(Boolean).join(MID);
}
