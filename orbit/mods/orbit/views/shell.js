import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { TABS } from "../ui-state.js";
import { resourcesView } from "./resources.js";
import { logsView } from "./logs.js";
import { tracesView } from "./traces.js";
import { dbView } from "./db.js";
import { headerBar, daemonConfirmStrip } from "./header.js";
import { instanceSummary } from "./instance-pills.js";
import { icon, kbd, note, errorRow, shade, ICONS } from "./widgets.js";

const TAB_LABELS = { resources: "RESOURCES", logs: "LOGS", traces: "TRACES", db: "DB" };
const TAB_ICONS = { resources: ICONS.resources, logs: ICONS.logs, traces: ICONS.traces, db: ICONS.db };

function tabItem(app, t, key, index) {
  const isOn = app.state.tab === key;
  return h_flex().id(`tab-${key}`).flex_1().max_w(150).h(26).px(8).gap(6).items_center().justify_center().rounded(5).text_size(11).cursor_pointer()
    .when(isOn, (e) => e.bg(t.solid).font_semibold())
    .when(!isOn, (e) => e.hover((s) => s.bg(t.hover)))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => app.setTab(key, cx))
    .child(icon(TAB_ICONS[key], 13, isOn ? t.solid_foreground : t.dim))
    .child(div().text_color(isOn ? t.solid_foreground : t.muted).child(TAB_LABELS[key]))
    .child(kbd(t, String(index + 1), isOn));
}

function tabBar(app, t) {
  return h_flex().id("orbit-tabs").flex_none().mx(10).my(8).p(2).gap(2).rounded(7).bg(t.surface).border_1().border_color(t.border)
    .children(TABS.map((key, index) => tabItem(app, t, key, index)));
}

function currentInstance(app) {
  return app.state.instances.find((one) => one.name === app.state.instance) ?? null;
}

function stoppedBanner(app, t) {
  const { status, instance } = app.state;
  if (status.source === "daemon" || status.source === "loading") return null;
  const one = currentInstance(app);
  const isStale = Boolean(one?.stale);
  const title = isStale ? `Instance ${instance} is a stale leftover: its daemon is gone` : `Orbit daemon is not running${instance ? ` (instance ${instance})` : ""}, env ${status.env || "unknown"}`;
  const hint = isStale ? `${instanceSummary(one)}. Pick a live instance above, or remove it yourself with orbit instance clean ${instance}.`
    : "Start it with `orbit up` in a terminal. This panel picks it up within a few seconds.";
  return v_flex().flex_none().mx(10).mb(6).px(12).py(9).gap(4).rounded(8).border_1().border_color(shade(t.ansi1, "border")).bg(shade(t.ansi1, "subtle"))
    .child(h_flex().gap(8).items_center().child(icon(ICONS.warning, 14, t.ansi1)).child(div().font_bold().text_color(t.ansi1).child(title)))
    .child(div().text_size(11.5).text_color(t.muted).child(hint))
    .when(Boolean(status.error) && !isStale, (el) => el.child(div().text_size(11).text_color(t.dim).child(status.error)));
}

function body(app, t) {
  if (app.state.tab === "logs") return logsView(app, t);
  if (app.state.tab === "traces") return tracesView(app, t);
  if (app.state.tab === "db") return dbView(app, t);
  return resourcesView(app, t);
}

export function shellView(app, t) {
  const { status, message, instancesError } = app.state;
  const banner = stoppedBanner(app, t);
  const strip = daemonConfirmStrip(app, t);
  return v_flex().flex_1().min_h(0)
    .child(headerBar(app, t))
    .when(Boolean(strip), (el) => el.child(strip))
    .child(tabBar(app, t))
    .when(Boolean(banner), (el) => el.child(banner))
    .when(status.source === "daemon" && Boolean(status.error), (el) => el.child(errorRow(t, "status-error", status.error, (_e, cx) => app.refresh(cx))))
    .when(Boolean(instancesError), (el) => el.child(note(t, instancesError, "warning")))
    .when(Boolean(message), (el) => el.child(note(t, message, "warning")))
    .child(v_flex().flex_1().min_h(0).border_t(1).border_color(t.border).child(body(app, t)));
}
