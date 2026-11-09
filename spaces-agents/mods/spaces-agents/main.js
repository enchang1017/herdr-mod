import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, focused, nextCommand, notify, openOverlay, panes, playSound, props, run, setAgentOrder, setShared, spaces, terminals, theme, window } from "herdr";
import { GitTracker } from "./git.js";
import { MachineList } from "./machines.js";
import { ClaudeSessions } from "./claude.js";
import { UsageTracker, quotaBlock } from "./usage.js";
import { Inbox } from "./inbox.js";
import { Accordion, accordionOn } from "./accordion.js";
import { compactRow, spaceRow } from "./rows.js";
import { entriesOf, tabTree } from "./tree.js";
import { Registry, liveRecord } from "./registry.js";
import { LostAgents } from "./lost-view.js";
import { HealthCheck } from "./health.js";
import { HerdrMonitor, monitorLine } from "./monitor.js";
import { AgentMenu, isAgentMenu, openAgentMenu } from "./agent-menu.js";
import { KEY, assignColors, roleName, isOpen, narrow, setOpen, showShells, soundsOn, urgent, where } from "./util.js";

const TICK = 3000;
const AWAY_TICKS = 5;
const SETTLE_MS = 2000;

const awake = () => window()?.active !== false;

export default class SpacesAgents extends View {
  init(_props, cx) {
    if (isAgentMenu(props())) {
      this.agentMenu = new AgentMenu(props(), cx);
      return;
    }
    this.git = new GitTracker();
    this.machines = new MachineList();
    this.claude = new ClaudeSessions();
    this.usage = new UsageTracker();
    this.inbox = new Inbox();
    this.accordion = new Accordion();
    this.registry = new Registry();
    this.lost = new LostAgents(this.registry, this.machines, cx.focus_handle());
    this.registry.load(cx);
    this.health = new HealthCheck();
    this.health.start(cx);
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.drag = { pressed: null, over: null };
    this.ticks = 0;
    this.machines.refresh(cx);
    this.claude.refresh(panes(), true, cx);
    this.claude.watch(cx);
    this.usage.refresh(this.claude.sessionIds(), cx);
    this.usage.watch(() => this.claude.sessionIds(), cx);
    this.inbox.start(cx);
    this.monitor = new HerdrMonitor();
    this.monitor.start(cx);
    this.listen(cx);
    this.dirty = true;
    this.checkedAt = 0;
    cx.timer.every(30000, (cx) => { if (awake()) this.usage.refresh(this.claude.sessionIds(), cx); });
    cx.timer.every(15000, (cx) => { if (awake()) this.machines.refresh(cx); });
    cx.timer.every(250, (cx) => this.checkNew(cx));
    cx.timer.every(TICK, (cx) => this.tick(cx));
    cx.timer.every(30000, (cx) => { if (this.hasAgents && awake()) cx.notify(); });
  }

  listen(cx) {
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "accordion" || command === "spaces-agents.accordion") this.accordion.toggle(cx);
        else if (command === "reopen-tab" || command === "spaces-agents.reopen-tab") this.reopenTab(cx);
        cx.notify();
      }
    });
  }

  reopenTab(cx) {
    this.lost.reopen(this.registry.lost(new Set(this.claude.sessionIds())), cx);
  }

  tick(cx) {
    this.ticks += 1;
    if (!awake() && this.ticks % AWAY_TICKS !== 0) {
      this.announce();
      return;
    }
    this.claude.refresh(panes(), true, cx);
    const ids = this.claude.sessionIds();
    if (ids.join() !== this.usageIds) {
      this.usageIds = ids.join();
      this.usage.refresh(ids, cx);
    }
    this.announce();
    this.track(cx);
  }

  liveClaude() {
    return panes().filter((p) => p.terminal && !p.terminal.includes("/"))
      .map((p) => ({ p, info: this.claude.info(p.terminal) }))
      .filter(({ info }) => info?.sessionId);
  }

  track(cx) {
    const live = this.liveClaude();
    const now = Date.now();
    this.registry.record(live.map(({ p, info }) => liveRecord(p, info, now)), cx);
    if (awake()) this.registry.tick(cx);
  }

  checkNew(cx) {
    const now = Date.now();
    if (!this.dirty && now - this.checkedAt < SETTLE_MS) return;
    this.dirty = false;
    this.checkedAt = now;
    const sp = spaces();
    this.born = Object.fromEntries(sp.filter((s) => !this.shown.has(s.id)).map((s) => [s.id, this.born[s.id] ?? now]));
    const due = this.git.due(now, sp, panes(), this.machines.folded);
    if (due.size) this.git.refresh(due, cx);
    const waiting = sp.some((s) => !this.shown.has(s.id));
    this.dirty = waiting;
    if (waiting) cx.notify();
  }

  announce() {
    const done = this.claude.takeTransitions();
    if (!done.length) return;
    const native = new Set(agents().map((a) => a.address));
    const tabNow = focused()?.tab;
    const ps = panes();
    const away = done.filter((address) => !native.has(address)).map((address) => ps.find((p) => p.terminal === address))
      .filter((p) => p && (p.tab !== tabNow || !window().active));
    if (!away.length) return;
    if (soundsOn()) playSound("done");
    away.forEach((p) => notify({
      title: `Claude · ${this.claude.info(p.terminal)?.name ?? p.terminal}`,
      body: "Finished its turn",
      level: "success",
      timeout: 5000,
      action: { name: "pane.focus", args: { pane: p.pane } },
    }));
  }

  menu(w) {
    openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });
  }

  ordered(sp, ps) {
    const ready = (w) => this.shown.has(w.id) || this.git.known(where(w, ps)) || Date.now() - (this.born[w.id] ?? Date.now()) > 1500;
    this.shown = new Set(sp.filter(ready).map((w) => w.id));
    const list = sp.map((w, i) => ({ w, i, g: this.git.info(where(w, ps)) })).filter((r) => this.shown.has(r.w.id));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const firsts = list.filter((r) => r.g && !r.g.linked).filter((r, n, all) => all.findIndex((o) => o.g.repo === r.g.repo) === n);
    const heads = new Set(firsts.map((r) => r.w.id));
    return list.filter((r) => !nested(r)).flatMap((r) => {
      if (!heads.has(r.w.id)) return [{ ...r, tree: null }];
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      return [{ ...r, tree: null }, ...kids.map((k, n) => ({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }))];
    });
  }

  withTabs(rows, ps) {
    const native = new Map(agents().map((a) => [a.address, a]));
    return rows.map((r) => {
      const tabs = (r.w.tabs ?? []).map((tab) => ({ tab, entries: entriesOf(tab, ps, native, this.deps()) }));
      const summary = urgent(tabs.flatMap(({ entries }) => entries.filter((e) => e.kind === "agent").map((e) => e.status)));
      return { ...r, tabs, summary, open: isOpen(r.w.id, true), toggle: () => setOpen(r.w.id, !isOpen(r.w.id, true)) };
    });
  }

  deps() {
    const ts = terminals();
    return { claude: this.claude, usage: this.usage, terminalName: (address) => roleName(address, ts) };
  }

  draw(collapsed, ctx) {
    return (r) => {
      if (collapsed) return [compactRow(r, ctx.t)];
      const head = spaceRow(r, ctx);
      return r.open ? [head, ...tabTree(r.w, r.tabs, ctx)] : [head];
    };
  }

  header(t, collapsed) {
    const shells = showShells();
    const problem = this.claude.error || this.claude.watchError || this.usage.error || this.machines.error || this.inbox.error || this.accordion.error || this.registry.error || this.health.error;
    return h_flex().h(31).pl(16).pr(10).gap(2).items_center().text_size(11.5).text_color(t.dim)
      .when(collapsed, (el) => el.pl(0).pr(0).justify_center())
      .when(!collapsed, (el) => el.child(div().flex_1().child("Spaces & Agents")))
      .when(!collapsed && Boolean(problem), (el) => el.child(div().id("sa-problem").px(5).text_color(t.blocked).tooltip(String(problem)).child("!")))
      .when(!collapsed, (el) => el.child(div().id("sa-shells").size(26).flex_none().flex().items_center().justify_center().rounded(6)
        .text_color(shells ? t.muted : t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(shells ? "Hide plain shells" : "Show plain shells")
        .on_click(() => setShared(KEY.shells, !shells))
        .child(svg(`mods/workspace-chrome/${shells ? "terminal" : "square"}.svg`).size(14))))
      .when(!collapsed, (el) => el.child(this.accordionButton(t)))
      .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(14)));
  }

  accordionButton(t) {
    const on = accordionOn();
    return div().id("sa-accordion").size(26).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(on ? t.muted : t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(on ? "Teammate accordion: on" : "Teammate accordion: off")
      .on_click((_e, cx) => this.accordion.toggle(cx))
      .child(svg("mods/workspace-chrome/layers.svg").size(14));
  }

  render(cx) {
    if (this.agentMenu) return this.agentMenu.render(cx);
    this.dirty = true;
    const t = theme();
    this.accordion.watch(cx);
    const collapsed = narrow();
    const sp = spaces();
    const ps = panes();
    assignColors(sp);
    const rows = this.withTabs(this.ordered(sp, ps), ps);
    const order = rows.flatMap((r) => r.tabs.flatMap(({ entries }) => entries.filter((e) => e.kind === "agent").map((e) => e.terminal)));
    this.hasAgents = order.length > 0;
    setAgentOrder(order);
    const ctx = { t, drag: this.drag, onMenu: (w) => this.menu(w), now: Date.now(), focusedPane: focused()?.pane, onAgentMenu: openAgentMenu };
    const list = this.machines.grouped({ rows, draw: this.draw(collapsed, ctx), sp, shown: this.shown, t, collapsed });
    const lost = collapsed ? [] : this.lost.section(this.registry.lost(new Set(this.claude.sessionIds())), t, ctx.now);
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(this.header(t, collapsed))
      .child(v_flex().flex_1().min_h(0).px(collapsed ? 0 : 8).pb(14).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.drag.pressed = null; cx.notify(); })
        .children([...list, ...lost]))
      .when(!collapsed, (el) => el.child(quotaBlock(this.usage, t, ctx.now, monitorLine(this.monitor, t))));
  }
}
