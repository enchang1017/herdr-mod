import * as fs from "fs/promises";
import { appHome, exec, readTextFile, spaces, terminals, writeTextFile } from "herdr";
import { transcriptPath } from "./transcript.js";
import { freshRemoved, mergeRegistry, parseRegistry, registryText, tombstone, withoutRemoved } from "./tombstones.js";

const WEEK = 7 * 24 * 3600000;
const TOUCH_EVERY = 60000;
const LOST_EVERY = 15000;
const RECENT = 120000;
const CHECK = 'for p in $1; do kill -0 "$p" 2>/dev/null && echo "pid $p"; done; shift; for f in "$@"; do [ -f "$f" ] && echo "file $f"; done; exit 0';

const message = (e) => String(e?.message ?? e);

export const registryDir = () => `${appHome()}/data/spaces-agents`;
const registryPath = () => `${registryDir()}/sessions.json`;

function placeOf(p) {
  const space = spaces().find((s) => (s.tabs ?? []).some((t) => t.id === p.tab));
  const tab = space?.tabs.find((t) => t.id === p.tab);
  return { space: space ? { id: space.id, name: space.name, named: Boolean(space.named) } : null, tab: tab ? { id: tab.id, label: tab.name } : null, machine: space?.machine ?? null };
}

export function liveRecord(p, info, now) {
  const term = terminals().find((t) => t.address === p.terminal) ?? {};
  const labels = term.labels ?? {};
  return {
    sessionId: info.sessionId, name: info.name, terminalName: term.name ?? null, cwd: info.cwd, pid: info.pid ?? null,
    address: p.terminal, parent: term.parent ?? null, template: labels["team.template"] ?? null, team: labels.team ?? null,
    transcript: transcriptPath(info.cwd, info.sessionId), lastSeen: now, ...placeOf(p),
  };
}

const sameShape = (a, b) => JSON.stringify({ ...a, lastSeen: 0 }) === JSON.stringify({ ...b, lastSeen: 0 });

export class Registry {
  constructor() {
    this.sessions = {};
    this.removed = {};
    this.text = null;
    this.loaded = false;
    this.alive = new Set();
    this.files = new Set();
    this.checkedAt = 0;
    this.error = null;
    this.writing = false;
    this.again = false;
    this.checking = false;
  }

  load(cx) {
    cx.spawn(async (cx) => {
      try {
        await fs.mkdir(registryDir(), { recursive: true });
        this.text = await readTextFile(registryPath());
        const state = parseRegistry(this.text);
        this.removed = freshRemoved(state.removed, {}, Date.now());
        this.sessions = withoutRemoved(state.sessions, this.removed);
        this.loaded = true;
        this.error = null;
        this.check(cx);
      } catch (e) {
        this.error = `Could not read ${registryPath()}: ${message(e)}`;
      }
      cx.notify();
    });
  }

  record(records, cx) {
    if (!this.loaded) return;
    const now = Date.now();
    const changed = records.filter((r) => {
      const old = this.sessions[r.sessionId];
      return !old || !sameShape(old, r) || now - old.lastSeen > TOUCH_EVERY;
    });
    if (!changed.length) return;
    const superseded = (e) => changed.some((r) => r.address === e.address && r.pid === e.pid && r.sessionId !== e.sessionId);
    const gone = Object.entries(this.sessions).filter(([, e]) => superseded(e)).map(([id]) => id);
    const next = tombstone({ sessions: this.sessions, removed: this.removed }, gone, now);
    this.apply({ ...next, sessions: { ...next.sessions, ...Object.fromEntries(changed.map((r) => [r.sessionId, r])) } });
    this.save(cx);
  }

  apply(state) {
    this.sessions = state.sessions;
    this.removed = state.removed;
  }

  dismiss(sessionId, cx) {
    this.apply(tombstone({ sessions: this.sessions, removed: this.removed }, [sessionId], Date.now()));
    this.save(cx);
    cx.notify();
  }

  prune(checked) {
    const now = Date.now();
    const gone = (e) => now - e.lastSeen > WEEK || (now - e.lastSeen > RECENT && !this.files.has(e.transcript));
    const dropped = Object.entries(this.sessions).filter(([id, e]) => checked.has(id) && gone(e)).map(([id]) => id);
    if (!dropped.length) return false;
    this.apply(tombstone({ sessions: this.sessions, removed: this.removed }, dropped, now));
    return true;
  }

  save(cx) {
    if (this.writing) {
      this.again = true;
      return;
    }
    this.writing = true;
    cx.spawn(async (cx) => {
      try {
        do {
          this.again = false;
          await this.write();
        } while (this.again);
        this.error = null;
      } catch (e) {
        this.error = `Could not save ${registryPath()}: ${message(e)}`;
        cx.notify();
      } finally {
        this.writing = false;
      }
    });
  }

  async write() {
    const now = Date.now();
    const mine = { sessions: this.sessions, removed: freshRemoved(this.removed, {}, now) };
    const text = registryText(mine);
    try {
      await writeTextFile(registryPath(), text, this.text);
      this.text = text;
    } catch {
      const disk = await readTextFile(registryPath());
      const merged = mergeRegistry(parseRegistry(disk), mine, now);
      const next = registryText(merged);
      await writeTextFile(registryPath(), next, disk);
      this.apply(mergeRegistry(merged, { sessions: this.sessions, removed: this.removed }, now));
      this.text = next;
    }
  }

  check(cx) {
    const entries = Object.values(this.sessions);
    if (!entries.length || this.checking) return;
    this.checking = true;
    cx.spawn(async (cx) => {
      try {
        const pids = entries.map((e) => e.pid).filter((p) => Number.isInteger(p)).join(" ");
        const r = await exec("sh", ["-c", CHECK, "sh", pids, ...entries.map((e) => e.transcript)]);
        const lines = r.stdout.split("\n");
        this.alive = new Set(lines.filter((l) => l.startsWith("pid ")).map((l) => Number(l.slice(4))));
        this.files = new Set(lines.filter((l) => l.startsWith("file ")).map((l) => l.slice(5)));
        this.checkedAt = Date.now();
        if (this.prune(new Set(entries.map((e) => e.sessionId)))) this.save(cx);
      } catch (e) {
        this.error = `Checking lost agents failed: ${message(e)}`;
      } finally {
        this.checking = false;
      }
      cx.notify();
    });
  }

  tick(cx) {
    if (this.loaded && Date.now() - this.checkedAt > LOST_EVERY) this.check(cx);
  }

  lost(liveIds) {
    if (!this.checkedAt) return [];
    return Object.values(this.sessions)
      .filter((e) => !liveIds.has(e.sessionId) && !this.alive.has(e.pid) && this.files.has(e.transcript))
      .sort((a, b) => b.lastSeen - a.lastSeen);
  }
}
