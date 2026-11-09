import { drawerWidth, isResizable } from "./views/drawer.js";

export function beginResize(panel, event, cx) {
  const area = panel.drawerArea;
  if (!area || !isResizable(area)) return;
  if (event.click_count >= 2) {
    panel.resize = null;
    panel.set({ drawerWidth: null });
    panel.persist();
    cx.notify();
    return;
  }
  panel.resize = { startX: event.position.x, startWidth: drawerWidth(area, panel.state.drawerWidth) };
  cx.notify();
}

export function moveResize(panel, event, cx) {
  const drag = panel.resize;
  if (!drag || !panel.drawerArea) return;
  const width = drawerWidth(panel.drawerArea, drag.startWidth + (drag.startX - event.position.x));
  if (width === panel.state.drawerWidth) return;
  panel.set({ drawerWidth: width });
  cx.notify();
}

export function endResize(panel, cx) {
  if (!panel.resize) return;
  panel.resize = null;
  panel.persist();
  cx.notify();
}
