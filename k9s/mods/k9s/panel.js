import { v_flex, InputState, VirtualListScrollHandle } from "gpui-base";
import { theme, nextCommand, props } from "herdr";
import { ALL_NAMESPACES, rowNamespaceOf, errorText } from "./kubectl.js";
import { INDEX_TTL_MS, INDEX_POLL_MS, INDEX_RETRY_MS, loadStore, saveIndex, saveRecent, buildIndex, rankTargets, rememberRecent } from "./finder.js";
import { startFollow, killTerminal, liveTitle } from "./live.js";
import { visibleRows } from "./table.js";
import { loadUiState, saveUiState } from "./ui-state.js";
import { loadTargetName, saveTargetName, refreshSessionNames } from "./target.js";
import * as browse from "./browse-actions.js";
import { dockHere, openAsTab, floatAgain } from "./dock.js";
import { finderView } from "./views/finder.js";
import { browseView } from "./views/browse.js";
import { liveBanner } from "./views/overlays.js";
import { mono } from "./views/widgets.js";
import { ProxyPool } from "./proxy.js";
import { isShown } from "./visibility.js";
import * as drawer from "./drawer-actions.js";
import * as writes from "./write-actions.js";
import * as resizer from "./drawer-resize.js";
import { onKey, escape, browseKey } from "./panel-keys.js";

const POLL_TICK_MS = 1_000;
const REAP_MS = 60_000;
const CLOCK_MS = 60_000;
const FILTER_DELAY_MS = 250;
const EMPTY_LISTING = { header: "", rows: [], fetchedAt: 0, attemptAt: 0, error: null, stale: false };

function initialState(store, ui) {
  return {
    view: ui.value.view, index: store.index, recent: store.recent, indexing: false, query: "",
    scope: ui.value.scope, filter: ui.value.filter, failingOnly: ui.value.failingOnly, drawerWidth: ui.value.drawerWidth,
    listing: EMPTY_LISTING, loadingList: false, failures: 0, forbidden: {}, confirm: null, help: false,
    contexts: { list: [], error: "" }, namespaces: { context: "", names: [], error: "", loading: false, at: 0 },
    picker: null, selected: ui.value.selectedName || null, detail: null, message: store.error || ui.error, asking: false,
    drawer: null, overview: drawer.EMPTY_OVERVIEW, write: null, lastRow: null,
  };
}

export class Panel {
  init(cx) {
    this.state = initialState(loadStore(), loadUiState());
    this.failedAt = {};
    this.code = null;
    this.size = null;
    this.drawerArea = null;
    this.pendingDrawer = null;
    this.resize = null;
    this.rowScroll = VirtualListScrollHandle.new();
    this.filterToken = 0;
    this.handle = cx.focus_handle();
    this.proxies = new ProxyPool();
    this.proxies.adopt(Date.now());
    this.makeInputs();
    this.refreshNames(cx);
    if (isShown("k9s")) this.refreshIndex(cx, { maxAge: INDEX_TTL_MS });
    cx.timer.every(INDEX_POLL_MS, (cx) => this.whenShown(() => this.refreshIndex(cx, {})));
    cx.timer.every(INDEX_RETRY_MS, (cx) => this.whenShown(() => this.refreshIndex(cx, { onlyFailed: true })));
    cx.timer.every(POLL_TICK_MS, (cx) => this.tick(cx));
    cx.timer.every(CLOCK_MS, (cx) => this.whenShown(() => cx.notify()));
    cx.timer.every(REAP_MS, () => this.proxies.reapIdle(Date.now()));
    cx.spawn((cx) => this.commandLoop(cx));
    this.isHidden = !isShown("k9s");
    this.isBrowsePending = this.state.view === "browse" && this.isHidden;
    if (this.state.view === "browse" && !this.isHidden) this.openBrowse(cx, { keepScope: true });
  }

  makeInputs() {
    this.queryInput = InputState.new({ placeholder: "type words · Enter follows the top row" });
    this.queryInput.on("change", (_e, cx) => { this.set({ query: this.queryInput.value() }); cx.notify(); });
    this.queryInput.on("submit", (_e, cx) => this.followTop(cx));
    this.filterInput = InputState.new({ placeholder: "filter names  /", value: this.state.filter });
    this.filterInput.on("change", (_e, cx) => this.scheduleFilter(cx));
    this.filterInput.on("submit", (_e, cx) => { this.applyFilter(); this.handle.focus(); cx.notify(); });
    this.targetInput = InputState.new({ placeholder: "new session", value: loadTargetName() });
    this.targetInput.on("change", (_e, cx) => { this.set({ message: saveTargetName(this.targetInput.value()) }); this.refreshNames(cx); cx.notify(); });
    this.targetInput.on("submit", (_e, cx) => { this.handle.focus(); cx.notify(); });
    this.confirmInput = InputState.new({ placeholder: "resource name" });
    this.confirmInput.on("change", (_e, cx) => { writes.typedWrite(this); cx.notify(); });
    this.confirmInput.on("submit", (_e, cx) => this.submitWrite(cx));
    this.scaleInput = InputState.new({ placeholder: "replicas" });
    [["set_min", 0], ["set_max", 50], ["set_step", 1]].forEach(([method, value]) => this.scaleInput[method](value));
    this.scaleInput.on("change", (_e, cx) => { writes.typedWrite(this); cx.notify(); });
    this.scaleInput.on("submit", (_e, cx) => this.submitWrite(cx));
    this.typing = new Set();
    [["query", this.queryInput], ["filter", this.filterInput], ["target", this.targetInput], ["confirm", this.confirmInput], ["scale", this.scaleInput]].forEach(([name, input]) => {
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
    const error = saveUiState(this.state, this.state.selected ?? "");
    if (error) this.set({ message: error });
  }

  shownRows() {
    return visibleRows(this.state.listing, this.state.filter, this.state.failingOnly);
  }

  scheduleFilter(cx) {
    const token = ++this.filterToken;
    cx.timer.after(FILTER_DELAY_MS, (cx) => {
      if (token !== this.filterToken) return;
      this.applyFilter();
      cx.notify();
    });
  }

  applyFilter() {
    this.filterToken += 1;
    this.set({ filter: this.filterInput.value() });
    this.persist();
  }

  async commandLoop(cx) {
    for (;;) {
      const command = await nextCommand();
      if (command === "focus") this.focus();
      else if (command === "find") this.openFinder(cx);
      else if (command === "browse") this.openBrowse(cx, {});
      else if (command === "reload") this.refreshIndex(cx, { isForced: true });
      else if (command === "follow") this.followTop(cx);
      else if (command === "escape") this.escape(cx);
      else if (command === "dock" && props()?.overlay) this.togglePlace(cx);
      else if (command === "float" && !props()?.overlay) this.togglePlace(cx);
      else if (command === "tab") this.openTab(cx);
      else if (this.state.view === "browse") browseKey(this, command === "down" ? "j" : command === "up" ? "k" : command, false, cx);
      cx.notify();
    }
  }

  focus() {
    if (this.state.view === "finder") this.queryInput.focus();
    else this.handle.focus();
  }

  refreshIndex(cx, options) {
    if (this.state.indexing) return;
    if (options.maxAge && Date.now() - this.state.index.updatedAt < options.maxAge) return;
    if (options.onlyFailed && Object.keys(this.failedAt).length === 0) return;
    this.set({ indexing: true });
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const built = await buildIndex(this.state.index, this.failedAt, { isForced: options.isForced === true, onlyFailed: options.onlyFailed === true, pool: this.proxies, cx });
        this.failedAt = built.failedAt;
        this.set({ index: built.index, message: built.error || saveIndex(built.index) });
      } catch (error) {
        this.set({ message: `Index failed: ${errorText(error)}` });
      } finally {
        this.set({ indexing: false });
        cx.notify();
      }
    });
  }

  openFinder(cx) {
    drawer.closeDrawer(this);
    this.set({ view: "finder", picker: null, message: "", help: false, confirm: null });
    this.persist();
    this.queryInput.focus();
    this.refreshIndex(cx, { maxAge: INDEX_TTL_MS });
    cx.notify();
  }

  openBrowse(cx, options) {
    const [top] = !options.keepScope && this.state.query ? rankTargets(this.state.index.targets, this.state.recent, this.state.query) : [];
    this.set({ view: "browse", picker: null, message: "" });
    this.persist();
    this.handle.focus();
    cx.notify();
    cx.spawn(async (cx) => {
      if (top) browse.changeScope(this, { context: top.context, namespace: top.namespace, resource: "deployments" }, cx);
      else {
        await browse.ensureScope(this);
        browse.reloadList(this, cx, true);
      }
      if (this.state.contexts.list.length === 0) browse.loadContexts(this, cx);
      cx.notify();
    });
  }

  whenShown(action) {
    if (isShown("k9s")) action();
  }

  tick(cx) {
    try {
      if (!isShown("k9s")) {
        this.isHidden = true;
        return;
      }
      if (this.isHidden) this.resume(cx);
      this.autoRefreshList(cx);
    } catch (error) {
      this.set({ message: `Refresh check failed: ${errorText(error)}` });
      cx.notify();
    }
  }

  resume(cx) {
    this.isHidden = false;
    if (this.isBrowsePending) {
      this.isBrowsePending = false;
      this.openBrowse(cx, { keepScope: true });
    }
    this.refreshIndex(cx, { maxAge: INDEX_POLL_MS });
    cx.notify();
  }

  autoRefreshList(cx) {
    const { view, write, picker, loadingList, confirm } = this.state;
    if (view !== "browse" || write || picker || loadingList || confirm) return;
    if (browse.pollDue(this, Date.now())) browse.reloadList(this, cx, false);
  }

  reloadList(cx) {
    this.set({ failures: 0 });
    if (this.state.picker === "namespace") browse.loadNamespaces(this, cx, true);
    browse.reloadList(this, cx, true);
  }

  loadContexts(cx) { browse.loadContexts(this, cx); }
  loadNamespaces(cx, isForced) { browse.loadNamespaces(this, cx, isForced); cx.notify(); }
  pickContext(context, cx) { browse.pickContext(this, context, cx); }
  pickNamespace(namespace, cx) { browse.changeScope(this, { namespace }, cx); }
  switchResource(resource, cx) { browse.changeScope(this, { resource }, cx); }
  allNamespaces(cx) { browse.askAllNamespaces(this, cx); }
  confirmAll(isYes, cx) { browse.confirmAllNamespaces(this, isYes, cx); }
  rowNamespace(cx) { browse.rowNamespace(this, cx); }
  selectedRow() { return browse.selectedRow(this); }
  clickRow(id, cx) { drawer.clickRow(this, id, cx); this.handle.focus(); cx.notify(); }
  openDrawerTab(tab, cx) { if (this.state.drawer) drawer.setTab(this, tab, cx); else drawer.openDrawer(this, tab, cx); cx.notify(); }
  setTab(tab, cx) { drawer.setTab(this, tab, cx); this.handle.focus(); cx.notify(); }
  refreshDrawer(cx) { drawer.refreshDrawer(this, cx); cx.notify(); }
  closeDetail(cx) { drawer.closeDrawer(this); this.handle.focus(); browse.reloadList(this, cx, true); cx.notify(); }
  askAgent(cx) { browse.askAgent(this, cx); }
  beginWrite(action, cx) { writes.beginWrite(this, action, cx); cx.notify(); }
  submitWrite(cx) { writes.submitWrite(this, cx); cx.notify(); }
  cancelWrite(cx) { writes.cancelWrite(this); cx.notify(); }
  startShell(container, cx) { writes.startShell(this, container, cx); cx.notify(); }

  measureDrawer(size, cx) {
    const known = this.drawerArea;
    if (known && known.width === size.width && known.height === size.height) return;
    this.drawerArea = { width: size.width, height: size.height };
    cx.notify();
  }

  beginResize(event, cx) { resizer.beginResize(this, event, cx); }
  moveResize(event, cx) { resizer.moveResize(this, event, cx); }
  endResize(cx) { resizer.endResize(this, cx); }

  jumpToWorkload(owner, cx) {
    const { scope } = this.state;
    const row = this.selectedRow();
    if (!row || owner.kind !== "Deployment") return;
    const namespace = rowNamespaceOf(scope, row);
    browse.changeScope(this, { resource: "deployments" }, cx);
    this.set({ selected: scope.namespace === ALL_NAMESPACES ? `${namespace}/${owner.name}` : `/${owner.name}` });
    this.pendingDrawer = "overview";
    cx.notify();
  }

  afterList(cx) {
    if (this.state.drawer && !this.selectedRow()) drawer.closeDrawer(this);
    if (!this.pendingDrawer || !this.selectedRow()) return;
    const tab = this.pendingDrawer;
    this.pendingDrawer = null;
    drawer.openDrawer(this, tab, cx);
  }

  copyDetail(cx) {
    const text = this.state.detail?.text ?? "";
    if (!text) return;
    cx.write_to_clipboard(text);
    this.set({ message: `Copied ${text.length} characters.` });
    cx.notify();
  }
  openLoki(cx) { browse.openLoki(this, cx); }
  toggleHelp(cx) { this.set({ help: !this.state.help }); cx.notify(); }
  focusFilter(cx) { this.filterInput.focus(); cx.notify(); }

  toggleFailing(cx) {
    this.set({ failingOnly: !this.state.failingOnly });
    this.persist();
    cx.notify();
  }

  togglePicker(kind, cx) {
    const next = this.state.picker === kind ? null : kind;
    this.set({ picker: next });
    if (next === "namespace") browse.loadNamespaces(this, cx, false);
    if (next === "context") browse.loadContexts(this, cx);
    cx.notify();
  }

  followTop(cx) {
    const [top] = rankTargets(this.state.index.targets, this.state.recent, this.state.query);
    if (top) this.followTarget(top, cx);
  }

  followTarget(target, cx) {
    const recent = rememberRecent(this.state.recent, target);
    this.set({ recent, message: saveRecent(recent) });
    this.startFollowing({ context: target.context, namespace: target.namespace, kind: target.kind, name: target.name }, cx);
  }

  followSelected(cx) {
    const { scope } = this.state;
    const row = this.selectedRow();
    if (!row || (scope.resource !== "pods" && scope.resource !== "deployments")) {
      this.set({ message: "Select a pod or deployment first." });
      cx.notify();
      return;
    }
    const kind = scope.resource === "pods" ? "pod" : "deployment";
    this.startFollowing({ context: scope.context, namespace: row.namespace ?? scope.namespace, kind, name: row.name }, cx);
  }

  startFollowing(live, cx) {
    this.set({ message: `Starting stream for ${liveTitle(live)}...` });
    cx.notify();
    cx.spawn(async (cx) => {
      const started = await startFollow(live).catch((error) => ({ error: errorText(error) }));
      this.set({ message: started.error ?? started.warning ?? "" });
      cx.notify();
    });
  }

  stopLive(address, cx) {
    cx.spawn(async (cx) => {
      this.set({ message: await killTerminal(address) });
      cx.notify();
    });
  }

  togglePlace(cx) {
    cx.spawn(async (cx) => {
      this.set({ message: props()?.overlay ? await dockHere("k9s", cx) : floatAgain("k9s") });
      cx.notify();
    });
  }

  openTab(cx) {
    if (!props()?.overlay) return;
    cx.spawn(async (cx) => {
      this.set({ message: await openAsTab("k9s", "k9s", cx) });
      cx.notify();
    });
  }

  escape(cx) { escape(this, cx); }

  render() {
    const t = theme();
    return v_flex().id("k9s").track_focus(this.handle).size_full().min_h(0).font_family(mono()).bg(t.chrome).text_color(t.foreground).text_size(12.5)
      .on_size_change((size, cx) => { this.size = size; cx.notify(); })
      .on_key_down((e, cx) => onKey(this, e, cx))
      .child(liveBanner(this, t))
      .child(this.state.view === "finder" ? finderView(this, t) : browseView(this, t));
  }

  async close() {
    this.code?.release();
    this.rowScroll?.release();
    await this.proxies.stopAll();
  }
}
