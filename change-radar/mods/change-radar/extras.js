import { props, exec, openOverlay, notify } from "herdr";
import { Walkthrough } from "./walk.js";
import { walkView } from "./walk-view.js";
import { sessionSources, radarSource } from "./walk-input.js";
import { sessionLabel } from "./session-data.js";
import { ShipTracker } from "./ship-poll.js";
import { ShipPanel } from "./ship-panel.js";
import { isShown, placeShown } from "./visibility.js";
import { MOD } from "./shell.js";

const SHIP_TICK_MS = 5000;
const TAB_KEYS = { 1: "radar", 2: "graph", 3: "session" };
const GIT_WINDOW = { mod: MOD, kind: "window", key: "change-radar-panel", width: 0.6, height: 0.85 };

export function initExtras(app, cx) {
  app.walk = new Walkthrough(app);
  app.ship = new ShipTracker(app);
  app.shipPanel = new ShipPanel(app);
  if (props()?.tab === "ship") { app.tab = "session"; app.sessionTab.ensure(cx, typeof props().sessionId === "string" ? props().sessionId : null); }
  cx.timer.every(SHIP_TICK_MS, (cx) => app.ship.tick(cx, isShown(MOD) && app.tab === "session"));
  cx.timer.after(1500, (cx) => app.ship.tick(cx, false));
}

export function walkSession(app, cx) {
  const tab = app.sessionTab;
  if (!tab.session || !tab.loaded().length) return;
  app.walk.start({ tab: "session", label: `session ${sessionLabel(tab.session)}` }, async () => sessionSources(tab), cx);
}

export function walkRepo(app, path, data, cx) {
  if (!data) return;
  app.walk.start({ tab: "radar", label: app.radar.name(path), on: app.radar.on }, async () => radarSource(app, path, data), cx);
}

const walkShown = (app) => app.walk.active && app.walk.scope?.tab === app.tab;

export function extraBody(app, t) {
  if (walkShown(app)) return walkView(app.walk, t);
  return null;
}

export function extraKey(app, key, cx) {
  if (app.typing) return false;
  if (TAB_KEYS[key] && !(app.tab === "graph" && app.graphTab.picking)) {
    app.setTab(TAB_KEYS[key], cx);
    return true;
  }
  if (walkShown(app)) return app.walk.key(key, cx);
  if (app.tab === "session" && key === "w") { walkSession(app, cx); return true; }
  return false;
}

async function windowOpen() {
  const status = await exec("herdr-app", ["status"]);
  if (status.code !== 0) throw new Error((status.stderr || status.stdout).trim() || `herdr-app status exited ${status.code}`);
  return (JSON.parse(status.stdout).overlays ?? []).includes(MOD);
}

function openIfHidden(app, sessionId, cx) {
  if (props()?.overlay || placeShown(MOD) || !app.ship.leader) return;
  cx.spawn(async () => {
    const open = await windowOpen().catch((e) => { notify({ title: "Git", body: `Could not read herdr-app status: ${e.message ?? e}`, level: "warning" }); return true; });
    if (!open) openOverlay({ ...GIT_WINDOW, props: { tab: "session", ...(sessionId ? { sessionId } : {}) } });
  });
}

export function extraCommand(app, name, cx) {
  if (name === "ship" || name.startsWith("ship-open-")) {
    if (props()?.overlay || placeShown(MOD)) app.setTab("session", cx); else app.tab = "session";
    app.sessionTab.show(name.startsWith("ship-open-") ? name.slice(10) : null, cx);
    openIfHidden(app, name.startsWith("ship-open-") ? name.slice(10) : null, cx);
  } else if (name === "ship-refresh") app.ship.refresh(cx);
  else if (name === "walkthrough" && app.tab === "session") walkSession(app, cx);
  else if (name === "walkthrough" && app.view.name === "detail") walkRepo(app, app.view.path, app.detail.data, cx);
  else return false;
  return true;
}
