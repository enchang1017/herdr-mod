import { hc, home, readTextFile, watchFolder, panes, shared, setShared } from "herdr";

const STALE_MS = 8000;
const UNSEEN_KEY = "agent-radar.unseen";
const SESSION_STATUS = { busy: "working", idle: "idle", waiting: "blocked" };

const sessionsDir = () => `${home()}/.claude/sessions`;
const signatureOf = (p) => `${p.program?.key ?? ""}|${p.cwd ?? ""}`;

function isClaude(fg) {
  const program = fg?.argv?.[0] ?? "";
  return (program.split("/").pop() ?? "").startsWith("claude");
}

function parseJson(text) {
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export function unseen() {
  const list = shared(UNSEEN_KEY);
  return new Set(Array.isArray(list) ? list : []);
}

export class ClaudeWatch {
  constructor() {
    this.fg = {};
    this.sessions = {};
    this.busy = false;
    this.error = null;
  }

  candidates() {
    return panes().filter((p) => p.terminal && !p.terminal.includes("/"));
  }

  stale(p, now) {
    const known = this.fg[p.terminal];
    return !known || known.sig !== signatureOf(p) || now - known.at > STALE_MS;
  }

  async queryOne(p, now) {
    const r = await hc(["get", p.terminal, "--json"]);
    if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `hc get ${p.terminal} exited ${r.code}`);
    const fg = parseJson(r.stdout)?.foreground ?? null;
    return [p.terminal, { sig: signatureOf(p), at: now, claude: isClaude(fg), pid: fg?.pid ?? null }];
  }

  async queryForeground() {
    const now = Date.now();
    const ps = this.candidates();
    const results = await Promise.allSettled(ps.filter((p) => this.stale(p, now)).map((p) => this.queryOne(p, now)));
    const failed = results.find((r) => r.status === "rejected");
    this.error = failed ? String(failed.reason?.message ?? failed.reason) : null;
    const live = new Set(ps.map((p) => p.terminal));
    const kept = Object.entries(this.fg).filter(([address]) => live.has(address));
    this.fg = Object.fromEntries([...kept, ...results.filter((r) => r.status === "fulfilled").map((r) => r.value)]);
  }

  async readSession(pid) {
    try {
      return [pid, parseJson(await readTextFile(`${sessionsDir()}/${pid}.json`))];
    } catch (e) {
      this.error = `Could not read Claude session ${pid}: ${e.message ?? e}`;
      return [pid, this.sessions[pid] ?? null];
    }
  }

  async readSessions() {
    const pids = [...new Set(Object.values(this.fg).filter((f) => f.claude && f.pid).map((f) => f.pid))];
    const next = Object.fromEntries(await Promise.all(pids.map((pid) => this.readSession(pid))));
    const changed = JSON.stringify(next) !== JSON.stringify(this.sessions);
    this.sessions = next;
    return changed;
  }

  refresh(cx, withForeground) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        if (withForeground) await this.queryForeground();
        await this.readSessions();
      } catch (e) {
        this.error = String(e.message ?? e);
      } finally {
        this.busy = false;
        cx.notify();
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
        this.error = `Watching ${sessionsDir()} stopped: ${e.message ?? e}`;
        cx.notify();
      }
    });
  }

  status(address) {
    const f = this.fg[address];
    if (!f?.claude) return null;
    const s = this.sessions[f.pid];
    return { status: SESSION_STATUS[s?.status] ?? "idle", since: s?.statusUpdatedAt ?? null, name: s?.name ?? null };
  }

  statuses() {
    return Object.fromEntries(Object.keys(this.fg).map((address) => [address, this.status(address)]).filter(([, s]) => s));
  }
}

export function trackUnseen(previous, current, focusedTerminal) {
  const marks = unseen();
  const next = new Set([...marks].filter((address) => address !== focusedTerminal && current[address]?.status === "idle"));
  for (const [address, s] of Object.entries(current)) {
    const finished = previous[address]?.status === "working" && s.status === "idle";
    if (finished && address !== focusedTerminal) next.add(address);
  }
  const same = next.size === marks.size && [...next].every((address) => marks.has(address));
  if (!same) setShared(UNSEEN_KEY, [...next]);
}
