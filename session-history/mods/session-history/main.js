import { View } from "gpui-kit";
import { v_flex, InputState, VirtualListScrollHandle } from "gpui-base";
import { theme, props, closeOverlay, nextCommand, notify } from "herdr";
import { loadIndex, searchText, filterSessions, shortTitle } from "./data.js";
import { resumeSession, focusLive } from "./launch.js";
import { panelView } from "./view.js";

const SEARCH_DELAY_MS = 300;
const REFRESH_MS = 30_000;
const ACTION_GUARD_MS = 500;

const errorText = (error) => String(error?.message ?? error);

export default class SessionHistory extends View {
  init(_props, cx) {
    this.state = { sessions: [], indexing: false, pending: false, query: "", hits: null, truncated: false, searching: false, selected: 0, message: "", busy: false };
    this.searchToken = 0;
    this.lastAction = 0;
    this.handle = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    this.queryInput = InputState.new({ placeholder: "Search sessions: title, folder, then transcript text" });
    this.queryInput.on("change", (_e, cx) => this.queryChanged(cx));
    this.queryInput.on("submit", (e, cx) => this.act(Boolean(e?.secondary), cx));
    this.refresh(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
    cx.spawn((cx) => this.commandLoop(cx));
    if (props()?.overlay) cx.timer.after(300, () => this.queryInput.focus());
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
  }

  rows() {
    return filterSessions(this.state.sessions, this.state.query, this.state.query.trim() ? this.state.hits : null);
  }

  async commandLoop(cx) {
    for (;;) {
      const command = await nextCommand();
      if (command === "focus") this.queryInput.focus();
      cx.notify();
    }
  }

  refresh(cx) {
    if (this.state.indexing) return;
    this.set({ indexing: true });
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const index = await loadIndex();
        this.set({ sessions: index.sessions, pending: index.pending, indexError: index.errors[0] ?? "" });
        if (index.pending) cx.timer.after(200, (cx) => this.refresh(cx));
      } catch (error) {
        this.set({ message: errorText(error) });
      } finally {
        this.set({ indexing: false });
        cx.notify();
      }
    });
  }

  queryChanged(cx) {
    const query = this.queryInput.value();
    const token = ++this.searchToken;
    this.set({ query, hits: null, truncated: false, searching: false, selected: 0 });
    this.scroll.scroll_to_item(0);
    cx.notify();
    if (!query.trim()) return;
    cx.timer.after(SEARCH_DELAY_MS, (cx) => this.runSearch(token, query, cx));
  }

  runSearch(token, query, cx) {
    if (token !== this.searchToken) return;
    this.set({ searching: true });
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const found = await searchText(query.trim());
        if (token === this.searchToken) this.set({ hits: found.hits, truncated: found.truncated });
      } catch (error) {
        if (token === this.searchToken) this.set({ message: errorText(error) });
      } finally {
        if (token === this.searchToken) this.set({ searching: false });
        cx.notify();
      }
    });
  }

  move(step, count) {
    if (count === 0) return;
    const selected = Math.min(count - 1, Math.max(0, this.state.selected + step));
    this.set({ selected });
    this.scroll.scroll_to_item(selected);
  }

  clickRow(index, cx) {
    if (index < 0) return;
    const again = index === this.state.selected;
    this.set({ selected: index });
    if (again) this.act(false, cx);
    cx.notify();
  }

  act(fork, cx) {
    const now = Date.now();
    if (now - this.lastAction < ACTION_GUARD_MS || this.state.busy) return;
    this.lastAction = now;
    const session = this.rows()[this.state.selected];
    if (!session) return;
    this.set({ busy: true, message: "" });
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await this.open(session, fork, cx);
      } catch (error) {
        this.set({ message: `Could not open ${shortTitle(session)}: ${errorText(error)}` });
      } finally {
        this.set({ busy: false });
        cx.notify();
      }
    });
  }

  async open(session, fork, cx) {
    if (session.pid && !fork) {
      const address = await focusLive(session);
      if (!address) throw new Error(`it is live (pid ${session.pid}) but not in a Herdr terminal`);
      this.closeSelf();
      return;
    }
    const result = await resumeSession(session, fork, cx);
    if (!result.shown) notify({ title: "Session started", body: `${result.address} is running but its tab has not appeared yet.`, level: "warning" });
    this.closeSelf();
  }

  closeSelf() {
    const overlay = props()?.overlay;
    if (overlay) closeOverlay(overlay);
  }

  escape() {
    if (this.queryInput.value()) {
      this.queryInput.set_value("");
      this.searchToken += 1;
      this.set({ query: "", hits: null, truncated: false, searching: false, selected: 0 });
      this.scroll.scroll_to_item(0);
    } else {
      this.closeSelf();
    }
  }

  onKey(e, cx) {
    const { platform, control, alt } = e.modifiers;
    const handled = this.handleKey(e.key, platform, control || alt, cx);
    if (!handled) return;
    cx.stop_propagation();
    cx.notify();
  }

  handleKey(key, platform, other, cx) {
    if (other) return false;
    if (key === "escape" && !platform) this.escape();
    else if (key === "down" && !platform) this.move(1, this.rows().length);
    else if (key === "up" && !platform) this.move(-1, this.rows().length);
    else if (key === "enter") this.act(platform, cx);
    else return false;
    return true;
  }

  render() {
    const t = theme();
    return v_flex().id("session-history").track_focus(this.handle).w_full().bg(t.chrome).text_color(t.foreground)
      .on_key_down((e, cx) => this.onKey(e, cx))
      .child(panelView(this, t, this.rows()));
  }

  async close() {
    this.scroll?.release();
  }
}
