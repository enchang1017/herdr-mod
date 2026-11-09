import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, window } from "herdr";

const SAMPLE_MS = 5000;
const CHILD_EVERY = 3;
const CPU_WARN = 30;
const CPU_BAD = 60;
const MEM_WARN_MB = 600;
const MEM_BAD_MB = 1024;
const MAX_LISTED = 12;
const SELF = new Set(["ps", "sh"]);

const message = (e) => String(e?.message ?? e);
const commandName = (comm) => comm.trim().split("/").pop();

const PARENT_PID = "echo $PPID";

async function findPid() {
  const r = await exec("/bin/sh", ["-c", PARENT_PID]);
  const pid = Number.parseInt(r.stdout.trim(), 10);
  if (r.code !== 0 || !Number.isInteger(pid) || pid <= 1) throw new Error(`could not read Herdr's pid (sh exited ${r.code}: ${(r.stderr || r.stdout).trim() || "no output"})`);
  return pid;
}

function parseOwn(stdout) {
  const [cpu, rss] = stdout.trim().split(/\s+/).map(Number);
  if (!Number.isFinite(cpu) || !Number.isFinite(rss)) throw new Error("ps gave no sample");
  return { cpu, mb: rss / 1024 };
}

function parseAll(stdout, pid) {
  const rows = stdout.split("\n").map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/)).filter(Boolean);
  const own = rows.find((m) => Number(m[1]) === pid);
  if (!own) throw new Error(`Herdr pid ${pid} is gone`);
  if (!/Herdr$/.test(own[5].trim())) throw new Error(`pid ${pid} is ${commandName(own[5])}, not Herdr`);
  const children = rows.filter((m) => Number(m[2]) === pid).map((m) => commandName(m[5])).filter((name) => !SELF.has(name));
  return { cpu: Number(own[3]), mb: Number(own[4]) / 1024, children };
}

async function sample(pid, withChildren) {
  if (!withChildren) {
    const r = await exec("/bin/ps", ["-o", "pcpu=,rss=", "-p", String(pid)]);
    if (r.code !== 0) throw new Error(`ps exited ${r.code}: ${(r.stderr || "").trim() || "no output"}`);
    return parseOwn(r.stdout);
  }
  const r = await exec("/bin/ps", ["-Ao", "pid=,ppid=,pcpu=,rss=,comm="]);
  if (r.code !== 0) throw new Error(`ps exited ${r.code}: ${(r.stderr || "").trim() || "no output"}`);
  return parseAll(r.stdout, pid);
}

export class HerdrMonitor {
  constructor() {
    this.pid = null;
    this.shown = null;
    this.children = null;
    this.error = null;
    this.count = 0;
    this.busy = false;
  }

  start(cx) {
    this.tick(cx);
    cx.timer.every(SAMPLE_MS, (cx) => this.tick(cx));
  }

  tick(cx) {
    if (this.busy || window()?.active === false) return;
    this.busy = true;
    const withChildren = this.count % CHILD_EVERY === 0;
    this.count += 1;
    cx.spawn(async (cx) => {
      const before = this.key();
      try {
        this.pid = this.pid ?? (await findPid());
        const s = await sample(this.pid, withChildren);
        this.shown = { cpu: Math.round(s.cpu), mb: Math.round(s.mb) };
        this.children = s.children ?? this.children;
        this.error = null;
      } catch (e) {
        this.pid = null;
        this.error = `Herdr monitor: ${message(e)}`;
      } finally {
        this.busy = false;
      }
      if (this.key() !== before) cx.notify();
    });
  }

  key() {
    return JSON.stringify([this.shown, this.children, this.error]);
  }
}

function tone(value, warn, bad, t) {
  if (value >= bad) return t.blocked;
  if (value >= warn) return t.working;
  return t.foreground;
}

function procs(children, t) {
  const listed = children.slice(0, MAX_LISTED).map((name) => (name.length > 40 ? `${name.slice(0, 39)}…` : name));
  const more = children.length > MAX_LISTED ? [`+${children.length - MAX_LISTED} more`] : [];
  const tip = children.length ? [...listed, ...more].join("\n") : "No child processes";
  return div().id("sa-herdr-procs").flex_none().text_color(t.dim).tooltip(tip).child(`· ${children.length} procs`);
}

export function monitorLine(monitor, t) {
  const s = monitor.shown;
  const memText = s && s.mb >= 1024 ? `${(s.mb / 1024).toFixed(1)} GB` : `${s?.mb ?? "--"} MB`;
  return h_flex().id("sa-herdr").h(18).gap(8).items_center().text_size(11).pt(4)
    .when(Boolean(monitor.error), (el) => el.tooltip(monitor.error))
    .child(div().w(34).flex_none().text_color(t.muted).child("Herdr"))
    .child(div().flex_none().text_color(s ? tone(s.cpu, CPU_WARN, CPU_BAD, t) : t.dim).child(`CPU ${s ? `${s.cpu}%` : "--"}`))
    .child(div().flex_none().text_color(s ? tone(s.mb, MEM_WARN_MB, MEM_BAD_MB, t) : t.dim).child(`MEM ${memText}`))
    .when(Boolean(monitor.children), (el) => el.child(procs(monitor.children, t)));
}
