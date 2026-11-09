import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { baseOf } from "../actions.js";
import { DAEMON_ACTION } from "../daemon.js";
import { targetHint } from "../target.js";
import { countTones, clock } from "../model.js";
import { button, placeButton, icon, iconButton, stateDot, targetField, shade, ICONS } from "./widgets.js";
import { meter, healthTone } from "./meter.js";
import { instanceStrip } from "./instance-pills.js";

function daemonBadge(app, t) {
  const { source } = app.state.status;
  const look = source === "daemon" ? [t.ansi2, "daemon running"] : source === "loading" ? [t.dim, "checking"] : [t.ansi1, "daemon not running"];
  return h_flex().flex_none().h(20).px(7).gap(5).items_center().rounded(10).bg(shade(look[0], "subtle")).border_1().border_color(shade(look[0], "border"))
    .child(stateDot(look[0], source === "loading"))
    .child(div().text_size(10.5).font_semibold().text_color(look[0]).child(look[1]));
}

function healthMeter(app, t) {
  const { resources } = app.state.status;
  if (resources.length === 0) return null;
  const counts = countTones(resources);
  const healthy = counts.healthy ?? 0;
  const color = healthTone(t, healthy, resources.length);
  const extra = [counts.starting && `${counts.starting} starting`, counts.unhealthy && `${counts.unhealthy} unhealthy`].filter(Boolean).join(", ");
  return h_flex().id("health-meter").flex_none().gap(6).items_center().tooltip(extra || "all resources healthy")
    .child(meter(t, "health-bar", { ratio: healthy / resources.length, width: 64, height: 5, color }))
    .child(div().text_size(11).font_semibold().text_color(color).child(`${healthy}/${resources.length}`))
    .child(div().text_size(10.5).text_color(t.dim).child("healthy"));
}

function stopDaemonButton(app, t) {
  const { confirm, stoppingDaemon, status } = app.state;
  const isArmed = confirm?.action === DAEMON_ACTION;
  const isLive = status.source === "daemon";
  const tooltip = isLive ? `Stop the Orbit daemon (${app.state.instance || "default"}). Asks to confirm first; containers keep running.` : "The Orbit daemon is not running";
  return iconButton(t, "daemon-stop", "power", (_e, cx) => app.requestDaemonStop(cx), {
    tone: "danger", active: isArmed, disabled: !isLive || stoppingDaemon, tooltip,
    label: stoppingDaemon ? "Stopping" : isArmed ? "Confirm?" : "Stop daemon",
  });
}

function titleRow(app, t) {
  const { status, loadingStatus } = app.state;
  const base = baseOf(app);
  const health = healthMeter(app, t);
  return h_flex().flex_none().px(12).h(42).gap(10).items_center().bg(t.surface).border_b(1).border_color(t.border)
    .child(icon(ICONS.orbit, 15, t.accent))
    .child(div().flex_none().font_bold().text_size(13).child("Orbit"))
    .child(div().id("env-name").flex_none().max_w(260).truncate().text_size(12.5).font_semibold().text_color(t.ansi4)
      .tooltip(status.configPath || "environment").child(status.env || "..."))
    .child(daemonBadge(app, t))
    .when(Boolean(health), (el) => el.child(health))
    .when(Boolean(status.selected), (el) => el.child(div().flex_none().text_size(10.5).text_color(t.ansi3).child(`selected env ${status.selected} not running`)))
    .child(div().flex_1())
    .child(div().flex_none().text_size(10.5).text_color(t.dim).child(loadingStatus ? "refreshing" : `updated ${clock(status.at)}`))
    .when(status.source === "daemon" && Boolean(base), (el) => el.child(iconButton(t, "open-dashboard", "external-link", (_e, cx) => app.openUrl(base, cx), { tooltip: `Open ${base}` })))
    .child(iconButton(t, "refresh", "rotate-cw", (_e, cx) => app.refresh(cx), { hotkey: "r", tooltip: "Refresh" }))
    .child(placeButton(t, app))
    .child(stopDaemonButton(app, t));
}

function instanceRow(app, t) {
  return h_flex().flex_none().px(12).py(6).gap(10).items_center().border_b(1).border_color(t.border)
    .child(instanceStrip(app, t))
    .child(div().w(240).flex_none().child(targetField(t, "agent-target", app.targetInput, targetHint(app.targetInput.value()))));
}

export function headerBar(app, t) {
  return div().flex_none().flex().flex_col().child(titleRow(app, t)).child(instanceRow(app, t));
}

export function daemonConfirmStrip(app, t) {
  const { confirm } = app.state;
  if (confirm?.action !== DAEMON_ACTION) return null;
  return h_flex().flex_none().mx(10).mt(8).px(10).py(6).gap(8).items_center().rounded(8).border_1().border_color(shade(t.ansi1, "border")).bg(shade(t.ansi1, "subtle"))
    .child(icon(ICONS.warning, 14, t.ansi1))
    .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.foreground)
      .child(`Stop the Orbit daemon (${confirm.name})? Dev services stop, containers keep running.`))
    .child(button(t, "daemon-confirm-yes", "Stop daemon", (_e, cx) => app.confirmAction(cx), { danger: true }))
    .child(button(t, "daemon-confirm-no", "Cancel", (_e, cx) => app.cancelConfirm(cx), { hotkey: "esc" }));
}
