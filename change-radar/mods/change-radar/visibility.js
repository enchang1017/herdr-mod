import { window as appWindow, props, panes, spaces } from "herdr";

function ownPanes(mod) {
  const id = props()?.pane;
  const all = panes();
  return id ? all.filter((one) => one.pane === id) : all.filter((one) => one.mod === mod);
}

function paneShown(pane) {
  const space = spaces().find((one) => one.tabs.some((tab) => tab.id === pane.tab));
  const tab = space?.tabs.find((one) => one.id === pane.tab);
  if (!space?.active || !tab?.active) return false;
  return !tab.zoomed || pane.zoomed;
}

export function placeShown(mod) {
  if (props()?.overlay) return true;
  const mine = ownPanes(mod);
  return mine.length === 0 || mine.some(paneShown);
}

export function isShown(mod) {
  return appWindow()?.active !== false && placeShown(mod);
}
