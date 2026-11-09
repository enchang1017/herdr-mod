import * as fs from "fs/promises";
import { appHome, notify, playSound, setShared, shared, terminals, watchFolder } from "herdr";
import { soundsOn } from "./util.js";

const BURST = 5;
const POLL = 30000;
const SEEN_KEY = "spaces-agents.inbox.seen";
const LEVELS = new Set(["info", "success", "warning", "error"]);
const RANK = { info: 1, success: 2, warning: 3, error: 4 };

export const inboxDir = () => `${appHome()}/inbox`;

const message = (e) => String(e?.message ?? e);

const isNote = (name) => name.endsWith(".json") && !name.startsWith(".");

const stamp = (name) => {
  const n = Number.parseInt(name, 10);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
};

const byAge = (a, b) => stamp(a) - stamp(b) || a.localeCompare(b);

function seenNames() {
  const value = shared(SEEN_KEY);
  return new Set(Array.isArray(value) ? value.filter((v) => typeof v === "string") : []);
}

function invalid(name, why) {
  return { name, title: `Invalid notification ${name}`, body: why, level: "warning", focus: null };
}

export function parseNote(name, text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return invalid(name, `Not valid JSON: ${message(e)}`);
  }
  if (!data || typeof data !== "object" || typeof data.title !== "string" || !data.title.trim()) {
    return invalid(name, "Missing a title");
  }
  return {
    name,
    title: data.title,
    body: typeof data.body === "string" ? data.body : "",
    level: LEVELS.has(data.level) ? data.level : "info",
    focus: typeof data.focus === "string" && data.focus ? data.focus : null,
  };
}

function focusAction(focus) {
  if (!focus) return undefined;
  const live = terminals().some((t) => t.address === focus && t.state === "live");
  return live ? { name: "pane.focus", args: { terminal: focus } } : undefined;
}

function post(note) {
  const action = focusAction(note.focus);
  notify({ title: note.title, body: note.body, level: note.level, ...(action ? { action } : {}) });
}

function summarize(rest) {
  const level = rest.reduce((worst, n) => (RANK[n.level] > RANK[worst] ? n.level : worst), "info");
  const titles = rest.map((n) => n.title).join(", ");
  notify({ title: `${rest.length} more notifications`, body: titles, level });
}

export function showBurst(notes) {
  notes.slice(0, BURST).forEach(post);
  if (notes.length > BURST) summarize(notes.slice(BURST));
  if (notes.some((n) => n.level === "success") && soundsOn()) playSound("done");
}

async function load(dir, name) {
  try {
    return parseNote(name, await fs.readFile(`${dir}/${name}`, "utf8"));
  } catch (e) {
    return invalid(name, `Could not read: ${message(e)}`);
  }
}

async function removeOne(dir, name) {
  try {
    await fs.unlink(`${dir}/${name}`);
    return null;
  } catch (e) {
    return { name, why: message(e) };
  }
}

export class Inbox {
  constructor() {
    this.scanError = null;
    this.watchError = null;
    this.busy = false;
    this.again = false;
  }

  get error() {
    return this.scanError || this.watchError;
  }

  start(cx) {
    cx.spawn(async (cx) => {
      try {
        await fs.mkdir(inboxDir(), { recursive: true });
      } catch (e) {
        this.watchError = `Could not create ${inboxDir()}: ${message(e)}`;
        cx.notify();
        return;
      }
      this.scan(cx);
      await this.watch(cx);
    });
    cx.timer.every(POLL, (cx) => this.scan(cx));
  }

  async watch(cx) {
    try {
      for (;;) {
        await watchFolder(inboxDir());
        this.scan(cx);
      }
    } catch (e) {
      this.watchError = `Watching ${inboxDir()} stopped: ${message(e)}`;
      cx.notify();
    }
  }

  scan(cx) {
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    cx.spawn(async (cx) => {
      const before = this.error;
      try {
        do {
          this.again = false;
          await this.drain();
        } while (this.again);
      } catch (e) {
        this.scanError = `Could not read ${inboxDir()}: ${message(e)}`;
      } finally {
        this.busy = false;
        if (before !== this.error) cx.notify();
      }
    });
  }

  async drain() {
    const dir = inboxDir();
    const names = (await fs.readdir(dir)).filter(isNote);
    const seen = seenNames();
    const fresh = names.filter((n) => !seen.has(n)).sort(byAge);
    const notes = await Promise.all(fresh.map((n) => load(dir, n)));
    if (notes.length) showBurst(notes);
    const failed = (await Promise.all(names.map((n) => removeOne(dir, n)))).filter(Boolean);
    this.remember(seen, failed);
  }

  remember(seen, failed) {
    const next = failed.map((f) => f.name);
    const same = next.length === seen.size && next.every((n) => seen.has(n));
    if (!same) setShared(SEEN_KEY, next);
    this.scanError = failed.length ? `Could not remove inbox/${failed[0].name}: ${failed[0].why}` : null;
  }
}
