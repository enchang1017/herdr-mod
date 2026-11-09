import { View, div } from "gpui-kit";
import { theme, props, placement, closeOverlay, nextCommand, setAgentOrder, focused } from "herdr";
import { collect, needsLook, signature } from "./model.js";
import { jump } from "./ui.js";
import { ClaudeWatch, trackUnseen, unseen } from "./claude.js";
import { drawer } from "./drawer.js";
import { panel } from "./panel.js";

const CLOCK_MS = 30000;
const FOREGROUND_MS = 3000;
const FOCUS_DELAY_MS = 200;
const NAV = { down: 1, j: 1, up: -1, k: -1 };

export default class AgentRadar extends View {
  init(_props, cx) {
    this.dismissed = null;
    this.selected = 0;
    this.items = [];
    this.handle = cx.focus_handle();
    this.claude = new ClaudeWatch();
    this.lastClaude = {};
    this.claude.refresh(cx, true);
    this.claude.watch(cx);
    cx.timer.every(FOREGROUND_MS, (cx) => this.claude.refresh(cx, true));
    if (!this.floating()) cx.timer.after(FOCUS_DELAY_MS, () => this.handle.focus());
    cx.timer.every(CLOCK_MS, (cx) => cx.notify());
    cx.spawn(async (cx) => {
      for (;;) {
        this.command(await nextCommand(), cx);
        cx.notify();
      }
    });
  }

  collectAll() {
    const current = this.claude.statuses();
    trackUnseen(this.lastClaude, current, focused()?.terminal ?? null);
    this.lastClaude = current;
    return collect(current, unseen());
  }

  floating() {
    return Boolean(props()?.float) || placement() != null;
  }

  closable() {
    return Boolean(props()?.overlay);
  }

  close() {
    if (this.closable()) closeOverlay(props().overlay);
  }

  dismiss(cx) {
    this.dismissed = signature(needsLook(this.collectAll()));
    cx.notify();
  }

  open(item, cx) {
    jump(item);
    this.close();
    cx.notify();
  }

  command(name, cx) {
    if (name === "focus") return this.handle.focus();
    if (name !== "jump" || !this.floating()) return;
    const first = needsLook(this.collectAll())[0];
    if (first) jump(first);
  }

  key(e, cx) {
    const { platform, control, alt } = e.modifiers ?? {};
    if (platform || control || alt) return;
    if (e.key === "escape") return this.close();
    if (e.key === "enter" && this.items[this.selected]) return this.open(this.items[this.selected], cx);
    if (/^[1-9]$/.test(e.key) && this.items[Number(e.key) - 1]) return this.open(this.items[Number(e.key) - 1], cx);
    const step = NAV[e.key];
    if (!step || !this.items.length) return;
    this.selected = (this.selected + step + this.items.length) % this.items.length;
    cx.stop_propagation();
    cx.notify();
  }

  renderDrawer(t, now) {
    const list = needsLook(this.collectAll());
    if (!list.length) this.dismissed = null;
    if (!list.length || signature(list) === this.dismissed) return div();
    return drawer(t, this, list, now);
  }

  renderPanel(t, now) {
    this.items = this.collectAll();
    this.selected = Math.min(this.selected, Math.max(this.items.length - 1, 0));
    setAgentOrder(this.items.filter((item) => item.pane).map((item) => item.address));
    return panel(t, this, this.items, now);
  }

  render(_cx) {
    const t = theme();
    const now = Date.now();
    return this.floating() ? this.renderDrawer(t, now) : this.renderPanel(t, now);
  }
}
