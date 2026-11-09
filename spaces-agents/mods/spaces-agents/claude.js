import { hc, home, readTextFile, terminals, watchFolder } from "herdr";
import { agentName, roleName } from "./util.js";

const STALE = 60000;
const SESSION_STATUS = { busy: "working", idle: "idle", waiting: "blocked" };

const sessionsDir = () => `${home()}/.claude/sessions`;

function isClaude(fg) {
  const program = fg?.argv?.[0] ?? "";
  return (program.split("/").pop() ?? "").startsWith("claude");
}

function parseForeground(stdout) {
  try {
    return JSON.parse(stdout).foreground ?? null;
  } catch {
    return null;
  }
}

function parseSession(text) {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export function sessionStatus(raw) {
  if (typeof raw !== "string" || !raw) return null;
  return SESSION_STATUS[raw] ?? raw;
}

export class ClaudeSessions {
  constructor() {
    this.fg = {};
    this.texts = {};
    this.sessions = {};
    this.error = null;
    this.watchError = null;
    this.busy = false;
    this.reading = null;
    this.transitions = [];
  }

  signature(p) {
    return `${p.program?.key ?? ""}|${p.cwd ?? ""}`;
  }

  needsQuery(p, now) {
    const known = this.fg[p.terminal];
    return !known || known.sig !== this.signature(p) || now - known.at > STALE;
  }

  async queryOne(p, now) {
    const r = await hc(["get", p.terminal, "--json"]);
    if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `hc get ${p.terminal} exited ${r.code}`);
    const fg = parseForeground(r.stdout);
    return [p.terminal, { sig: this.signature(p), at: now, claude: isClaude(fg), pid: fg?.pid ?? null, cwd: fg?.cwd ?? p.cwd }];
  }

  async queryForeground(ps) {
    const now = Date.now();
    const local = ps.filter((p) => p.terminal && !p.terminal.includes("/"));
    const wanted = local.filter((p) => this.needsQuery(p, now));
    const results = await Promise.allSettled(wanted.map((p) => this.queryOne(p, now)));
    const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const failed = results.filter((r) => r.status === "rejected").map((r) => String(r.reason?.message ?? r.reason));
    const live = new Set(local.map((p) => p.terminal));
    const kept = Object.entries(this.fg).filter(([address]) => live.has(address));
    const before = this.digest();
    this.fg = Object.fromEntries([...kept, ...ok]);
    this.error = failed[0] ?? null;
    return before !== this.digest();
  }

  digest() {
    return JSON.stringify(Object.entries(this.fg).map(([address, f]) => [address, f.claude, f.pid, f.cwd]));
  }

  pids() {
    return [...new Set(Object.values(this.fg).filter((f) => f.claude && f.pid).map((f) => f.pid))];
  }

  async readOne(pid) {
    try {
      return [pid, await readTextFile(`${sessionsDir()}/${pid}.json`)];
    } catch (e) {
      this.error = `Could not read session ${pid}: ${e.message ?? e}`;
      return [pid, this.texts[pid] ?? null];
    }
  }

  readSessions() {
    if (!this.reading) this.reading = this.readAll().finally(() => { this.reading = null; });
    return this.reading;
  }

  async readAll() {
    const pairs = await Promise.all(this.pids().map((pid) => this.readOne(pid)));
    const texts = Object.fromEntries(pairs);
    const changed = pairs.length !== Object.keys(this.texts).length || pairs.some(([pid, text]) => this.texts[pid] !== text);
    if (!changed) return false;
    const sessions = Object.fromEntries(pairs.map(([pid, text]) => [pid, parseSession(text)]));
    this.transitions = [...this.transitions, ...this.finishedTurns(sessions)];
    this.texts = texts;
    this.sessions = sessions;
    return true;
  }

  finishedTurns(next) {
    return Object.entries(next)
      .filter(([pid, s]) => sessionStatus(this.sessions[pid]?.status) === "working" && sessionStatus(s?.status) === "idle")
      .map(([pid]) => Number(pid));
  }

  takeTransitions() {
    const out = this.transitions;
    this.transitions = [];
    return out.flatMap((pid) => Object.entries(this.fg).filter(([, f]) => f.pid === pid).map(([address]) => address));
  }

  refresh(ps, withForeground, cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const moved = withForeground ? await this.queryForeground(ps) : false;
        const read = await this.readSessions();
        if (moved || read) cx.notify();
      } catch (e) {
        this.error = String(e.message ?? e);
        cx.notify();
      } finally {
        this.busy = false;
      }
    });
  }

  watch(cx) {
    cx.spawn(async (cx) => {
      try {
        for (;;) {
          await watchFolder(sessionsDir());
          if (await this.readSessions()) cx.notify();
        }
      } catch (e) {
        this.watchError = `Watching ${sessionsDir()} stopped: ${e.message ?? e}`;
        cx.notify();
      }
    });
  }

  info(address) {
    const f = this.fg[address];
    if (!f?.claude) return null;
    const s = this.sessions[f.pid] ?? null;
    const sessionId = typeof s?.sessionId === "string" ? s.sessionId : null;
    const cwd = typeof s?.cwd === "string" && s.cwd ? s.cwd : f.cwd;
    const name = agentName(roleName(address, terminals()), s?.name, cwd);
    return { name, sessionId, cwd, pid: f.pid, status: sessionStatus(s?.status), since: s?.statusUpdatedAt ?? null, waitingFor: s?.waitingFor ?? null };
  }

  sessionIds() {
    return Object.values(this.sessions).map((s) => s?.sessionId).filter((id) => typeof id === "string" && /^[\w-]+$/.test(id));
  }
}
