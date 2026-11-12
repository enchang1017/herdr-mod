import { home, readTextFile, watchFolder } from "herdr";

const usageDir = () => `${home()}/.claude/herdr-usage`;

function parse(text) {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export class UsageTracker {
  constructor() {
    this.texts = {};
    this.latest = null;
    this.contexts = {};
    this.error = null;
    this.reading = null;
  }

  async readOne(path) {
    try {
      return await readTextFile(path);
    } catch (e) {
      this.error = `Could not read ${path}: ${e.message ?? e}`;
      return this.texts[path] ?? null;
    }
  }

  async readAll(ids) {
    const paths = [`${usageDir()}/latest.json`, ...ids.map((id) => `${usageDir()}/sessions/${id}.json`)];
    const texts = Object.fromEntries(await Promise.all(paths.map(async (p) => [p, await this.readOne(p)])));
    const changed = paths.length !== Object.keys(this.texts).length || paths.some((p) => this.texts[p] !== texts[p]);
    if (!changed) return false;
    this.texts = texts;
    this.latest = parse(texts[paths[0]]);
    this.contexts = Object.fromEntries(ids.map((id) => [id, num(parse(texts[`${usageDir()}/sessions/${id}.json`])?.context_window?.used_percentage)]));
    return true;
  }

  refresh(ids, cx) {
    if (this.reading) return;
    this.reading = true;
    cx.spawn(async (cx) => {
      try {
        if (await this.readAll(ids)) cx.notify();
      } catch (e) {
        this.error = String(e.message ?? e);
        cx.notify();
      } finally {
        this.reading = false;
      }
    });
  }

  watch(ids, cx) {
    cx.spawn(async (cx) => {
      try {
        for (;;) {
          await watchFolder(usageDir());
          this.refresh(ids(), cx);
        }
      } catch (e) {
        this.error = `Watching ${usageDir()} stopped: ${e.message ?? e}`;
        cx.notify();
      }
    });
  }

  context(sessionId) {
    return sessionId ? this.contexts[sessionId] ?? null : null;
  }
}
