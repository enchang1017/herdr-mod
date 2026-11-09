import { drawerWidth, isResizable } from "./views/drawer.js";

export function beginResize(app, event, cx) {
  const area = app.drawerArea;
  if (!area || !isResizable(area)) return;
  if (event.click_count >= 2) {
    app.resize = null;
    app.set({ drawerWidth: null });
    app.persist();
    cx.notify();
    return;
  }
  app.resize = { startX: event.position.x, startWidth: drawerWidth(area, app.state.drawerWidth) };
  cx.notify();
}

export function moveResize(app, event, cx) {
  const drag = app.resize;
  if (!drag || !app.drawerArea) return;
  const width = drawerWidth(app.drawerArea, drag.startWidth + (drag.startX - event.position.x));
  if (width === app.state.drawerWidth) return;
  app.set({ drawerWidth: width });
  cx.notify();
}

export function endResize(app, cx) {
  if (!app.resize) return;
  app.resize = null;
  app.persist();
  cx.notify();
}
