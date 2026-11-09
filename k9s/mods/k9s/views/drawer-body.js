import { div } from "gpui-kit";
import { v_flex, Editor } from "gpui-base";
import { errorRow, note } from "./widgets.js";
import { skeleton, emptyNote } from "./parts.js";
import { podOverview } from "./overview-pod.js";
import { workloadOverview, genericOverview, eventsView } from "./overview-other.js";
import { dangerZone } from "./write-panel.js";
import { podModel } from "../model-pod.js";
import { workloadModel, serviceModel, ingressModel, nodeModel, eventRows } from "../model-other.js";
import { canWrite } from "../write-guard.js";

const FADE = { duration: 170, easing: "ease-out" };

function metricsNote(data, resource) {
  if (resource !== "pods" && resource !== "nodes") return "";
  if (!data.metrics) return "";
  if (data.metrics.ok) return "";
  return data.metrics.missing ? "no metrics-server" : "no metrics yet";
}

function metricsValue(data) {
  return data.metrics?.ok ? data.metrics.value : null;
}

function overviewFor(t, app, data, ui) {
  const resource = app.state.scope.resource;
  if (resource === "pods") return podOverview(t, app, podModel(data.object, metricsValue(data), data.owners), data, ui);
  if (resource === "deployments") return workloadOverview(t, workloadModel(data.object, data.replicaSets), ui);
  if (resource === "services") return genericOverview(t, serviceModel(data.object), ui);
  if (resource === "ingresses") return genericOverview(t, ingressModel(data.object), ui);
  return genericOverview(t, nodeModel(data.object, metricsValue(data)), ui);
}

function waiting(t, app) {
  const { overview } = app.state;
  if (overview.error) return errorRow(t, "overview-error", overview.error, (_e, cx) => app.refreshDrawer(cx));
  return skeleton(t, "overview-skeleton", 7);
}

function overviewBody(t, app, ui) {
  const data = app.state.overview.data;
  if (!data || app.state.overview.key !== ui.key) return waiting(t, app);
  const note = metricsNote(data, app.state.scope.resource);
  const inner = { ...ui, metricsNote: note };
  return v_flex()
    .child(overviewFor(t, app, data, inner))
    .when(canWrite(app.state.scope.context), (el) => el.child(dangerZone(t, app) ?? div()));
}

function eventsBody(t, app, ui) {
  const data = app.state.overview.data;
  if (!data || app.state.overview.key !== ui.key) return waiting(t, app);
  const events = data.events?.ok ? eventRows(data.events.value) : [];
  return eventsView(t, events, data.events?.ok ? "" : data.events?.error ?? "");
}

function textBody(t, app) {
  const detail = app.state.detail;
  if (!detail || detail.loading) return skeleton(t, "text-skeleton", 9);
  if (!app.code) return errorRow(t, "detail-error", detail.text, (_e, cx) => app.refreshDrawer(cx));
  return v_flex().flex_1().min_h(0)
    .when(detail.hidden > 0, (el) => el.child(note(t, `Showing the first part only: ${detail.hidden} more characters not loaded.`, "warning")))
    .child(div().id("detail-text").flex_1().min_h(0).flex().flex_col().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(Editor.new(app.code).flex_1().min_h(0)));
}

export function drawerBody(t, app, ui) {
  const tab = ui.tab;
  const isText = tab === "yaml" || tab === "logs" || tab === "describe";
  const content = isText ? textBody(t, app) : tab === "events" ? eventsBody(t, app, ui) : overviewBody(t, app, ui);
  const shell = v_flex().id(`drawer-body-${ui.token}`).flex_1().min_h(0).opacity(ui.revealed ? 1 : 0).transition("opacity", FADE);
  if (isText) return shell.child(content);
  return shell.child(v_flex().id(`drawer-scroll-${ui.token}`).flex_1().min_h(0).overflow_y_scroll().child(content));
}

export function emptyDrawer(t) {
  return emptyNote(t, "box", "Nothing selected", "Pick a row on the left.");
}
