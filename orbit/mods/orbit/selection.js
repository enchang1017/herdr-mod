import * as act from "./actions.js";
import * as dbAct from "./db-actions.js";

export function clickRow(panel, name, cx) {
  const isSame = name === panel.state.selected;
  panel.set({ selected: name, drawerOpen: !(isSame && panel.state.drawerOpen), confirm: panel.state.confirm?.name === name ? panel.state.confirm : null, message: "" });
  panel.persist();
  panel.handle.focus();
  cx.notify();
}

export function clickDbRow(panel, name, cx) {
  const isSame = name === panel.state.dbSelected;
  panel.set({ dbSelected: name, drawerOpen: !(isSame && panel.state.drawerOpen), message: "" });
  panel.persist();
  panel.handle.focus();
  cx.notify();
}

export function clickTrace(panel, id, cx) {
  if (panel.state.trace?.id === id) closeDrawer(panel, cx);
  else act.openTrace(panel, id, cx);
  panel.handle.focus();
}

export function openDrawer(panel, cx) {
  const { tab } = panel.state;
  if (tab === "traces") act.openTrace(panel, panel.state.traceCursor ?? act.shownTraces(panel)[0]?.id, cx);
  else if (tab === "resources") {
    if (!act.selectedResource(panel)) act.moveSelection(panel, 0);
    panel.set({ drawerOpen: Boolean(act.selectedResource(panel)) });
  } else if (tab === "db") {
    if (!dbAct.selectedDb(panel)) dbAct.moveDbCursor(panel, 0);
    panel.set({ drawerOpen: Boolean(dbAct.selectedDb(panel)) });
  }
  panel.persist();
  cx.notify();
}

export function hasOpenDrawer(panel) {
  const { tab, trace, drawerOpen } = panel.state;
  if (tab === "traces") return Boolean(trace);
  return (tab === "resources" || tab === "db") && drawerOpen;
}

export function closeDrawer(panel, cx) {
  if (panel.state.tab === "traces" && panel.state.trace) {
    panel.set({ trace: null, lastTrace: panel.state.trace });
    act.reloadTraces(panel, cx);
  } else {
    panel.set({ drawerOpen: false, confirm: null });
  }
  panel.hoveredRow = null;
  panel.handle.focus();
  cx.notify();
}

export function moveCursor(panel, step, cx) {
  const { tab } = panel.state;
  if (tab === "resources") act.moveSelection(panel, step);
  else if (tab === "db") dbAct.moveDbCursor(panel, step);
  else if (tab === "traces") {
    act.moveTraceCursor(panel, step);
    if (panel.state.trace && panel.state.traceCursor !== panel.state.trace.id) act.openTrace(panel, panel.state.traceCursor, cx);
  }
  panel.persist();
}
