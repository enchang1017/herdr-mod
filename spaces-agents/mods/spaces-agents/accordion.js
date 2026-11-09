import { exec, focused, panes, run, setShared, shared, terminals } from "herdr";

const KEY_ON = "spaces-agents.accordion";
const COLLAPSED = 30;
const DEBOUNCE = 150;
const NARROW = 0.3;
const HALF = 0.5;
const REQUEST = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "doc.get", params: { name: "herdr-app" } });

export const accordionOn = () => shared(KEY_ON) !== false;

const message = (e) => String(e?.message ?? e);

export function teamOf(tab, ps, ts) {
  const inTab = ps.filter((p) => p.tab === tab && p.terminal);
  const here = new Set(inTab.map((p) => p.terminal));
  const byAddress = new Map(ts.map((t) => [t.address, t]));
  const isMate = (p) => {
    const t = byAddress.get(p.terminal);
    return Boolean(t?.labels?.team) || Boolean(t?.parent && t.parent !== p.terminal && here.has(t.parent));
  };
  return { mates: inTab.filter(isMate), leads: inTab.filter((p) => !isMate(p)) };
}

function parentOf(node, id) {
  for (const child of node?.children ?? []) {
    if (child.id === id) return node;
    const hit = parentOf(child, id);
    if (hit) return hit;
  }
  return null;
}

function tabRoot(doc, tabId) {
  const tabs = (doc?.spaces ?? []).flatMap((s) => s.tabs ?? []);
  return tabs.find((t) => t.id === tabId)?.root ?? null;
}

export function shapeOf(root, mates) {
  const ids = new Set(mates.map((m) => m.pane));
  const column = parentOf(root, mates[0]?.pane);
  if (column?.type !== "column") return null;
  if (!column.children.every((c) => ids.has(c.id)) || column.children.length !== ids.size) return null;
  const row = parentOf(root, column.id);
  if (row?.type !== "row") return null;
  const others = row.children.filter((c) => c.id !== column.id);
  if (others.length !== 1) return null;
  return { lead: others[0], column, mates: column.children };
}

export function stepsFor(shape, focusPane, mode) {
  const open = mode === "accordion" && shape.mates.some((m) => m.id === focusPane);
  const leadShare = mode === "accordion" && !open ? 1 - NARROW : HALF;
  const rowSteps = [
    { node: shape.lead, size: { weight: leadShare } },
    { node: shape.column, size: { weight: 1 - leadShare } },
  ];
  const mateSteps = shape.mates.map((m) => ({ node: m, size: open && m.id !== focusPane ? { px: COLLAPSED } : { weight: 1 } }));
  return [...rowSteps, ...mateSteps];
}

const same = (a, b) => Boolean(a) && a.px === b.px && (a.weight === undefined || b.weight === undefined
  ? a.weight === b.weight
  : Math.abs(a.weight - b.weight) < 0.001);

async function readRoot(tabId) {
  const r = await exec("sh", ["-c", `printf '%s\\n' '${REQUEST}' | hc connect`]);
  if (r.code !== 0) throw new Error(`hc connect exited ${r.code}: ${r.stderr.trim()}`);
  const reply = JSON.parse(r.stdout.split("\n").find((line) => line.trim()) ?? "{}");
  if (reply.error) throw new Error(`doc.get failed: ${reply.error.message}`);
  return tabRoot(reply.result?.value, tabId);
}

function current() {
  const f = focused();
  if (!f?.pane || !f.tab || f.tab.includes("/")) return null;
  const ps = panes();
  if (ps.some((p) => p.tab === f.tab && p.zoomed)) return null;
  const team = teamOf(f.tab, ps, terminals());
  if (!team.mates.length || !team.leads.length) return null;
  return { tab: f.tab, pane: f.pane, mates: team.mates };
}

export class Accordion {
  constructor() {
    this.error = null;
    this.seen = null;
    this.wait = null;
  }

  watch(cx) {
    const now = accordionOn() ? current() : null;
    const sig = now ? JSON.stringify([now.tab, now.pane, now.mates.map((m) => m.pane)]) : null;
    if (sig === this.seen) return;
    this.seen = sig;
    this.wait?.cancel();
    this.wait = sig ? cx.timer.after(DEBOUNCE, (cx) => this.apply(now, "accordion", sig, cx)) : null;
  }

  toggle(cx) {
    const on = !accordionOn();
    setShared(KEY_ON, on ? null : false);
    this.seen = null;
    const now = current();
    if (!on && now) this.apply(now, "even", null, cx);
  }

  apply(now, mode, sig, cx) {
    cx.spawn(async (cx) => {
      const before = this.error;
      try {
        const root = await readRoot(now.tab);
        if (sig && sig !== this.seen) return;
        const shape = root ? shapeOf(root, now.mates) : null;
        if (shape) this.resize(stepsFor(shape, now.pane, mode));
        this.error = null;
      } catch (e) {
        this.error = `Accordion: ${message(e)}`;
      }
      if (before !== this.error) cx.notify();
    });
  }

  resize(steps) {
    steps.filter((s) => !same(s.node.size, s.size)).forEach((s) => run("layout.resize", { id: s.node.id, ...s.size }));
  }
}
