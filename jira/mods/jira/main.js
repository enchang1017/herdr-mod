import { View } from "gpui-kit";
import { v_flex, InputState, TextareaState, VirtualListScrollHandle } from "gpui-base";
import { theme, nextCommand, props } from "herdr";
import { authStatus, errorText, LOGIN_COMMAND, useSleep } from "./acli.js";
import { searchIssues, whoAmI, needsDetail, viewIssue, cachedDetail, CACHE_MS, hydrate, peekList, knownIdentity, rememberIdentity } from "./data.js";
import { readDiskCache, flushDiskCache } from "./disk-cache.js";
import { loadSettings } from "./settings.js";
import { loadIdOf, loadOf, patchLoad, isCurrentLoad, queryFor } from "./loads.js";
import { fuzzyRows } from "./fuzzy.js";
import { loadUiState, saveUiState } from "./ui-state.js";
import { isShown } from "./visibility.js";
import { dockHere, openAsTab, floatAgain } from "./dock.js";
import { onKey, escape } from "./keys.js";
import * as act from "./actions.js";
import * as resizer from "./drawer-resize.js";
import { header, keyHint } from "./views/header.js";
import { tableCard, loginCard, MAX_ROWS } from "./views/table.js";
import { drawerArea } from "./views/drawer.js";
import { sortStatuses } from "./views/action-panel.js";
import { mono } from "./views/widgets.js";
import { boardBody } from "./views/board.js";
import { loadBoard, showCachedBoard } from "./board-controller.js";
import { boardView, visibleCards, moveVertical } from "./board-nav.js";

const MOD = "jira";
const TICK_MS = 1000;
const CLOCK_MS = 60000;
const PREFETCH = 12;
const PREFETCH_PARALLEL = 6;
const FOCUS_DELAY_MS = 300;

function initialState(ui) {
  return {
    view: ui.value.view, rows: [], at: 0, loads: Object.freeze({}), ranJql: ui.value.jql ?? "", auth: "unknown", site: null, me: null,
    filter: "", selected: ui.value.selected, drawer: null, lastKey: null, detail: { key: "", loading: false, error: "" }, action: null,
    statuses: { id: "", list: [], loading: false, error: "" }, drawerWidth: ui.value.drawerWidth, message: ui.error,
    boardEntry: null, boardFilter: ui.value.boardFilter, collapsed: ui.value.collapsed, boardCol: 0, labelFocus: null,
    boardScroll: 0, boardProgress: null, boardViewH: 0, boardWheelAt: 0, drag: null, dropCol: null,
  };
}

export default class Jira extends View {
  init(_props, cx) {
    const ui = loadUiState();
    this.state = initialState(ui);
    this.hovered = null; this.drawerArea = null; this.resize = null; this.typing = new Set(); this.prefetching = false;
    this.hidden = !isShown(MOD); this.ready = false;
    this.handle = cx.focus_handle();
    this.rowScroll = VirtualListScrollHandle.new();
    this.makeInputs(ui.value);
    cx.timer.every(TICK_MS, (cx) => this.tick(cx));
    cx.timer.every(CLOCK_MS, (cx) => { if (isShown(MOD)) cx.notify(); });
    cx.timer.after(FOCUS_DELAY_MS, () => this.handle.focus());
    cx.spawn((cx) => this.commandLoop(cx));
    cx.spawn(async (cx) => this.warmStart(cx));
  }

  async warmStart(cx) {
    useSleep((ms) => cx.sleep(ms));
    await loadSettings();
    this.ready = true;
    hydrate(await readDiskCache());
    const id = knownIdentity();
    this.set({ site: this.state.site ?? id.site, me: this.state.me ?? id.me });
    this.showCached();
    cx.notify();
    if (!this.hidden) this.load(cx, false);
  }

  showCached() {
    if (this.state.view === "board") return showCachedBoard(this);
    const hit = peekList(queryFor(this).jql);
    if (hit && !this.state.rows.length) this.set({ rows: hit.rows, at: hit.at });
  }

  makeInputs(saved) {
    this.filterInput = InputState.new({ placeholder: "fuzzy filter: key, summary, status, assignee" });
    this.filterInput.on("change", (_e, cx) => this.applyFilter(cx));
    this.filterInput.on("submit", (_e, cx) => { this.blur(cx); act.openDrawer(this, this.shownRows()[0]?.key, cx); });
    this.jqlInput = InputState.new({ placeholder: "JQL, Enter runs it", value: saved.jql });
    this.jqlInput.on("submit", (_e, cx) => this.runJql(cx));
    this.commentInput = TextareaState.new({ placeholder: "Write a comment\u{2026}", rows: 4 });
    [["filter", this.filterInput], ["jql", this.jqlInput], ["comment", this.commentInput]].forEach(([name, input]) => {
      input.on("focus", (_e, cx) => { this.typing = new Set([...this.typing, name]); cx.notify(); });
      input.on("blur", (_e, cx) => { this.typing = new Set([...this.typing].filter((one) => one !== name)); cx.notify(); });
    });
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
  }

  persist() {
    const error = saveUiState({ view: this.state.view, jql: this.jqlInput.value(), drawerWidth: this.state.drawerWidth ?? null, selected: this.state.selected,
      boardFilter: this.state.boardFilter, collapsed: this.state.collapsed });
    if (error) this.set({ message: error });
  }

  async commandLoop(cx) {
    for (;;) {
      const command = await nextCommand();
      if (command === "focus") this.handle.focus();
      else if (command === "refresh") this.refreshAll(cx);
      else if (command === "escape") escape(this, cx);
      else if (command === "dock" && props()?.overlay) this.togglePlace(cx);
      else if (command === "float" && !props()?.overlay) this.togglePlace(cx);
      else if (command === "tab") this.openTab(cx);
      else if (command === "down" || command === "up") this.move(command === "down" ? 1 : -1, cx);
      cx.notify();
    }
  }

  tick(cx) {
    flushDiskCache();
    if (!this.ready) return;
    if (!isShown(MOD)) {
      this.hidden = true;
      return;
    }
    const resumed = this.hidden;
    this.hidden = false;
    const { auth, action } = this.state;
    const { loading, triedAt } = this.loadState();
    if (loading || auth === "login" || action) return;
    if (resumed || Date.now() - triedAt >= CACHE_MS) this.load(cx, false);
  }

  async ensureAuth() {
    if (this.state.auth === "ok") return true;
    if (this.state.site) {
      this.set({ auth: "ok" });
      return true;
    }
    const status = await authStatus();
    this.set({ auth: status.ok ? "ok" : status.needsLogin ? "login" : "error", site: status.site });
    if (status.ok) rememberIdentity({ site: status.site });
    if (!status.ok && !status.needsLogin) throw new Error(status.message);
    return status.ok;
  }

  learnMe(cx) {
    if (this.state.me || this.learningMe) return;
    this.learningMe = true;
    cx.spawn(async (cx) => {
      const me = await whoAmI().catch((e) => { console.log(`jira: whoami failed: ${errorText(e)}`); return null; });
      this.learningMe = false;
      if (!me) return;
      this.set({ me });
      rememberIdentity({ me });
      cx.notify();
    });
  }

  load(cx, force) {
    if (this.state.view === "board") return loadBoard(this, cx, force);
    const query = queryFor(this);
    if (query.problem) {
      this.set({ rows: [], at: 0 });
      patchLoad(this, query.jql, { loading: false, error: query.problem, triedAt: Date.now() });
      return cx.notify();
    }
    const cached = peekList(query.jql);
    if (cached) this.set({ rows: cached.rows, at: cached.at });
    if (loadOf(this, query.jql).loading) return;
    patchLoad(this, query.jql, { loading: true, triedAt: Date.now() });
    cx.spawn(async (cx) => {
      try {
        if (await this.ensureAuth()) {
          const entry = await searchIssues(query.jql, query.limit, force);
          if (isCurrentLoad(this, query.jql)) this.set({ rows: entry.rows, at: entry.at });
        }
        patchLoad(this, query.jql, { error: "" });
      } catch (e) {
        if (e.auth) this.set({ auth: "login" });
        patchLoad(this, query.jql, { error: e.auth ? "" : errorText(e) });
      } finally {
        patchLoad(this, query.jql, { loading: false });
        this.afterList(query.jql, cx);
        cx.notify();
      }
    });
    cx.notify();
  }

  afterList(jql, cx) {
    if (!isCurrentLoad(this, jql)) return;
    const rows = this.shownRows();
    if (!rows.some((row) => row.key === this.state.selected)) this.set({ selected: rows[0]?.key ?? null });
    this.prefetch(cx);
    if (this.state.auth === "ok") this.learnMe(cx);
  }

  prefetch(cx) {
    if (this.prefetching) return;
    const keys = this.state.rows.slice(0, PREFETCH).map((row) => row.key).filter(needsDetail);
    if (!keys.length) return;
    this.prefetching = true;
    const queue = [...keys];
    const worker = async (cx) => {
      while (queue.length && isShown(MOD)) {
        const key = queue.shift();
        await viewIssue(key, false).catch((e) => console.log(`jira: prefetch ${key} failed: ${errorText(e)}`));
        cx.notify();
      }
    };
    cx.spawn(async (cx) => {
      await Promise.all(Array.from({ length: PREFETCH_PARALLEL }, () => worker(cx)));
      this.prefetching = false;
    });
  }

  loadState() {
    return loadOf(this, loadIdOf(this));
  }

  shownRows() {
    if (this.state.view === "board") return visibleCards(boardView(this));
    return fuzzyRows(this.state.rows, this.state.filter);
  }

  sortedStatuses() {
    return sortStatuses(this.state.statuses.list);
  }

  assignKind() {
    const issue = act.issueOf(this, this.state.drawer?.key);
    return issue?.assignee && issue.assignee === this.state.me ? "unassign" : "assign";
  }

  applyFilter(cx) {
    this.set({ filter: this.filterInput.value() });
    const rows = this.shownRows();
    if (rows.length && !rows.some((row) => row.key === this.state.selected)) this.set({ selected: rows[0].key });
    cx.notify();
  }

  clearFilter(cx) {
    this.filterInput.set_value("");
    this.set({ filter: "" });
    cx.notify();
  }

  focusFilter(cx) {
    this.filterInput.focus();
    cx.notify();
    return true;
  }

  blur(cx) {
    this.typing = new Set();
    this.handle.focus();
    cx.notify();
  }

  pickView(key, cx) {
    if (key === this.state.view && key !== "jql") return this.refreshAll(cx);
    this.set({ view: key, rows: [], at: 0, labelFocus: null });
    this.persist();
    if (key === "jql") this.jqlInput.focus();
    this.load(cx, false);
  }

  runJql(cx) {
    this.set({ view: "jql", rows: [], at: 0, ranJql: this.jqlInput.value() });
    this.persist();
    this.blur(cx);
    this.load(cx, true);
  }

  refresh(cx) {
    this.load(cx, true);
  }

  refreshAll(cx) {
    this.load(cx, true);
    if (this.state.drawer) act.loadDetail(this, this.state.drawer.key, cx, true);
    return true;
  }

  retryAuth(cx) {
    this.set({ auth: "unknown" });
    this.load(cx, true);
  }

  move(step, cx) {
    if (this.state.view === "board") return moveVertical(this, step, cx);
    const rows = this.shownRows();
    if (!rows.length) return true;
    const at = rows.findIndex((row) => row.key === this.state.selected);
    const index = Math.max(0, Math.min(rows.length - 1, at < 0 ? 0 : at + step));
    const next = rows[index];
    this.set({ selected: next.key });
    this.rowScroll.scroll_to_item(Math.min(index, MAX_ROWS - 1));
    this.persist();
    if (this.state.drawer && this.state.drawer.key !== next.key) act.openDrawer(this, next.key, cx);
    cx.notify();
    return true;
  }

  clickRow(key, cx) {
    const isOpen = this.state.drawer?.key === key;
    this.set({ selected: key });
    this.persist();
    this.handle.focus();
    if (isOpen) act.closeDrawer(this, cx);
    else act.openDrawer(this, key, cx);
  }

  hoverRow(key, hovered, cx) {
    if (!hovered || this.resize || this.hovered === key) return;
    this.hovered = key;
    cx.notify();
  }

  drawnIssue() { return act.issueOf(this, this.state.drawer?.key ?? this.state.lastKey); }
  detailFor(key) { return cachedDetail(key); }
  openKey(key, cx) { act.openDrawer(this, key, cx); }
  closeDrawer(cx) { act.closeDrawer(this, cx); }
  refreshDetail(cx) { if (this.state.drawer) act.loadDetail(this, this.state.drawer.key, cx, true); cx.notify(); }
  beginAction(kind, cx) { act.beginAction(this, kind, cx); }
  pickStatus(status, cx) { act.pickStatus(this, status, cx); }
  reviewComment(cx) { act.reviewComment(this, cx); }
  confirmAction(cx) { act.confirmAction(this, cx); }
  cancelAction(cx) { act.cancelAction(this, cx); }
  copyKey(cx) { act.copyKey(this, cx); }
  copyBranch(cx) { act.copyBranch(this, cx); }
  browse(cx) { act.browse(this, cx); }
  startDev(cx) { act.startDev(this, cx); }
  openUrl(url, cx) { act.openLink(this, url, cx); }
  measureDrawer(size, cx) {
    const known = this.drawerArea;
    if (known && known.width === size.width && known.height === size.height) return;
    this.drawerArea = { width: size.width, height: size.height };
    cx.notify();
  }
  measureBoard(size, cx) {
    if (this.state.boardViewH === size.height) return;
    this.set({ boardViewH: size.height });
    cx.notify();
  }
  beginResize(event, cx) { resizer.beginResize(this, event, cx); }
  moveResize(event, cx) { resizer.moveResize(this, event, cx); }
  endResize(cx) { resizer.endResize(this, cx); }

  togglePlace(cx) {
    cx.spawn(async (cx) => {
      this.set({ message: props()?.overlay ? await dockHere(MOD, cx) : floatAgain(MOD) });
      cx.notify();
    });
  }

  openTab(cx) {
    if (!props()?.overlay) return;
    cx.spawn(async (cx) => {
      this.set({ message: await openAsTab(MOD, "Jira", cx) });
      cx.notify();
    });
  }

  body(t) {
    if (this.state.auth === "login") return loginCard(this, t, LOGIN_COMMAND);
    return drawerArea(this, t, this.state.view === "board" ? boardBody(this, t) : tableCard(this, t));
  }

  render() {
    const t = theme();
    return v_flex().id("jira").track_focus(this.handle).size_full().min_h(0).font_family(mono()).bg(t.chrome).text_color(t.foreground).text_size(12)
      .on_key_down((e, cx) => onKey(this, e, cx))
      .child(header(this, t))
      .child(v_flex().flex_1().min_h(0).child(this.body(t)))
      .child(keyHint(this, t));
  }

  async close() {
    this.rowScroll?.release();
  }
}
