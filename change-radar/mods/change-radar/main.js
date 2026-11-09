import { View } from "gpui-kit";
import { v_flex, InputState } from "gpui-base";
import { theme, notify, nextCommand, props, run, closeOverlay, shared, setShared } from "herdr";
import { Radar } from "./radar.js";
import { Detail } from "./detail.js";
import { Compare } from "./compare.js";
import { overview } from "./overview.js";
import { Graph } from "./graph.js";
import { GraphWindow } from "./graph-window.js";
import { monoFont } from "./ui.js";
import { GraphTab } from "./graph-tab.js";
import { SessionTab } from "./session-tab.js";
import { CiStore } from "./ci-poll.js";
import { loadUi, saveUi } from "./ui-state.js";
import { rootFor, topBar, placeKind, MOD } from "./shell.js";
import { dockHere, openAsTab, floatAgain } from "./dock.js";
import { deliver, resolveTarget, loadTargetName, saveTargetName, refreshSessionNames } from "./target.js";
import { fetchRepo, worktreeHashes } from "./git.js";
import { loadReviews, saveReviews, fingerprint, reviewState, SummaryCache, migrateLegacy } from "./store.js";
import { readPin, checkPin, pinnedRoot, applyPin } from "./pin.js";
import { startReviewer, reviewText } from "./review.js";
import { compareCommand } from "./compare-state.js";
import { loadSettings } from "./settings.js";
import { ciTargets } from "./ci-focus.js";
import { isShown } from "./visibility.js";
import { copyId } from "./lease.js";
import { exclusive, wonCommand } from "./once.js";
import { initExtras, extraBody, extraKey, extraCommand } from "./extras.js";

const REPOS_KEY = "change-radar.repos";
const HIDDEN_BEAT_MS = 5000;

export default class ChangeRadar extends View {
  init(_props, cx) {
    if (props()?.role === "graph") {
      this.solo = new GraphWindow(props(), cx);
      return;
    }
    const loaded = loadReviews();
    this.reviews = loaded.value; this.storeError = loaded.error;
    this.cache = new SummaryCache();
    this.radar = new Radar();
    this.radar.reviewed = new Set(Object.keys(this.reviews));
    this.detail = new Detail(this);
    this.compare = new Compare(this, InputState.new({ placeholder: "a..b (any refs)" }));
    this.graph = new Graph({ on: () => this.radar.on, name: (path) => this.radar.name(path), cache: this.cache, review: (path, range, cx) => this.sendReview(path, cx, range) });
    this.width = 0; this.typing = false;
    this.view = { name: "overview" };
    this.pin = readPin(props());
    this.tab = this.pin ? (this.pin.view === "graph" ? "graph" : "radar") : loadUi().tab;
    this.graphTab = new GraphTab(this);
    this.sessionTab = new SessionTab(this);
    if (props()?.tab === "session") { this.tab = "session"; this.sessionTab.ensure(cx, typeof props().sessionId === "string" ? props().sessionId : null); }
    this.owner = copyId();
    this.ci = new CiStore({ on: () => this.radar.on, cache: this.cache, owner: this.owner });
    initExtras(this, cx);
    this.fetching = new Set(); this.sending = false;
    this.targetInput = InputState.new({ placeholder: "new session", value: loadTargetName() });
    this.targetInput.on("change", (_e, cx) => { this.storeError = saveTargetName(this.targetInput.value()) || this.storeError; this.refreshNames(cx); cx.notify(); });
    this.targetInput.on("focus", () => { this.typing = true; });
    this.targetInput.on("blur", () => { this.typing = false; });
    this.handle = cx.focus_handle();
    this.refreshNames(cx);
    this.migrate(cx);
    this.checkPin(cx);
    this.loadSettings(cx);
    this.beatAt = 0;
    cx.timer.every(700, (cx) => this.beat(cx));
    cx.spawn(async (cx) => { for (;;) { this.command(await nextCommand(), cx); cx.notify(); } });
    if (props()?.overlay) cx.timer.after(300, () => this.handle.focus());
  }

  beat(cx) {
    const now = Date.now();
    const shown = isShown(MOD);
    if (!shown && now - this.beatAt < HIDDEN_BEAT_MS) return;
    this.beatAt = now;
    this.radar.tick(cx);
    this.syncRoot(cx);
    applyPin(this, cx);
    this.publishRepos();
    if (shown && this.tab === "graph") this.graphTab.ensure(cx);
    this.pollCi(cx, shown);
  }

  publishRepos() {
    if (this.pin || this.radar.on || this.radar.discovering || !this.radar.root) return;
    const { root, repos } = this.radar;
    if (this.published?.root === root && this.published.repos === repos) return;
    this.published = { root, repos };
    const value = { root, repos };
    if (JSON.stringify(shared(REPOS_KEY)) !== JSON.stringify(value)) setShared(REPOS_KEY, value);
  }

  loadSettings(cx) {
    cx.spawn(async (cx) => {
      await loadSettings().catch((e) => notify({ title: "Git", body: String(e.message ?? e), level: "warning" }));
      this.syncRoot(cx);
      cx.notify();
    });
  }

  checkPin(cx) {
    if (!this.pin || this.pin.error) return;
    cx.spawn(async (cx) => {
      this.pin = await checkPin(this.pin);
      this.syncRoot(cx);
      cx.notify();
    });
  }

  migrate(cx) {
    cx.spawn(async (cx) => {
      const changed = await migrateLegacy().catch((e) => { this.storeError = `Could not move saved reviews: ${e.message ?? e}`; return false; });
      if (!changed) return;
      const loaded = loadReviews();
      this.reviews = loaded.value;
      this.cache.reload();
      this.radar.setReviewed(Object.keys(this.reviews), cx);
      cx.notify();
    });
  }

  refreshNames(cx) {
    cx.spawn(async (cx) => {
      await refreshSessionNames().catch((e) => { this.storeError = `Could not read Claude sessions: ${e.message ?? e}`; });
      cx.notify();
    });
  }

  afterSend(result) {
    if (result?.sent) run("pane.focus", { terminal: result.sent });
    if (this.graph.windowId) closeOverlay(this.graph.windowId);
    this.graph.windowId = null;
    if (props()?.overlay) closeOverlay(props().overlay);
  }

  pollCi(cx, shown) {
    this.ci.tick(shown ? ciTargets(this) : [], cx, shown);
  }

  refreshCi(cx) {
    this.ci.refresh(ciTargets(this), cx);
  }

  setTab(tab, cx) {
    this.tab = tab;
    this.storeError = saveUi({ tab }) || this.storeError;
    if (tab === "graph") this.graphTab.ensure(cx);
    this.handle.focus();
    cx.notify();
  }

  openGraphTab(path, cx) {
    this.setTab("graph", cx);
    if (path) this.graphTab.select(path, cx);
  }

  togglePlace(cx) {
    cx.spawn(async (cx) => {
      const error = props()?.overlay ? await dockHere(MOD, cx) : floatAgain(MOD);
      if (error) notify({ title: "Git", body: error, level: "warning" });
    });
  }

  openTab(cx) {
    if (!props()?.overlay) return;
    cx.spawn(async (cx) => {
      const error = await openAsTab(MOD, "Git", cx);
      if (error) notify({ title: "Git", body: error, level: "warning" });
    });
  }

  onKey(e, cx) {
    const place = placeKind(e);
    if (place === "toggle") this.togglePlace(cx);
    else if (place === "tab") this.openTab(cx);
    else return this.keyDown(e.keystroke, cx);
    return true;
  }

  syncRoot(cx) {
    const { root, on, source } = pinnedRoot(this.pin) ?? rootFor();
    this.rootSource = source;
    if (!root || (root === this.radar.root && on === this.radar.on)) return;
    this.radar.setRoot(root, on, cx);
    this.view = { name: "overview" };
    cx.notify();
  }

  command(name, cx) {
    if (!exclusive(name)) { this.dispatch(name, cx); return; }
    cx.spawn(async (cx) => {
      if (!(await wonCommand(name, this.owner, cx))) return;
      this.dispatch(name, cx);
      cx.notify();
    });
  }

  dispatch(name, cx) {
    if (name === "focus") this.handle.focus();
    else if (name === "refresh") this.refresh(cx);
    else if (name === "back") this.back(cx);
    else if (name === "overview") this.go({ name: "overview" }, cx);
    else if (name === "review" && this.view.path) this.sendReview(this.view.path, cx);
    else if (name === "down" || name === "up") this.move(name === "down" ? 1 : -1, cx);
    else if (name === "open") this.openSelected(cx);
    else if (name === "summarize" && this.view.name === "compare") this.compare.summarize(cx, false);
    else if (name === "summarize" && this.view.name === "detail") this.detail.summarize(cx, true);
    else if (name === "mark" && this.view.path) this.toggleReviewed(this.view.path, cx);
    else if (name === "compare" && this.view.path) this.go({ name: "compare", path: this.view.path }, cx);
    else if (name === "graph") this.openGraph(cx);
    else if (name === "radar") this.setTab("radar", cx);
    else if (name === "repos" && this.tab === "graph") this.graphTab.togglePicker(cx);
    else if (name === "dock" && props()?.overlay) this.togglePlace(cx);
    else if (name === "float" && !props()?.overlay) this.togglePlace(cx);
    else if (name === "tab") this.openTab(cx);
    else if (name.startsWith("graph-compare-") && this.tab === "graph") this.graphCompareCommand(name.slice(14), cx);
    else if (name.startsWith("radar-compare-") && this.view.name === "compare") this.compare.command(name.slice(14), cx);
    else if (name.startsWith("graph-")) this.openGraphNamed(name.slice(6), cx);
    else if (name === "escape") this.keyDown("escape", cx);
    else if (name === "session" || name.startsWith("session-")) { this.setTab("session", cx); this.sessionTab.command(name, cx); }
    else if (!extraCommand(this, name, cx)) notify({ title: "Change radar", body: `Unknown command: ${name}`, level: "warning" });
  }

  graphCompareCommand(arg, cx) {
    if (arg.startsWith("pick-")) {
      this.graph.selectHash(arg.slice(5), cx);
      this.graph.beginPick(cx);
    } else compareCommand(this.graph.compare, this.graph.path, arg, cx);
  }

  openGraph(cx) {
    this.openGraphTab(this.view.path ?? this.radar.listed()[this.selected ?? 0]?.path, cx);
  }

  openGraphNamed(repo, cx) {
    const path = this.radar.repos.find((one) => this.radar.name(one) === repo);
    if (path) this.openGraphTab(path, cx);
    else notify({ title: "Change radar", body: `No repo named ${repo} under ${this.radar.root}`, level: "warning" });
  }

  move(step, cx) {
    if (this.tab === "session") { this.sessionTab.move(step, cx); return; }
    if (this.tab === "graph") { this.graph.move(step, cx); return; }
    if (this.view.name === "detail") { this.detail.move(step, cx); return; }
    const count = this.radar.listed().length;
    if (!count || this.view.name !== "overview") return;
    this.selected = Math.min(count - 1, Math.max(0, (this.selected ?? -1) + step));
    cx.notify();
  }

  openSelected(cx) {
    if (this.tab === "session") { this.sessionTab.openCursor(cx); return; }
    if (this.tab === "graph") { this.graph.openCursor(cx); return; }
    if (this.view.name === "detail") { this.detail.openCursor(cx); return; }
    const row = this.radar.listed()[this.selected ?? 0];
    if (this.view.name === "overview" && row) this.go({ name: "detail", path: row.path }, cx);
  }

  keyDown(key, cx) {
    if (extraKey(this, key, cx)) return true;
    if (this.tab === "session" && this.sessionTab.key(key, this.typing, cx)) return true;
    if (this.tab === "graph" && this.graphTab.picking && this.graphTab.pickerKey(key, this.typing, cx)) return true;
    if (this.typing) {
      if (key === "escape") this.handle.focus();
      return key === "escape";
    }
    if (this.tab === "graph" && this.graphKey(key, cx)) return true;
    if (this.tab !== "graph" && this.view.name === "compare" && this.compare.key(key, cx)) return true;
    if (key === "escape" && this.view.name !== "overview") this.back(cx);
    else if (key === "escape" && props()?.overlay) closeOverlay(props().overlay);
    else if (this.view.name === "compare") return false;
    else if (key === "j" || key === "down") this.move(1, cx);
    else if (key === "k" || key === "up") this.move(-1, cx);
    else if (key === "enter") this.openSelected(cx);
    else if (key === "r") this.refresh(cx);
    else return false;
    return true;
  }

  graphKey(key, cx) {
    if (key === "p") this.graphTab.togglePicker(cx);
    else if (key === "escape" && this.graph.escape(cx)) return true;
    else if (key === "escape") this.setTab("radar", cx);
    else if (key === "c") this.graph.compareKey(cx);
    else if (key === "x") this.graph.compare.clear(cx);
    else return false;
    return true;
  }

  back(cx) {
    if (this.view.name === "compare") this.go({ name: "detail", path: this.view.path }, cx);
    else this.go({ name: "overview" }, cx);
  }

  go(view, cx) {
    this.view = view;
    if (view.name === "detail" && this.detail.path !== view.path) this.detail.show(view.path, cx);
    else if (view.name === "detail" && !this.detail.data && !this.detail.loading) this.detail.show(view.path, cx);
    if (view.name === "compare") this.compare.show(view.path, cx);
    cx.notify();
  }

  refresh(cx) {
    this.radar.refreshAll(cx);
    if (this.view.name === "detail") this.detail.show(this.view.path, cx);
    cx.notify();
  }

  reviewOf(path, info) {
    return reviewState(this.reviews[path], info);
  }

  setReviews(next, cx) {
    this.reviews = next;
    this.storeError = saveReviews(next);
    this.radar.setReviewed(Object.keys(next), cx);
    cx.notify();
  }

  toggleReviewed(path, cx) {
    const info = this.radar.info[path];
    if (!info) return;
    if (this.reviewOf(path, info) === "reviewed") {
      this.setReviews(Object.fromEntries(Object.entries(this.reviews).filter(([k]) => k !== path)), cx);
      return;
    }
    cx.spawn(async (cx) => {
      try {
        const print = fingerprint(info, await worktreeHashes(path, info.entries, this.radar.on));
        this.radar.info = { ...this.radar.info, [path]: { ...this.radar.info[path], fingerprint: print, fingerprintError: null } };
        this.setReviews({ ...this.reviews, [path]: { fingerprint: print, at: Date.now() } }, cx);
        this.radar.enqueue([path], cx);
      } catch (e) {
        notify({ title: "Could not mark reviewed", body: String(e.message ?? e), level: "error" });
      }
      cx.notify();
    });
  }

  fetch(path, cx) {
    this.fetching = new Set([...this.fetching, path]);
    cx.spawn(async (cx) => {
      try {
        await fetchRepo(path, this.radar.on);
        this.radar.forgetBase(path);
        this.radar.enqueue([path], cx);
      } catch (e) {
        notify({ title: `Fetch failed: ${this.radar.name(path)}`, body: String(e.message ?? e), level: "error" });
      } finally {
        this.fetching = new Set([...this.fetching].filter((p) => p !== path));
        cx.notify();
      }
    });
    cx.notify();
  }

  sendReview(path, cx, range = null) {
    if (this.sending) return;
    const name = this.targetInput.value().trim();
    this.sending = true;
    cx.spawn(async (cx) => {
      try {
        const target = name ? await resolveTarget(name) : { reason: "unset" };
        if (target.address) this.afterSend(await deliver(name, reviewText(path, range), { name: `review ${this.radar.name(path)}` }));
        else await startReviewer(path, range, this.radar.on, cx, target.reason === "unset" ? null : `${name} is not a live Claude session`);
      } catch (e) {
        notify({ title: "Could not start the review", body: String(e.message ?? e), level: "error" });
      } finally {
        this.sending = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  body(t, cx) {
    const extra = extraBody(this, t);
    if (extra) return extra;
    if (this.tab === "graph") return this.graphTab.render(t, this.width);
    if (this.tab === "session") return this.sessionTab.render(t, this.width, cx);
    if (this.view.name === "detail") return this.detail.render(t, cx);
    if (this.view.name === "compare") return this.compare.render(t, this.width);
    return overview(this, t);
  }

  render(cx) {
    const t = theme();
    if (this.solo) return this.solo.render(t);
    return v_flex().id("change-radar").size_full().min_h(0).bg(t.chrome).text_color(t.foreground).text_size(12).font_family(monoFont())
      .track_focus(this.handle)
      .on_size_change((size, cx) => { this.width = size.width; cx.notify(); })
      .on_key_down((e, cx) => { if (this.onKey(e, cx)) cx.stop_propagation(); })
      .child(topBar(this, t))
      .child(this.body(t, cx));
  }
}
