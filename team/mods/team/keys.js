import { props, closeOverlay } from "herdr";
import { TABS } from "./tabs.js";

function placeKind(e) {
  const { platform, shift, control, alt } = e.modifiers ?? {};
  if (!platform || control || alt) return null;
  if (e.key === "enter" && !shift) return "toggle";
  if ((e.key === "t" || e.key === "T") && shift) return "tab";
  return null;
}

function dismissConfirm(app) {
  if (app.tab === "agents" && app.confirming) { app.confirming = false; return true; }
  if (app.tab === "mr" && app.mr.confirming) { app.mr.confirming = false; return true; }
  if (app.tab === "running" && app.running.confirmKill) { app.running.confirmKill = null; return true; }
  return false;
}

export function escape(app, cx) {
  if (dismissConfirm(app)) return cx.notify();
  if (app.tab === "running" && app.running.reading) return app.running.closeRead(cx);
  if (app.tab === "agents" && app.agentsStage === "form") return app.closeTemplate(cx);
  if (app.typing.size) return app.blur(cx);
  if (props()?.overlay) closeOverlay(props().overlay);
}

function tabKey(app, e) {
  if (app.typing.size || e.modifiers?.shift || !/^[1-4]$/.test(e.key)) return null;
  return TABS[Number(e.key) - 1];
}

export function onKey(app, e, cx) {
  const place = placeKind(e);
  if (place === "toggle") { app.togglePlace(cx); return true; }
  if (place === "tab") { app.openTab(cx); return true; }
  const { platform, control, alt } = e.modifiers ?? {};
  if (platform || control || alt) return false;
  if (e.key === "escape") { escape(app, cx); return true; }
  const tab = tabKey(app, e);
  if (!tab) return false;
  app.setTab(tab, cx);
  return true;
}
