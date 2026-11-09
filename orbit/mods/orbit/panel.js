import { v_flex, InputState, VirtualListScrollHandle } from "gpui-base";
import { theme, nextCommand, props, closeOverlay } from "herdr";
import * as act from "./actions.js";
import { errorText } from "./api.js";
import { loadUiState, saveUiState, TABS } from "./ui-state.js";
import { loadTargetName, saveTargetName, refreshSessionNames } from "./target.js";
import { dockHere, openAsTab, floatAgain } from "./dock.js";
import { shellView } from "./views/shell.js";
import { mono } from "./views/widgets.js";
import { onKey } from "./keymap.js";
import { DEFAULT_INSTANCE } from "./instances.js";
import { isShown } from "./visibility.js";
import * as dbAct from "./db-actions.js";
import * as daemon from "./daemon.js";
import * as sel from "./selection.js";
import * as resizer from "./drawer-resize.js";

const MOD = "orbit";
const STATUS_MS = 3_000;
const TRACES_MS = 5_000;
const FILTER_DELAY_MS = 200;
const INSTANCES_MS = 10_000;
const DB_MS = 15_000;

function initialState(ui) {
  return {
    ...ui.value, filter: "", status: act.EMPTY_STATUS, loadingStatus: false, logs: act.EMPTY_LOGS, traces: act.EMPTY_TRACES,
    trace: null, lastTrace: null, traceCursor: null, confirm: null, acting: "", asking: false, message: ui.error,
    instances: [DEFAULT_INSTANCE], instancesError: "", loadingInstances: false, stoppingDaemon: false, staleOpen: false, drawerOpen: false,
    db: dbAct.EMPTY_DB, dbDiff: dbAct.EMPTY_DIFF,
  };
}

export class Panel {
  init(cx) {
    this.state = initialState(loadUiState());
    this.size = null;
    this.drawerArea = null;
    this.resize = null;
    this.hoveredRow = null;
    this.filterToken = 0;
    this.isHidden = !isShown(MOD);
    this.handle = cx.focus_handle();
    this.logScroll = VirtualListScrollHandle.new();
    this.traceScroll = VirtualListScrollHandle.new();
    this.makeInputs();
    this.refreshNames(cx);
    act.refreshStatus(this, cx, true);
    daemon.refreshInstances(this, cx);
    cx.timer.every(STATUS_MS, (cx) => this.tick(cx));
    cx.timer.every(TRACES_MS, (cx) => this.whenShown(() => this.traceTick(cx)));
    cx.timer.every(INSTANCES_MS, (cx) => this.whenShown(() => daemon.refreshInstances(this, cx)));
    cx.spawn((cx) => this.commandLoop(cx));
    if (props()?.overlay) cx.timer.after(300, () => this.handle.focus());
  }

  makeInputs() {
    this.filterInput = InputState.new({ placeholder: "filter lines  /" });
    this.filterInput.on("change", (_e, cx) => this.scheduleFilter(cx));
    this.filterInput.on("submit", (_e, cx) => { this.set({ filter: this.filterInput.value() }); this.handle.focus(); cx.notify(); });
    this.targetInput = InputState.new({ placeholder: "new session", value: loadTargetName() });
    this.targetInput.on("change", (_e, cx) => { this.set({ message: saveTargetName(this.targetInput.value()) }); this.refreshNames(cx); cx.notify(); });
    this.targetInput.on("submit", (_e, cx) => { this.handle.focus(); cx.notify(); });
    this.typing = new Set();
    [["filter", this.filterInput], ["target", this.targetInput]].forEach(([name, input]) => {
      input.on("focus", () => { this.typing = new Set([...this.typing, name]); });
      input.on("blur", () => { this.typing = new Set([...this.typing].filter((one) => one !== name)); });
    });
  }

  refreshNames(cx) {
    cx.spawn(async (cx) => {
      await refreshSessionNames().catch((error) => this.set({ message: `Could not read Claude sessions: ${errorText(error)}` }));
      cx.notify();
    });
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
  }

  persist() {
    const error = saveUiState(this.state);
    if (error) this.set({ message: error });
  }

  whenShown(action) {
    if (isShown(MOD)) action();
  }

  measureDrawer(size, cx) {
    const known = this.drawerArea;
    if (known && known.width === size.width && known.height === size.height) return;
    this.drawerArea = { width: size.width, height: size.height };
    cx.notify();
  }

  beginResize(event, cx) { resizer.beginResize(this, event, cx); }
  moveResize(event, cx) { resizer.moveResize(this, event, cx); }
  endResize(cx) { resizer.endResize(this, cx); }
  hoverRow(id, hovered, cx) { if (hovered && !this.resize && this.hoveredRow !== id) { this.hoveredRow = id; cx.notify(); } }

  scheduleFilter(cx) {
    const token = ++this.filterToken;
    cx.timer.after(FILTER_DELAY_MS, (cx) => {
      if (token !== this.filterToken) return;
      this.set({ filter: this.filterInput.value() });
      cx.notify();
    });
  }

  tick(cx) {
    if (!isShown(MOD)) {
      this.isHidden = true;
      return;
    }
    if (this.isHidden) {
      this.isHidden = false;
      this.refresh(cx);
      return;
    }
    act.refreshStatus(this, cx, false);
    const { tab, follow, logs, logResource, traces, trace } = this.state;
    if (tab === "logs" && (follow || logs.name !== logResource)) act.reloadLogs(this, cx);
    if (tab === "traces" && !trace && traces.at === 0) act.reloadTraces(this, cx);
    if (tab === "db" && Date.now() - this.state.db.at > DB_MS) dbAct.reloadDb(this, cx);
  }

  traceTick(cx) {
    if (this.state.tab === "traces" && !this.state.trace) act.reloadTraces(this, cx);
  }

  async commandLoop(cx) {
    for (;;) {
      const command = await nextCommand();
      if (command === "focus") this.handle.focus();
      else if (command === "escape") this.escape(cx);
      else if (command === "dock" && props()?.overlay) this.togglePlace(cx);
      else if (command === "float" && !props()?.overlay) this.togglePlace(cx);
      else if (command === "tab") this.openTab(cx);
      else if (command === "refresh") this.refresh(cx);
      else if (TABS.includes(command)) this.setTab(command, cx);
      cx.notify();
    }
  }

  setTab(tab, cx) {
    const isSame = tab === this.state.tab;
    this.set({ tab, confirm: null, message: "", drawerOpen: isSame && this.state.drawerOpen });
    this.hoveredRow = null;
    this.persist();
    this.handle.focus();
    if (tab === "logs") this.ensureLogResource(cx);
    if (tab === "traces" && !this.state.trace) act.reloadTraces(this, cx);
    if (tab === "db") dbAct.reloadDb(this, cx);
    cx.notify();
  }

  ensureLogResource(cx) {
    const { resources } = this.state.status;
    const known = resources.some((one) => one.name === this.state.logResource);
    if (!known) {
      const first = resources.find((one) => one.name === this.state.selected) ?? resources.find((one) => one.logs) ?? resources[0];
      if (first) this.set({ logResource: first.name });
    }
    act.reloadLogs(this, cx);
  }

  pickLogResource(name, cx) {
    this.set({ logResource: name, logs: { ...act.EMPTY_LOGS, name } });
    this.persist();
    this.handle.focus();
    act.reloadLogs(this, cx);
    cx.notify();
  }

  stepLogResource(step, cx) {
    const { resources } = this.state.status;
    if (resources.length === 0) return;
    const at = resources.findIndex((one) => one.name === this.state.logResource);
    const next = resources[(Math.max(at, 0) + step + resources.length) % resources.length];
    this.pickLogResource(next.name, cx);
  }

  logsOf(name, cx) {
    if (!name) { this.set({ message: "Select a resource first." }); return; }
    this.set({ selected: name, logResource: name, logs: { ...act.EMPTY_LOGS, name }, tab: "logs", confirm: null, message: "", drawerOpen: false });
    this.persist();
    act.reloadLogs(this, cx);
    cx.notify();
  }

  clickRow(name, cx) { sel.clickRow(this, name, cx); }
  clickDbRow(name, cx) { sel.clickDbRow(this, name, cx); }
  clickTrace(id, cx) { sel.clickTrace(this, id, cx); }
  openTraceRow(id, cx) { act.openTrace(this, id, cx); this.handle.focus(); }
  closeDrawer(cx) { sel.closeDrawer(this, cx); }
  toggleStale(cx) { this.set({ staleOpen: !this.state.staleOpen }); cx.notify(); }

  requestAction(action, cx) {
    act.requestAction(this, action, cx);
    cx.notify();
  }

  confirmAction(cx) {
    const { confirm } = this.state;
    if (confirm?.action === daemon.DAEMON_ACTION) daemon.stopDaemon(this, cx);
    else if (confirm) act.performAction(this, confirm.action, confirm.name, cx);
    cx.notify();
  }

  requestDaemonStop(cx) {
    daemon.requestDaemonStop(this, cx);
    cx.notify();
  }

  pickInstance(name, cx) {
    daemon.selectInstance(this, name, cx);
    this.set({ drawerOpen: false });
    this.handle.focus();
    cx.notify();
  }

  runDbDiff(cx) { dbAct.runDbDiff(this, cx); cx.notify(); }
  askDb(cx) { dbAct.askDb(this, cx); cx.notify(); }
  askLogs(cx) { act.askLogs(this, cx); cx.notify(); }
  askTrace(cx) { act.askTrace(this, cx); cx.notify(); }
  cancelConfirm(cx) { this.set({ confirm: null }); cx.notify(); }

  openUrl(url, cx) {
    if (url) cx.open_url(url);
    else this.set({ message: "This resource has no URL." });
  }

  refresh(cx) {
    act.refreshStatus(this, cx, true);
    daemon.refreshInstances(this, cx);
    if (this.state.tab === "logs") act.reloadLogs(this, cx);
    if (this.state.tab === "db") dbAct.reloadDb(this, cx);
    if (this.state.tab === "traces") {
      if (this.state.trace) act.openTrace(this, this.state.trace.id, cx);
      else act.reloadTraces(this, cx);
    }
    cx.notify();
  }

  toggle(field, cx) {
    this.set({ [field]: !this.state[field] });
    this.persist();
    if (field === "includeHealth") act.reloadTraces(this, cx);
    if (field === "follow" && this.state.follow) { act.reloadLogs(this, cx); this.logScroll.scroll_to_bottom(); }
    cx.notify();
  }

  focusFilter(cx) {
    if (this.state.tab !== "logs") return;
    this.filterInput.focus();
    cx.notify();
  }

  copyLines(text, cx) {
    if (!text) return;
    cx.write_to_clipboard(text);
    this.set({ message: `Copied ${text.length} characters.` });
    cx.notify();
  }

  togglePlace(cx) {
    cx.spawn(async (cx) => {
      this.set({ message: props()?.overlay ? await dockHere(MOD, cx) : floatAgain(MOD) });
      cx.notify();
    });
  }

  openTab(cx) {
    if (!props()?.overlay) return;
    cx.spawn(async (cx) => {
      this.set({ message: await openAsTab(MOD, "Orbit", cx) });
      cx.notify();
    });
  }

  escape(cx) {
    const { confirm, tab, filter } = this.state;
    if (this.typing.size > 0) this.handle.focus();
    else if (confirm) this.set({ confirm: null });
    else if (sel.hasOpenDrawer(this)) sel.closeDrawer(this, cx);
    else if (tab === "logs" && (filter || this.filterInput.value())) { this.filterInput.set_value(""); this.set({ filter: "" }); }
    else if (props()?.overlay) closeOverlay(props().overlay);
  }

  render() {
    const t = theme();
    return v_flex().id("orbit").track_focus(this.handle).size_full().min_h(0).font_family(mono()).bg(t.chrome).text_color(t.foreground).text_size(12.5)
      .on_size_change((size, cx) => { this.size = size; cx.notify(); })
      .on_key_down((e, cx) => onKey(this, e, cx))
      .child(shellView(this, t));
  }

  async close() {
    this.logScroll?.release();
    this.traceScroll?.release();
  }
}
