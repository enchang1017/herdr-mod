import { div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { run } from "herdr";
import { chevron, statusDot } from "./rows.js";
import { duration, isOpen, setOpen, shortName, showShells, urgent } from "./util.js";
import { shipChip } from "./ship-chip.js";

const CHIP = { working: "working", idle: "idle", blocked: "waiting", done: "done" };

function programOf(p, native, claude) {
  const own = native?.program ?? p.program ?? null;
  if (claude && !own?.agent) return { name: "Claude Code", icon: "icons/claude.svg", tint: false, agent: true };
  return own;
}

function agentEntry(p, tab, native, claude, deps) {
  const program = programOf(p, native, claude);
  const title = program?.name ?? "Agent";
  const own = deps.terminalName(p.terminal);
  const name = claude ? claude.name : own || native.title || native.tab_name || "agent";
  const status = native?.status ?? claude?.status ?? null;
  return { kind: "agent", program, pane: p.pane, tab: p.tab, terminal: p.terminal, label: shortName(name, tab.name), tip: `${title} · ${name}`, status, since: claude?.since ?? null, hint: claude?.waitingFor ?? null,
    sessionId: claude?.sessionId ?? null, ctx: deps.usage.context(claude?.sessionId) };
}

export function entriesOf(tab, ps, native, deps) {
  return ps.filter((p) => p.tab === tab.id && p.terminal).map((p) => {
    const n = native.get(p.terminal);
    const c = deps.claude.info(p.terminal);
    if (n || c) return agentEntry(p, tab, n, c, deps);
    const kind = p.program?.shell ? "shell" : "program";
    return { kind, program: p.program ?? null, pane: p.pane, terminal: p.terminal, label: p.program?.name || p.title || p.terminal, status: null, since: null, hint: null, ctx: null };
  });
}

export function visible(entries) {
  return showShells() ? entries : entries.filter((e) => e.kind !== "shell");
}

export function chip(status, t) {
  if (!status) return null;
  const color = t[status] ?? t.unknown;
  return div().flex_none().px(6).h(17).rounded(5).bg(color + "26").text_size(10.5).font_medium().text_color(color)
    .flex().items_center().child(CHIP[status] ?? status);
}

function icon(e, t) {
  const fallback = e.kind === "agent" ? "icons/agent.svg" : e.kind === "shell" ? "icons/shell.svg" : "icons/program.svg";
  const path = e.program?.icon || fallback;
  const tinted = e.program?.icon ? e.program.tint : true;
  return tinted ? svg(path).size(14).flex_none().text_color(e.kind === "agent" ? t.foreground : t.muted) : image(path).w(14).h(14).flex_none();
}

function meta(e, t, now) {
  const tag = chip(e.status, t);
  const hasCtx = typeof e.ctx === "number";
  const ship = shipChip(e.sessionId, t);
  return h_flex().h(18).pl(33).gap(6).items_center()
    .when(Boolean(tag), (el) => el.child(tag))
    .when(hasCtx, (el) => el.child(div().flex_none().text_size(10.5).text_color(e.ctx >= 85 ? t.working : t.dim).child(`ctx ${Math.round(e.ctx)}%`)))
    .when(Boolean(ship), (el) => el.child(ship))
    .child(div().flex_1())
    .when(Boolean(e.since), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - e.since))));
}

function terminalRow(e, last, ctx) {
  const { t, now, focusedPane } = ctx;
  const on = e.pane === focusedPane;
  const agent = e.kind === "agent";
  const line = h_flex().h(22).gap(5).items_center()
    .child(div().flex_none().text_color(t.dim).child(last ? "\u2514" : "\u251c"))
    .child(icon(e, t))
    .child(div().flex_1().min_w(0).truncate().text_color(agent ? t.foreground : t.muted).child(e.label));
  const row = v_flex().id(`term-${e.pane}`).h(agent ? 42 : 24).flex_none().pl(26).pr(6).justify_center().rounded(7).text_size(12.5)
    .when(on, (el) => el.bg(t.selected))
    .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
    .cursor_pointer()
    .on_click(() => run("pane.focus", { pane: e.pane }))
    .when(Boolean(e.sessionId), (el) => el.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); ctx.onAgentMenu(e); }))
    .tooltip(e.hint ? `${e.tip ?? e.label} \u2014 ${e.hint}` : e.tip ?? e.label)
    .child(line)
    .when(agent, (el) => el.child(meta(e, t, now)));
  return [row];
}

function tabSummary(entries, t) {
  const agents = entries.filter((e) => e.kind === "agent");
  const top = urgent(agents.map((e) => e.status));
  return h_flex().flex_none().gap(5).items_center()
    .when(agents.length > 0, (el) => el.child(div().text_size(11).text_color(t.dim).child(String(agents.length))))
    .when(Boolean(top), (el) => el.child(statusDot(top, t)));
}

function tabRow(space, tab, shown, open, t) {
  const label = /^\d+$/.test(tab.name) ? `Tab ${tab.name}` : tab.name;
  return h_flex().id(`tab-${tab.id}`).h(24).flex_none().pl(22).pr(8).gap(4).items_center().rounded(7).text_size(12)
    .hover((s) => s.bg(t.hover))
    .cursor_pointer()
    .on_click(() => {
      if (!space.active) run("space.select", { id: space.id });
      run("tab.select", { id: tab.id });
    })
    .child(shown.length ? chevron(`tab-fold-${tab.id}`, open, t, () => setOpen(tab.id, !open)) : div().w(17).flex_none())
    .child(div().flex_1().min_w(0).truncate().text_color(space.active && tab.active ? t.foreground : t.muted).child(label))
    .when(!open, (el) => el.child(tabSummary(shown, t)));
}

export function tabTree(space, tabs, ctx) {
  return tabs.flatMap(({ tab, entries }) => {
    const shown = visible(entries);
    const open = isOpen(tab.id, entries.some((e) => e.kind === "agent"));
    const head = tabRow(space, tab, shown, open, ctx.t);
    if (!open) return [head];
    return [head, ...shown.flatMap((e, n) => terminalRow(e, n === shown.length - 1, ctx))];
  });
}
