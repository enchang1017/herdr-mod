import { readContexts, errorText } from "./kubectl.js";
import { indexContext } from "./source.js";

export const RECENT_LIMIT = 50;
export const INDEX_TTL_MS = 60_000;
export const INDEX_POLL_MS = 10 * 60_000;
export const INDEX_RETRY_MS = 2 * 60_000;

const INDEX_KEY = "index";
const RECENT_KEY = "recent";

export const EMPTY_INDEX = { targets: [], refreshedAt: {}, errors: {}, updatedAt: 0 };

export function targetId(target) {
  return `${target.context} ${target.namespace}/${target.name}`;
}

function pick(contexts, valueOf) {
  return Object.fromEntries(contexts.flatMap((context) => {
    const value = valueOf(context);
    return value === undefined ? [] : [[context, value]];
  }));
}

export function mergeIndex(previous, fresh, failed, contexts, now) {
  const targets = contexts.flatMap((context) => fresh.get(context) ?? previous.targets.filter((target) => target.context === context));
  const refreshedAt = pick(contexts, (context) => (fresh.has(context) ? now : previous.refreshedAt[context]));
  const errors = pick(contexts, (context) => failed.get(context) ?? (fresh.has(context) ? undefined : previous.errors[context]));
  return { targets, refreshedAt, errors, updatedAt: now };
}

export function rememberRecent(recent, target) {
  const id = targetId(target);
  return [id, ...recent.filter((one) => one !== id)].slice(0, RECENT_LIMIT);
}

function compareRanked(a, b) {
  return Number(b.isExact) - Number(a.isExact)
    || a.recent - b.recent
    || Number(b.target.isDefaultNamespace) - Number(a.target.isDefaultNamespace)
    || a.target.name.length - b.target.name.length
    || a.target.name.localeCompare(b.target.name)
    || a.target.context.localeCompare(b.target.context);
}

export function rankTargets(targets, recent, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const recentRank = new Map(recent.map((id, index) => [id, index]));
  const exactNames = new Set(words);
  const keyed = targets.flatMap((target) => {
    const id = targetId(target);
    const lower = id.toLowerCase();
    if (!words.every((word) => lower.includes(word))) return [];
    return [{ target, recent: recentRank.get(id) ?? Number.MAX_SAFE_INTEGER, isExact: exactNames.has(target.name.toLowerCase()) }];
  });
  return [...keyed].sort(compareRanked).map((entry) => entry.target);
}

export function ageText(ms) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function isTargetIndex(value) {
  return Array.isArray(value?.targets) && typeof value?.updatedAt === "number"
    && typeof value.refreshedAt === "object" && typeof value.errors === "object";
}

function readJson(key) {
  const raw = localStorage.getItem(key);
  if (raw === null || raw === undefined || raw === "undefined") return { value: null, error: "" };
  try {
    return { value: JSON.parse(raw), error: "" };
  } catch (error) {
    return { value: null, error: `cache ${key} unreadable: ${errorText(error)}` };
  }
}

export function loadStore() {
  const index = readJson(INDEX_KEY);
  const recent = readJson(RECENT_KEY);
  return {
    index: isTargetIndex(index.value) ? index.value : EMPTY_INDEX,
    recent: Array.isArray(recent.value) ? recent.value.filter((id) => typeof id === "string") : [],
    error: index.error || recent.error,
  };
}

export function saveStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return "";
  } catch (error) {
    return `cache not saved: ${errorText(error)}`;
  }
}

export const saveIndex = (index) => saveStore(INDEX_KEY, index);
export const saveRecent = (recent) => saveStore(RECENT_KEY, recent);

export function dueContexts(contexts, failedAt, now, isForced, onlyFailed) {
  return contexts.filter((context) => {
    const failed = failedAt[context];
    if (onlyFailed) return failed !== undefined && now - failed > INDEX_RETRY_MS;
    return isForced || failed === undefined || now - failed > INDEX_RETRY_MS;
  });
}

export async function buildIndex(previous, failedAt, options) {
  const listed = await readContexts();
  if (listed.error) return { index: previous, failedAt, error: `contexts: ${listed.error}` };
  options.pool?.setKnown(listed.contexts);
  const started = Date.now();
  const due = dueContexts(listed.contexts, failedAt, started, options.isForced, options.onlyFailed);
  const results = await Promise.all(due.map(async (context) => ({ context, result: await indexContext(options.pool, options.cx, context) })));
  const fresh = new Map(results.filter((one) => one.result.targets).map((one) => [one.context, one.result.targets]));
  const failed = new Map(results.filter((one) => one.result.error).map((one) => [one.context, one.result.error]));
  const nextFailedAt = {
    ...Object.fromEntries(Object.entries(failedAt).filter(([context]) => !fresh.has(context))),
    ...Object.fromEntries([...failed.keys()].map((context) => [context, started])),
  };
  return { index: mergeIndex(previous, fresh, failed, listed.contexts, Date.now()), failedAt: nextFailedAt, error: "" };
}

export function freshness(index, now) {
  const contexts = [...new Set([...Object.keys(index.refreshedAt), ...Object.keys(index.errors)])].sort();
  return contexts.map((context) => {
    const at = index.refreshedAt[context];
    return { context, age: at === undefined ? "never" : ageText(now - at), error: index.errors[context] ?? null };
  });
}
