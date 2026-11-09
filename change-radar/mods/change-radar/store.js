import { shared, setShared, readTextFile, appHome } from "herdr";
import * as fs from "fs/promises";

const REVIEWS = "reviews";
const SUMMARIES = "summaries";
const SUMMARY_LIMIT = 40;

export function hash(text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

const SHARED_PREFIX = "change-radar.";

function legacy(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : {};
}

function read(key) {
  try {
    const value = shared(`${SHARED_PREFIX}${key}`);
    return { value: value && typeof value === "object" ? value : legacy(key), error: null };
  } catch (e) {
    return { value: {}, error: `Saved ${key} could not be read (${e}); starting empty` };
  }
}

function write(key, value) {
  try {
    setShared(`${SHARED_PREFIX}${key}`, value);
    return null;
  } catch (e) {
    return `Could not save ${key}: ${e}`;
  }
}

async function storeFiles() {
  const folder = `${appHome()}/data/change-radar`;
  const names = await fs.readdir(folder).catch(() => []);
  return names.filter((name) => /^store(-[0-9a-f]+)?\.json$/.test(name)).map((name) => `${folder}/${name}`);
}

async function legacyValues(key) {
  const texts = await Promise.all((await storeFiles()).map((path) => readTextFile(path).catch(() => null)));
  return texts.filter(Boolean).reduce((all, text) => {
    try {
      const raw = JSON.parse(text)[key];
      return raw ? { ...all, ...JSON.parse(raw) } : all;
    } catch {
      return all;
    }
  }, {});
}

export async function migrateLegacy() {
  const keys = [REVIEWS, SUMMARIES].filter((key) => !shared(`${SHARED_PREFIX}${key}`));
  const found = await Promise.all(keys.map(async (key) => [key, await legacyValues(key)]));
  found.filter(([, value]) => Object.keys(value).length).forEach(([key, value]) => setShared(`${SHARED_PREFIX}${key}`, value));
  return found.length > 0;
}

export const loadReviews = () => read(REVIEWS);
export const saveReviews = (reviews) => write(REVIEWS, reviews);
export const loadSummaries = () => read(SUMMARIES);

export function newestSummaries(summaries) {
  return Object.fromEntries(Object.entries(summaries).sort((a, b) => (b[1].at ?? 0) - (a[1].at ?? 0)).slice(0, SUMMARY_LIMIT));
}

export function saveSummaries(summaries) {
  return write(SUMMARIES, newestSummaries(summaries));
}

export function fingerprint(info, worktree) {
  const entries = info.entries.map((e) => `${e.xy} ${e.index ?? ""} ${e.path}`).join("\n");
  return hash([info.oid ?? "", info.branch ?? "", entries, worktree].join("\0"));
}

export function reviewState(review, info) {
  if (!review) return "todo";
  if (!info.fingerprint) return info.fingerprintError ? "unknown" : "checking";
  return review.fingerprint === info.fingerprint ? "reviewed" : "changed";
}

export class SummaryCache {
  constructor() {
    const loaded = loadSummaries();
    this.entries = loaded.value;
    this.error = loaded.error;
  }

  reload() {
    const loaded = loadSummaries();
    this.entries = loaded.value;
    this.error = loaded.error;
  }

  get(key) {
    return this.entries[key] ?? null;
  }

  put(key, value) {
    this.entries = newestSummaries({ ...this.entries, [key]: { ...value, at: Date.now() } });
    this.error = saveSummaries(this.entries);
  }
}
