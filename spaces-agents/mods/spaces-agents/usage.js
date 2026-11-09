import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { home, readTextFile, watchFolder } from "herdr";

const STALE_MS = 30 * 60000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
const pad = (n) => String(n).padStart(2, "0");

function clock(seconds, withDay) {
  if (num(seconds) === null) return "";
  const d = new Date(seconds * 1000);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withDay ? `${DAYS[d.getDay()]} ${time}` : time;
}

function ago(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export function level(pct, t, warnAt = 80) {
  if (pct >= 95) return t.blocked;
  if (pct >= warnAt) return t.working;
  return t.accent;
}

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

function quotaRow(label, limit, withDay, t, faded) {
  const pct = num(limit?.used_percentage);
  const color = pct === null ? t.dim : level(pct, t);
  return h_flex().h(18).gap(8).items_center().text_size(11)
    .child(div().w(34).flex_none().text_color(t.muted).child(label))
    .child(div().flex_1().h(4).rounded(2).bg(t.border)
      .child(div().h(4).rounded(2).bg(color).w(`${Math.max(0, Math.min(100, pct ?? 0))}%`)))
    .child(div().w(30).flex_none().text_right().text_color(faded ? t.dim : t.foreground).child(pct === null ? "--" : `${Math.round(pct)}%`))
    .child(div().w(62).flex_none().text_right().text_color(t.dim).child(clock(limit?.resets_at, withDay)));
}

export function quotaBlock(usage, t, now, extra = null) {
  const data = usage.latest;
  const at = num(data?.updated_at);
  const stale = at === null || now - at * 1000 > STALE_MS;
  const limits = data?.rate_limits ?? {};
  const note = !data ? "no data yet — open a Claude session" : at === null ? "stale" : `${stale ? "stale · " : ""}updated ${ago(now - at * 1000)}`;
  return v_flex().id("sa-quota").flex_none().px(16).pt(8).pb(10).gap(2).border_t(1).border_color(t.border)
    .child(v_flex().gap(2).when(stale, (el) => el.opacity(0.55))
      .child(div().pb(2).text_size(11.5).text_color(t.dim).child("Claude quota"))
      .child(quotaRow("5h", limits.five_hour, false, t, stale))
      .child(quotaRow("week", limits.seven_day, true, t, stale))
      .child(div().pt(2).text_size(10.5).text_color(t.dim).truncate().child(note)))
    .when(Boolean(extra), (el) => el.child(extra));
}
