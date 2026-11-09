import { appHome, readTextFile, writeTextFile } from "herdr";

const VERSION = 2;
const MAX_LISTS = 20;
const MAX_DETAILS = 60;

let pending = null;
let onDisk = null;

const cachePath = () => `${appHome()}/data/jira/cache.json`;

const newest = (entries, limit) => entries.sort((a, b) => (b[1]?.at ?? 0) - (a[1]?.at ?? 0)).slice(0, limit);

export async function readDiskCache() {
  const text = await readTextFile(cachePath()).catch((e) => {
    console.log(`jira: cannot read cache: ${e.message ?? e}`);
    return null;
  });
  onDisk = text ?? null;
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    return data?.version === VERSION ? data : null;
  } catch (e) {
    console.log(`jira: cache is not valid JSON, ignoring it: ${e.message ?? e}`);
    return null;
  }
}

export function diskSnapshot(lists, details, extra) {
  return {
    version: VERSION, ...extra,
    lists: Object.fromEntries(newest([...lists.entries()], MAX_LISTS)),
    details: Object.fromEntries(newest([...details.entries()], MAX_DETAILS)),
  };
}

export function markDiskDirty(snapshot) {
  pending = snapshot;
}

async function writeOnce(text) {
  await writeTextFile(cachePath(), text, onDisk);
  onDisk = text;
}

export async function flushDiskCache() {
  const data = pending;
  pending = null;
  if (!data) return;
  const text = JSON.stringify(data);
  try {
    await writeOnce(text);
  } catch (first) {
    onDisk = await readTextFile(cachePath()).catch(() => null);
    await writeOnce(text).catch((e) => console.log(`jira: cannot write cache: ${e.message ?? e} (first try: ${first.message ?? first})`));
  }
}
