const MONTH = 30 * 24 * 3600000;

const asMap = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export const emptyRegistry = () => ({ sessions: {}, removed: {} });

export function parseRegistry(text) {
  if (!text) return emptyRegistry();
  try {
    const data = JSON.parse(text);
    return { sessions: asMap(data?.sessions), removed: asMap(data?.removed) };
  } catch {
    return emptyRegistry();
  }
}

export function freshRemoved(a, b, now) {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  return Object.fromEntries([...ids]
    .map((id) => [id, Math.max(Number(a[id]) || 0, Number(b[id]) || 0)])
    .filter(([, at]) => now - at <= MONTH));
}

export function withoutRemoved(sessions, removed) {
  return Object.fromEntries(Object.entries(sessions).filter(([id, e]) => !(removed[id] >= (e?.lastSeen ?? 0))));
}

const newer = (a, b) => (!a ? b : !b ? a : (b.lastSeen ?? 0) >= (a.lastSeen ?? 0) ? b : a);

export function mergeRegistry(disk, memory, now) {
  const removed = freshRemoved(disk.removed, memory.removed, now);
  const ids = new Set([...Object.keys(disk.sessions), ...Object.keys(memory.sessions)]);
  const sessions = Object.fromEntries([...ids].map((id) => [id, newer(disk.sessions[id], memory.sessions[id])]));
  return { sessions: withoutRemoved(sessions, removed), removed };
}

export function tombstone(state, ids, now) {
  const gone = new Set(ids);
  if (!gone.size) return state;
  return {
    sessions: Object.fromEntries(Object.entries(state.sessions).filter(([id]) => !gone.has(id))),
    removed: { ...state.removed, ...Object.fromEntries([...gone].map((id) => [id, now])) },
  };
}

export const registryText = (state) => JSON.stringify({ version: 1, sessions: state.sessions, removed: state.removed }, null, 2);
