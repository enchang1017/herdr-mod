import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { notify } from "herdr";
import { chevron } from "./rows.js";
import { revive } from "./revive.js";
import { groupKey, groupsOf, reviveGroup } from "./team.js";
import { base, duration, isOpen, setOpen } from "./util.js";

const FOLD = "spaces-agents.lost";
const ALL = "all";
const CONFIRM_MS = 10000;

const message = (e) => String(e?.message ?? e);
const plural = (n) => `${n} agent${n === 1 ? "" : "s"}`;

function action(id, label, t, onClick, disabled, tip) {
  return div().id(id).flex_none().h(20).px(6).flex().items_center().rounded(5).text_size(11)
    .border_1().border_color(t.border).text_color(t.muted)
    .when(Boolean(tip), (el) => el.tooltip(tip))
    .when(disabled, (el) => el.opacity(0.45))
    .when(!disabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => onClick(cx)))
    .child(label);
}

function tabLabel(group) {
  const tab = group.tab?.label ? (/^\d+$/.test(group.tab.label) ? `Tab ${group.tab.label}` : group.tab.label) : null;
  return [group.space?.name, tab].filter(Boolean).join(" · ") || "No recorded tab";
}

export class LostAgents {
  constructor(registry, machines, handle) {
    this.registry = registry;
    this.machines = machines;
    this.handle = handle;
    this.busy = {};
    this.notes = {};
    this.groupNotes = {};
    this.revived = {};
    this.running = null;
    this.confirm = null;
  }

  online(entry) {
    if (!entry.machine) return true;
    return this.machines.list.some((m) => m.name === entry.machine && m.state === "connected");
  }

  shown(lost) {
    return lost.filter((e) => !(this.revived[e.sessionId] > e.lastSeen));
  }

  markRevived(entry, address) {
    this.revived = { ...this.revived, [entry.sessionId]: Date.now() };
    this.notes = { ...this.notes, [entry.sessionId]: { text: `Revived in ${address}`, error: false } };
  }

  act(entry, fork, cx) {
    const id = entry.sessionId;
    if (this.busy[id] || this.running) return;
    this.busy = { ...this.busy, [id]: fork ? "Forking…" : "Reviving…" };
    this.notes = { ...this.notes, [id]: null };
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const address = await revive(entry, fork, cx);
        this.notes = { ...this.notes, [id]: { text: `${fork ? "Forked" : "Revived"} in ${address}`, error: false } };
      } catch (e) {
        this.notes = { ...this.notes, [id]: { text: `${fork ? "Fork" : "Revive"} failed: ${message(e)}`, error: true } };
      }
      this.busy = { ...this.busy, [id]: null };
      cx.notify();
    });
  }

  ask(scope, count, cx) {
    this.confirm?.timer?.cancel();
    const timer = cx.timer.after(CONFIRM_MS, (cx) => this.cancel(cx));
    this.confirm = { scope, count, timer };
    this.handle.focus();
    cx.notify();
  }

  cancel(cx) {
    this.confirm?.timer?.cancel();
    this.confirm = null;
    cx.notify();
  }

  start(groups, cx, toast = false) {
    this.cancel(cx);
    if (this.running || !groups.length) return;
    this.running = groups[0].key;
    this.groupNotes = { ...this.groupNotes, ...Object.fromEntries(groups.map((g) => [g.key, null])) };
    cx.spawn(async (cx) => {
      for (const group of groups) {
        this.running = group.key;
        cx.notify();
        await this.runGroup(group, cx, toast);
      }
      this.running = null;
      cx.notify();
    });
  }

  async runGroup(group, cx, toast) {
    try {
      await reviveGroup(group, (entry, address) => { this.markRevived(entry, address); cx.notify(); }, cx);
    } catch (e) {
      this.groupNotes = { ...this.groupNotes, [group.key]: { text: `${tabLabel(group)}: stopped: ${message(e)}`, error: true } };
      if (toast) notify({ title: `Reopen failed: ${tabLabel(group)}`, body: message(e), level: "error", timeout: 15000 });
    }
  }

  reopen(lost, cx) {
    const visible = this.shown(lost);
    const say = (body, level) => notify({ title: "Reopen tab", body, level, timeout: 8000 });
    if (!visible.length) return say("No closed Claude tab to reopen. Only Claude sessions are tracked; plain terminals can't be reopened.", "info");
    if (this.running) return say("A revive is already running.", "warning");
    const group = groupsOf(visible).find((g) => g.key === groupKey(visible[0]));
    if (!this.online(group.entries[0])) return say(`${tabLabel(group)}: ${group.machine} is offline.`, "error");
    notify({ title: `Reopening ${tabLabel(group)} (${plural(group.entries.length)})`, body: "Claude sessions only; plain terminals are not restored.", level: "info", timeout: 6000 });
    this.start([group], cx, true);
  }

  confirmBar(scope, groups, t) {
    if (this.confirm?.scope !== scope) return [];
    const bar = v_flex().id(`lost-confirm-${scope}`).flex_none().pl(14).pr(4).py(5).gap(4).rounded(6).bg(t.hover)
      .track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.keystroke === "escape") { this.cancel(cx); cx.stop_propagation(); } })
      .child(div().text_size(11.5).text_color(t.foreground).child(`Revive ${plural(this.confirm.count)}?`))
      .child(h_flex().gap(5).items_center()
        .child(action(`lost-yes-${scope}`, "Confirm", t, (cx) => this.start(groups, cx), false, "Each one resumes a full Claude session"))
        .child(action(`lost-no-${scope}`, "Cancel", t, (cx) => this.cancel(cx), false, "Esc also cancels")));
    return [bar];
  }

  buttons(entry, t) {
    const id = entry.sessionId;
    const up = this.online(entry);
    const busy = Boolean(this.busy[id]) || Boolean(this.running);
    const tip = up ? null : `${entry.machine} is offline`;
    return h_flex().gap(5).items_center()
      .child(action(`lost-revive-${id}`, this.busy[id] ?? "Revive", t, (cx) => this.act(entry, false, cx), !up || busy, tip ?? `claude --resume ${id}`))
      .child(action(`lost-fork-${id}`, "Fork", t, (cx) => this.act(entry, true, cx), !up || busy, tip ?? "Resume into a new session id (--fork-session)"))
      .child(div().flex_1())
      .child(action(`lost-dismiss-${id}`, "Dismiss", t, (cx) => this.registry.dismiss(id, cx), busy, "Forget this entry"));
  }

  row(entry, role, t, now) {
    const note = this.notes[entry.sessionId];
    const tag = role === "lead" ? "lead" : role === "mate" ? "teammate" : null;
    const machine = entry.machine ? `${entry.machine}${this.online(entry) ? "" : " (offline)"}` : null;
    return v_flex().id(`lost-${entry.sessionId}`).flex_none().pl(role === "mate" ? 30 : 14).pr(4).py(4).gap(3).rounded(7).text_size(12.5)
      .hover((s) => s.bg(t.hover))
      .child(h_flex().h(20).gap(6).items_center()
        .child(image("icons/claude.svg").w(14).h(14).flex_none())
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(entry.terminalName ?? entry.name ?? base(entry.cwd)))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - entry.lastSeen))))
      .child(div().pl(20).truncate().text_size(11).text_color(t.dim).child([tag, machine, base(entry.cwd)].filter(Boolean).join(" · ")))
      .child(div().pl(20).child(this.buttons(entry, t)))
      .when(Boolean(note), (el) => el.child(div().pl(20).text_size(11).text_color(note.error ? t.blocked : t.dim).child(note.text)));
  }

  unitRows(unit, t, now) {
    if (!unit.mates.length) return [this.row(unit.lead, "solo", t, now)];
    return [this.row(unit.lead, "lead", t, now), ...unit.mates.map((m) => this.row(m, "mate", t, now))];
  }

  groupHead(group, t) {
    const up = this.online(group.entries[0]);
    const label = this.running === group.key ? "Reviving…" : "Revive tab";
    const tip = up ? `Revive this tab's ${plural(group.entries.length)} and restore its layout` : `${group.machine} is offline`;
    return h_flex().id(`lost-group-${group.key}`).h(24).flex_none().pl(8).pr(4).mt(4).gap(6).items_center().text_size(11.5).text_color(t.muted)
      .child(div().flex_1().min_w(0).truncate().child(tabLabel(group)))
      .when(!up, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(`${group.machine} offline`)))
      .child(action(`lost-tab-${group.key}`, label, t, (cx) => this.ask(group.key, group.entries.length, cx), !up || Boolean(this.running), tip));
  }

  groupRows(group, t, now) {
    const note = this.groupNotes[group.key];
    const error = note ? [this.noteRow(group.key, note, t)] : [];
    return [this.groupHead(group, t), ...this.confirmBar(group.key, [group], t), ...error, ...group.units.flatMap((u) => this.unitRows(u, t, now))];
  }

  noteRow(key, note, t) {
    return div().id(`lost-note-${key}`).flex_none().pl(14).pr(4).py(2).text_size(11).text_color(note.error ? t.blocked : t.dim)
      .cursor_pointer().tooltip("Click to clear").on_click((_e, cx) => this.clearNote(key, cx)).child(note.text);
  }

  clearNote(key, cx) {
    this.groupNotes = Object.fromEntries(Object.entries(this.groupNotes).filter(([k]) => k !== key));
    cx.notify();
  }

  head(ready, count, open, t) {
    const total = ready.reduce((n, g) => n + g.entries.length, 0);
    const skipped = count - total;
    const tip = skipped ? `Revives ${plural(total)}; ${skipped} on offline machines are skipped` : "Revive every lost agent and restore team layouts";
    return h_flex().id("lost-head").h(26).flex_none().px(8).mt(6).gap(7).items_center().text_size(11).text_color(t.dim)
      .child(div().id("lost-fold-label").flex_1().cursor_pointer().on_click(() => setOpen(FOLD, !open)).child(`Lost agents · ${count}`))
      .child(action("lost-all", this.running ? "Reviving…" : "Revive all", t, (cx) => this.ask(ALL, total, cx), !total || Boolean(this.running), tip))
      .child(chevron("lost-fold", open, t, () => setOpen(FOLD, !open)));
  }

  section(lost, t, now) {
    const visible = this.shown(lost);
    const groups = groupsOf(visible);
    const keys = new Set(groups.map((g) => g.key));
    const stray = Object.entries(this.groupNotes).filter(([k, n]) => n && !keys.has(k)).map(([k, n]) => this.noteRow(k, n, t));
    if (!visible.length) return stray;
    const open = isOpen(FOLD, false);
    const ready = groups.filter((g) => this.online(g.entries[0]));
    const top = [this.head(ready, visible.length, open, t), ...this.confirmBar(ALL, ready, t)];
    return open ? [...top, ...stray, ...groups.flatMap((g) => this.groupRows(g, t, now))] : [...top, ...stray];
  }
}
