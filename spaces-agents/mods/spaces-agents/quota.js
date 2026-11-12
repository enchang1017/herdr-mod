import { appHome, exec, home } from "herdr";

const RPC = () => `${appHome()}/mods/spaces-agents/quota-rpc.py`;
const NOT_INSTALLED = 3;

const AGY_GROUPS = [
  [/^gemini models$/i, "Gemini"],
  [/claude/i, "Cl/GPT"],
];

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const message = (e) => String(e?.message ?? e);
const seconds = (iso) => {
  const ms = Date.parse(iso ?? "");
  return Number.isFinite(ms) ? ms / 1000 : null;
};

function slot(pct, resetsAt, now) {
  const reset = num(resetsAt);
  if (reset !== null && reset * 1000 <= now) return { pct: 0, resetsAt: null };
  return { pct: num(pct), resetsAt: reset };
}

function windowKey(minutes) {
  if (minutes === 300) return "five";
  if (minutes === 10080) return "week";
  return null;
}

export function parseCodex(result, now) {
  const limits = result?.rateLimits;
  if (!limits) return null;
  const group = { name: "Codex", five: null, week: null };
  for (const w of [limits.primary, limits.secondary].filter(Boolean)) {
    const key = windowKey(w.windowDurationMins);
    if (key) group[key] = slot(w.usedPercent, w.resetsAt, now);
  }
  return { updatedAt: now, groups: [group], plan: limits.planType ?? null };
}

export function parseGrok(result, now) {
  const config = result?.config;
  if (!config) return null;
  const period = config.currentPeriod ?? {};
  const used = slot(config.creditUsagePercent, seconds(period.end ?? config.billingPeriodEnd), now);
  const group = { name: "Grok", five: null, week: used };
  return { updatedAt: now, groups: [group], plan: result.subscription_tier ?? null };
}

function agyGroupName(group) {
  return AGY_GROUPS.find(([re]) => re.test(group))?.[1] ?? group.replace(/^gemini\s+(\d+\s+)?/i, "");
}

export function parseAgy(stdout, now) {
  const byName = new Map();
  for (const fields of stdout.split("\n").map((l) => l.split("\t"))) {
    if (fields.length !== 4 || !/%$/.test(fields[2].trim())) continue;
    const [group, label, remaining, reset] = fields.map((f) => f.trim());
    const key = /five hour/i.test(label) ? "five" : /week/i.test(label) ? "week" : null;
    if (!key) continue;
    const name = agyGroupName(group);
    const left = Number.parseFloat(remaining);
    const prev = byName.get(name) ?? { name, five: null, week: null };
    byName.set(name, { ...prev, [key]: slot(Number.isFinite(left) ? Math.max(0, 100 - left) : null, seconds(reset), now) });
  }
  return byName.size ? { updatedAt: now, groups: [...byName.values()] } : null;
}

async function rpc(name) {
  const r = await exec("python3", ["-I", RPC(), name], { timeout: 45000 });
  if (r.code === NOT_INSTALLED) return null;
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `quota-rpc ${name} exited ${r.code}`);
  return JSON.parse(r.stdout);
}

async function probeAgy(now) {
  const r = await exec("agy", ["-p", "/usage", "--print-timeout", "40s"], { cwd: home(), timeout: 60000 });
  if (r.code !== 0) throw new Error(`agy /usage exited ${r.code}: ${(r.stderr || r.stdout).trim().slice(0, 200) || "no output"}`);
  const data = parseAgy(r.stdout, now);
  if (!data) throw new Error(`agy /usage printed no quota rows: ${r.stdout.trim().slice(0, 200) || "empty"}`);
  return data;
}

const PROBES = {
  codex: async (now) => parseCodex(await rpc("codex"), now),
  grok: async (now) => parseGrok(await rpc("grok"), now),
  agy: probeAgy,
};

export const PROVIDERS = Object.keys(PROBES);

export class ProviderQuota {
  constructor() {
    this.state = Object.fromEntries(PROVIDERS.map((n) => [n, { data: null, error: null }]));
    this.busy = new Set();
  }

  refresh(name, cx) {
    if (this.busy.has(name)) return;
    this.busy.add(name);
    cx.spawn(async (cx) => {
      const prev = this.state[name];
      try {
        const data = await PROBES[name](Date.now());
        this.state = { ...this.state, [name]: { data: data ?? prev.data, error: null } };
      } catch (e) {
        this.state = { ...this.state, [name]: { data: prev.data, error: message(e) } };
      } finally {
        this.busy.delete(name);
        cx.notify();
      }
    });
  }

  get(name) {
    return this.state[name];
  }

  get error() {
    return Object.entries(this.state).filter(([, s]) => s.error).map(([n, s]) => `${n}: ${s.error}`).join("\n") || null;
  }
}
