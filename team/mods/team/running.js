import { div } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState } from "gpui-base";
import { settings, openOverlay } from "herdr";
import { liveTeam, focusAgent } from "./agents.js";
import { sessionStatus, readScreen, killTerminal, baseName } from "./data.js";
import { button, chip, card, cardHeader, icon, ICONS } from "./kit.js";
import { readMrResult, resultRow } from "./mr.js";

const POLL_MS = 3000;
const TONES = { working: "working", waiting: "blocked", blocked: "blocked", idle: "idle", done: "done" };
const WAITING = new Set(["waiting", "blocked"]);
const IDE_WINDOW = Object.freeze({ mod: "open-ide", kind: "window", frame: "none", width: 2, height: 2, at: { x: 0, y: 0 } });

function openIde(one) {
  const folder = one.labels?.["team.repo"] ?? one.cwd ?? "";
  const machine = one.address.includes("/") ? one.address.split("/")[0] : null;
  openOverlay({ ...IDE_WINDOW, props: { folder, machine } });
}

export function age(ms) {
  if (!ms) return "";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
}

export class Running {
  constructor() {
    this.statuses = {}; this.results = {}; this.lastPoll = 0; this.reading = null; this.code = null;
    this.confirmKill = null; this.busy = new Set(); this.error = null;
  }

  list() {
    return liveTeam();
  }

  counts() {
    const live = this.list();
    const waiting = live.filter((one) => WAITING.has(this.statuses[one.address] ?? one.status)).length;
    return { live: live.length, waiting };
  }

  tick(cx) {
    if (Date.now() - this.lastPoll < POLL_MS) return;
    this.lastPoll = Date.now();
    const live = this.list();
    cx.spawn(async (cx) => {
      const found = await Promise.all(live.map((one) => sessionStatus(one.address).catch(() => null)));
      this.statuses = Object.fromEntries(live.map((one, i) => [one.address, found[i] ?? one.status ?? null]));
      this.results = await this.mrResults(live);
      cx.notify();
    });
  }

  async mrResults(live) {
    const reviews = live.filter((one) => one.labels?.team === "mr-review" && !one.address.includes("/"));
    const found = await Promise.all(reviews.map((one) => readMrResult(one.address)));
    return Object.fromEntries(reviews.map((one, i) => [one.address, found[i]]).filter(([, result]) => result));
  }

  read(one, cx) {
    this.code?.release();
    this.code = null;
    this.reading = { address: one.address, name: one.name ?? one.address, text: "", loading: true, error: null };
    cx.spawn(async (cx) => {
      try {
        const text = await readScreen(one.address);
        if (this.reading?.address !== one.address) return;
        this.code = EditorState.new({ language: "text", value: text || "(empty)", readonly: true, font_family: settings().font_family, font_size: 12, soft_wrap: true });
        this.reading = { ...this.reading, text, loading: false };
      } catch (e) {
        if (this.reading?.address === one.address) this.reading = { ...this.reading, loading: false, error: `Could not read ${one.address}: ${e.message ?? e}` };
      }
      cx.notify();
    });
    cx.notify();
  }

  closeRead(cx) {
    this.code?.release();
    this.code = null; this.reading = null;
    cx.notify();
  }

  kill(one, cx) {
    if (!one.labels?.team) return;
    this.confirmKill = null;
    this.busy = new Set([...this.busy, one.address]);
    cx.spawn(async (cx) => {
      try {
        await killTerminal(one.address, cx);
        if (this.reading?.address === one.address) this.closeRead(cx);
        this.error = null;
      } catch (e) {
        this.error = `Could not kill ${one.name ?? one.address}: ${e.message ?? e}`;
      } finally {
        this.busy = new Set([...this.busy].filter((a) => a !== one.address));
        cx.notify();
      }
    });
    cx.notify();
  }

  actions(one, t) {
    const a = one.address;
    if (this.confirmKill === a) {
      return [
        div().text_size(10.5).text_color(t.blocked).child("Kill and remove?"),
        button(`kill-yes-${a}`, "Kill", t, (_e, cx) => this.kill(one, cx), { small: true, primary: true }),
        button(`kill-no-${a}`, "Cancel", t, (_e, cx) => { this.confirmKill = null; cx.notify(); }, { small: true }),
      ];
    }
    return [
      button(`focus-${a}`, "Focus", t, () => focusAgent(a), { small: true }),
      button(`ide-${a}`, "IDE", t, () => openIde(one), { small: true, tooltip: "Open in IDE (Rider for .NET, else VS Code)", disabled: !(one.labels?.["team.repo"] ?? one.cwd) }),
      button(`read-${a}`, "Read", t, (_e, cx) => this.read(one, cx), { small: true, active: this.reading?.address === a }),
      button(`kill-${a}`, this.busy.has(a) ? "Killing…" : "Kill", t, (_e, cx) => { this.confirmKill = a; cx.notify(); }, { small: true, disabled: this.busy.has(a) }),
    ];
  }

  row(one, t) {
    const status = this.statuses[one.address] ?? one.status ?? (one.address.includes("/") ? "unknown" : "starting");
    const tone = t[TONES[status] ?? "unknown"] ?? t.dim;
    const template = one.template ?? one.labels?.["team.template"] ?? one.labels?.team;
    const repo = one.labels?.["team.repo"] ?? one.cwd ?? "";
    return v_flex().id(`agent-${one.address}`).px(10).py(5).gap(3).border_b(1).border_color(t.border)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_shrink(1).min_w(0).truncate().font_bold().text_size(12.5).child(one.name ?? one.address))
        .child(chip(t, template ?? "agent", t.accent, "outline"))
        .child(chip(t, status, tone))
        .child(div().flex_1())
        .child(div().flex_none().text_size(10.5).text_color(t.dim).child(`${one.address} \u{b7} ${age(one.created_ms)}`)))
      .child(h_flex().gap(6).items_center()
        .child(h_flex().flex_1().min_w(0).gap(4).items_center().text_size(10.5).text_color(t.dim)
          .child(icon(ICONS.repo, 12, t.dim)).child(div().flex_1().min_w(0).truncate().child(`${baseName(repo)}  ${repo}`)))
        .children(this.actions(one, t)))
      .when(Boolean(this.results[one.address]), (e) => e.child(resultRow(one.address, this.results[one.address] ?? {}, t, (msg) => { this.error = msg; })));
  }

  readPane(t) {
    const r = this.reading;
    return card(t, "read").flex_1().min_h(160)
      .child(cardHeader(t, { icon: ICONS.agent, title: `Screen of ${r.name}`, meta: "hc read --lines 80", actions: [
        button("read-copy", "Copy", t, (_e, cx) => cx.write_to_clipboard(r.text), { small: true, disabled: !r.text }),
        button("read-refresh", "Refresh", t, (_e, cx) => this.read({ address: r.address, name: r.name }, cx), { small: true }),
        button("read-close", "Close", t, (_e, cx) => this.closeRead(cx), { small: true, ghost: true }),
      ] }))
      .when(r.loading, (e) => e.child(div().p(10).text_color(t.dim).child("Reading…")))
      .when(Boolean(r.error), (e) => e.child(div().p(10).text_color(t.ansi1).child(r.error)))
      .when(Boolean(this.code), (e) => e.child(Editor.new(this.code).flex_1().min_h(120)));
  }

  render(t) {
    const live = this.list();
    return v_flex().gap(6).flex_1().min_h(0)
      .child(card(t, "running")
        .when(Boolean(this.error), (e) => e.child(div().px(10).py(6).text_size(11).text_color(t.ansi1).child(this.error)))
        .when(!live.length, (e) => e.child(div().px(10).py(8).text_size(11).text_color(t.dim).child("No team agents running (terminals labelled team=*).")))
        .children(live.map((one) => this.row(one, t))))
      .when(Boolean(this.reading), (e) => e.child(this.readPane(t)));
  }
}

