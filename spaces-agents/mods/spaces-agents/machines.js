import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { hc, machines, run } from "herdr";
import { RAIL_CELL, railCell } from "./util.js";

const REBUILT = /^a different core answers there \("[^"]+"\)$/;

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

async function ask(args) {
  const r = await hc([...args, "--json"]);
  if (r.code === 0) return;
  const parsed = (() => {
    try { return JSON.parse(r.stdout || r.stderr).error?.message; } catch { return null; }
  })();
  throw new Error(parsed || r.stderr || r.stdout || "Couldn't connect.");
}

function addArgs(machine, name) {
  return [
    "machine", "add",
    ...(machine.via ? ["--via", machine.target] : [machine.target]),
    "--name", name,
    ...(machine.session ? ["--session", machine.session] : []),
    ...(machine.temporary ? ["--temp"] : []),
  ];
}

export class MachineList {
  constructor() {
    this.list = [];
    this.error = null;
    const stored = readJson("machines.reconnecting", {});
    this.reconnecting = Object.fromEntries(Object.entries(stored).map(([k, v]) => [k, { ...v, busy: false }]));
    this.folded = new Set(readJson("machines.folded", []));
  }

  save() {
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      const before = JSON.stringify([this.list, this.error]);
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code !== 0) throw new Error(r.stderr.trim() || `hc machine ls exited ${r.code}`);
        this.list = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary);
        this.error = null;
      } catch (e) {
        this.error = String(e.message ?? e);
      }
      if (JSON.stringify([this.list, this.error]) !== before) cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && REBUILT.test(machine.why ?? "");
  }

  toggle(name) {
    this.folded = this.folded.has(name) ? new Set([...this.folded].filter((m) => m !== name)) : new Set([...this.folded, name]);
    this.save();
  }

  setState(name, state) {
    this.reconnecting = state ? { ...this.reconnecting, [name]: state } : Object.fromEntries(Object.entries(this.reconnecting).filter(([k]) => k !== name));
    this.save();
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    this.setState(name, { machine, removed: false, ...this.reconnecting[name], busy: true, error: null });
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        if (!this.reconnecting[name].removed) {
          await ask(["machine", "rm", name]);
          this.setState(name, { ...this.reconnecting[name], removed: true });
        }
        await ask(addArgs(machine, name));
        this.folded = new Set([...this.folded].filter((m) => m !== name));
        this.setState(name, null);
      } catch (e) {
        this.setState(name, { ...this.reconnecting[name], error: String(e.message ?? e), busy: false });
      }
      this.refresh(cx);
    });
  }

  remote(rows) {
    return [...new Set([...rows.map((r) => r.w.machine).filter(Boolean), ...this.list.map((m) => m.name), ...Object.keys(this.reconnecting)])].sort();
  }

  loading(m, sp, shown) {
    const state = machines().find((k) => k.name === m)?.layout;
    return state === "loading" || (!state && this.list.some((k) => k.name === m && k.state === "connected"))
      || sp.some((s) => (s.machine ?? null) === m && !shown.has(s.id));
  }

  view(m) {
    const repair = this.reconnecting[m];
    const machine = this.list.find((k) => k.name === m) ?? repair?.machine;
    const connected = !m || machine?.state === "connected";
    return { repair, machine, connected, rebuilt: this.rebuilt(machine) || !!repair, folded: this.folded.has(m) };
  }

  connectButton(m, v, t) {
    return h_flex().flex_none().gap(3).items_center()
      .child(div().max_w(140).truncate().child(v.repair?.error || "rebuilt ·"))
      .child(div().id(`machine-connect-${m}`).text_color(v.repair?.error ? t.blocked : t.muted)
        .hover((s) => s.text_color(t.foreground))
        .tooltip(v.repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
        .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(v.machine, cx); })
        .child(v.repair?.busy ? "Connecting…" : "Connect"));
  }

  header(m, v, t, collapsed) {
    const icon = svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none();
    const badge = div().absolute().right(-3).bottom(-2).size(6).rounded(3).border_1().border_color(t.chrome).bg(v.connected ? t.ansi2 : t.dim);
    return h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
      .when(collapsed, (el) => el.mt(4).w(RAIL_CELL).justify_center().rounded(6).tooltip(m ? `${m} · ${v.connected ? "connected" : (v.machine?.state ?? "asleep").replace(/_/g, " ")}` : "This computer"))
      .cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { this.toggle(m); cx.notify(); })
      .when(!collapsed, (el) => el.child(icon))
      .when(collapsed, (el) => el.child(div().relative().flex_none().child(icon).when(Boolean(m), (el) => el.child(badge))))
      .when(!collapsed, (el) => el.child(div().flex_1().truncate().child(m ?? "This computer"))
        .when(!v.connected && !v.rebuilt, (el) => el.child(div().flex_none().child((v.machine?.state ?? "asleep").replace(/_/g, " "))))
        .when(v.rebuilt, (el) => el.child(this.connectButton(m, v, t)))
        .when(v.connected, (el) => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); }).child("+")))
        .child(div().size(6).rounded(3).flex_none().bg(v.connected ? t.ansi2 : t.dim))
        .child(svg(`mods/workspace-chrome/chevron-${v.folded ? "right" : "down"}.svg`).size(11).flex_none()));
  }

  empty(m, t, collapsed) {
    return h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).gap(7).items_center().rounded(7)
      .text_size(12).text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click(() => run("space.new", { machine: m ?? "" }))
      .when(collapsed, (el) => el.w(RAIL_CELL).rounded(6).justify_center().tooltip(`New space on ${m ?? "this computer"}`)
        .child(h_flex().size(18).rounded(5).border_1().border_color(t.dim).items_center().justify_center()
          .child(svg("mods/workspace-chrome/plus.svg").size(10))))
      .when(!collapsed, (el) => el.child(svg("mods/workspace-chrome/plus.svg").size(12)).child("New space there"));
  }

  loadingRow(m, t, collapsed) {
    return h_flex().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(collapsed ? 0 : 8).items_center().when(collapsed, (el) => el.justify_center()).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
  }

  grouped({ rows, draw, sp, shown, t, collapsed }) {
    const remote = this.remote(rows);
    if (!remote.length) return this.loading(null, sp, shown) && !rows.length ? [this.loadingRow(null, t, collapsed)] : rows.flatMap(draw);
    return [null, ...remote].flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const v = this.view(m);
      const cell = collapsed ? railCell : (el) => el;
      const head = cell(this.header(m, v, t, collapsed));
      if (!collapsed && v.rebuilt) return [head];
      if (v.folded) return [head];
      if (mine.length) return [head, ...mine.flatMap(draw)];
      return [head, this.loading(m, sp, shown) ? this.loadingRow(m, t, collapsed) : cell(this.empty(m, t, collapsed))];
    });
  }
}
