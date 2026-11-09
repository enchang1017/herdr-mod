const CPU_SUFFIX = { n: 1e-9, u: 1e-6, m: 1e-3, "": 1, k: 1e3 };
const MEMORY_SUFFIX = {
  "": 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18,
  Ki: 2 ** 10, Mi: 2 ** 20, Gi: 2 ** 30, Ti: 2 ** 40, Pi: 2 ** 50, Ei: 2 ** 60, m: 1e-3,
};
const QUANTITY = /^([+-]?[0-9.]+(?:[eE][+-]?[0-9]+)?)([a-zA-Z]*)$/;

function parseWith(table, text) {
  if (text === undefined || text === null || text === "") return null;
  const match = QUANTITY.exec(String(text).trim());
  if (!match || !(match[2] in table)) return null;
  const value = Number(match[1]) * table[match[2]];
  return Number.isFinite(value) ? value : null;
}

export function cpuCores(text) {
  return parseWith(CPU_SUFFIX, text);
}

export function memoryBytes(text) {
  return parseWith(MEMORY_SUFFIX, text);
}

export function formatCpu(cores) {
  if (cores === null || cores === undefined) return "-";
  if (cores < 1) return `${Math.round(cores * 1000)}m`;
  return `${cores >= 10 ? cores.toFixed(0) : cores.toFixed(2).replace(/\.?0+$/, "")}`;
}

export function formatMemory(bytes) {
  if (bytes === null || bytes === undefined) return "-";
  const gib = bytes / 2 ** 30;
  if (gib >= 1) return `${gib >= 10 ? gib.toFixed(0) : gib.toFixed(1)}Gi`;
  return `${Math.round(bytes / 2 ** 20)}Mi`;
}

export function sumOf(values) {
  const known = values.filter((value) => value !== null && value !== undefined);
  return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null;
}

export function age(iso, now = Date.now()) {
  const at = Date.parse(iso ?? "");
  if (!Number.isFinite(at)) return "-";
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h${minutes % 60 ? `${minutes % 60}m` : ""}`;
  const days = Math.floor(hours / 24);
  return `${days}d${hours % 24 ? `${hours % 24}h` : ""}`;
}
