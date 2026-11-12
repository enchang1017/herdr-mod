import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";

const STALE_MS = 30 * 60000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const OPEN_KEY = "spaces-agents.quota-open";
const LEFT_W = 44;

const PROVIDERS = [
  { id: "claude", title: "Claude", icon: "icons/claude.svg" },
  { id: "codex", title: "Codex", icon: "mods/spaces-agents/codex-mono.svg" },
  { id: "agy", title: "Antigravity", icon: "icons/antigravity.svg" },
  { id: "grok", title: "Grok", icon: "icons/grok.svg" },
];

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pad = (n) => String(n).padStart(2, "0");

function clock(seconds, now) {
  if (num(seconds) === null) return "";
  const d = new Date(seconds * 1000);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return seconds * 1000 - now > 86400000 ? `${DAYS[d.getDay()]} ${time}` : time;
}

function ago(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function level(pct, t) {
  if (pct >= 95) return t.blocked;
  if (pct >= 80) return t.working;
  return t.accent;
}

function loadOpen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveOpen(open) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
  } catch {
    return;
  }
}

function claudeEntry(usage) {
  const data = usage.latest;
  if (!data) return { data: null, error: null, empty: "no data yet — open a Claude session" };
  const at = num(data.updated_at);
  const limits = data.rate_limits ?? {};
  const slot = (l) => (l ? { pct: num(l.used_percentage), resetsAt: num(l.resets_at) } : null);
  return { data: { updatedAt: at === null ? null : at * 1000, groups: [{ name: "Claude", five: slot(limits.five_hour), week: slot(limits.seven_day) }] }, error: null };
}

function worst(groups) {
  const pick = (key) => groups.map((g) => g[key]).filter((s) => num(s?.pct) !== null).sort((a, b) => b.pct - a.pct)[0] ?? null;
  return { name: "all", five: pick("five"), week: pick("week") };
}

function cell(s, t) {
  const pct = num(s?.pct);
  const width = `${Math.max(0, Math.min(100, pct ?? 0))}%`;
  return h_flex().flex_1().min_w(0).gap(5).items_center()
    .child(div().flex_1().h(3).rounded(2).bg(t.border)
      .child(div().h(3).rounded(2).bg(pct === null ? t.dim : level(pct, t)).w(width)))
    .child(div().w(28).flex_none().text_right().text_color(pct === null ? t.dim : t.foreground).child(pct === null ? "–" : `${Math.round(pct)}%`));
}

function slotLine(label, s, now) {
  if (num(s?.pct) === null) return null;
  const reset = clock(s.resetsAt, now);
  return `${label} ${Math.round(s.pct)}%${reset ? ` · resets ${reset}` : ""}`;
}

function tooltipFor(p, entry, now) {
  const head = [p.title, entry.data?.plan].filter(Boolean).join(" · ");
  if (!entry.data) return [head, entry.error ?? entry.empty ?? "no data yet"].join("\n");
  const lines = entry.data.groups.flatMap((g) => {
    const parts = [slotLine("5h", g.five, now), slotLine("week", g.week, now)].filter(Boolean);
    return entry.data.groups.length > 1 ? [`${g.name}: ${parts.join(" / ") || "–"}`] : parts;
  });
  const at = entry.data.updatedAt;
  const note = at === null ? "stale" : `${now - at > STALE_MS ? "stale · " : ""}updated ${ago(now - at)}`;
  return [head, ...lines, entry.error ? `${note} · refresh failed: ${entry.error}` : note].join("\n");
}

export class QuotaView {
  constructor() {
    this.open = loadOpen();
  }

  toggle(id, cx) {
    const next = new Set(this.open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.open = next;
    saveOpen(next);
    cx.notify();
  }

  row(p, entry, t, now) {
    const groups = entry.data?.groups ?? [];
    const multi = groups.length > 1;
    const isOpen = multi && this.open.has(p.id);
    const at = entry.data?.updatedAt ?? null;
    const stale = !entry.data || at === null || now - at > STALE_MS;
    const summary = multi ? worst(groups) : groups[0] ?? null;
    const left = h_flex().w(LEFT_W).flex_none().gap(4).items_center()
      .child(svg(p.icon).size(13).flex_none().text_color(t.muted))
      .when(multi, (el) => el.child(svg(`mods/workspace-chrome/chevron-${isOpen ? "down" : "right"}.svg`).size(11).text_color(t.dim)))
      .when(Boolean(entry.error) && !entry.data, (el) => el.child(div().text_color(t.blocked).child("!")));
    const head = h_flex().id(`sa-quota-${p.id}`).h(20).gap(8).items_center().rounded(4)
      .when(stale, (el) => el.opacity(0.55))
      .when(multi, (el) => el.hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.toggle(p.id, cx)))
      .tooltip(tooltipFor(p, entry, now))
      .child(left).child(cell(summary?.five, t)).child(cell(summary?.week, t));
    if (!isOpen) return [head];
    const subs = groups.map((g) => h_flex().h(18).gap(8).items_center().text_size(10.5).when(stale, (el) => el.opacity(0.55))
      .child(div().w(LEFT_W).flex_none().pl(4).text_color(t.dim).truncate().child(g.name))
      .child(cell(g.five, t)).child(cell(g.week, t)));
    return [head, ...subs];
  }

  render({ usage, providers }, t, now, extra = null) {
    const entries = { claude: claudeEntry(usage), ...Object.fromEntries(PROVIDERS.slice(1).map((p) => [p.id, providers.get(p.id)])) };
    const shown = PROVIDERS.filter((p) => p.id === "claude" || entries[p.id]?.data || entries[p.id]?.error);
    const header = h_flex().h(18).gap(8).items_center().text_size(10.5).text_color(t.dim)
      .child(div().w(LEFT_W).flex_none().child("Quota"))
      .child(div().flex_1().child("5h"))
      .child(div().flex_1().child("week"));
    return v_flex().id("sa-quota").flex_none().px(16).pt(6).pb(8).gap(1).border_t(1).border_color(t.border).text_size(11)
      .child(header)
      .children(shown.flatMap((p) => this.row(p, entries[p.id], t, now)))
      .when(Boolean(extra), (el) => el.child(div().pt(4).child(extra)));
  }
}
