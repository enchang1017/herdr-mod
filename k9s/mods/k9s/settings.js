import { appHome, readTextFile } from "herdr";

const CONTEXT_NAME = /^[A-Za-z0-9@%+=:,./_-]+$/;
const BASE_URL = /^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/;
const NAMESPACE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
const NO_GRAFANA = Object.freeze({ targets: Object.freeze([]), serviceNamespaces: Object.freeze([]) });

export const DEFAULT_SETTINGS = Object.freeze({ writeContexts: Object.freeze([]), grafana: NO_GRAFANA });

let current = DEFAULT_SETTINGS;

export function settingsPath() {
  return `${appHome()}/data/k9s/settings.json`;
}

export function k9sSettings() {
  return current;
}

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function writeContextsFrom(raw) {
  if (raw === undefined) return DEFAULT_SETTINGS.writeContexts;
  if (!Array.isArray(raw)) {
    console.log("k9s settings: writeContexts is not a list, every context stays read-only");
    return DEFAULT_SETTINGS.writeContexts;
  }
  const valid = raw.filter((entry) => typeof entry === "string" && CONTEXT_NAME.test(entry));
  if (valid.length !== raw.length) console.log(`k9s settings: ignored ${raw.length - valid.length} invalid writeContexts entries`);
  return Object.freeze([...new Set(valid)]);
}

function patternFrom(text) {
  try {
    return new RegExp(text, "i");
  } catch {
    return null;
  }
}

function targetFrom(raw) {
  if (!isObject(raw)) return null;
  const { context, namespace, url, lokiUid } = raw;
  if (typeof context !== "string" || !context || typeof url !== "string" || !BASE_URL.test(url)) return null;
  if (typeof lokiUid !== "string" || !CONTEXT_NAME.test(lokiUid)) return null;
  if (namespace !== undefined && (typeof namespace !== "string" || !NAMESPACE.test(namespace))) return null;
  const pattern = patternFrom(context);
  return pattern ? Object.freeze({ pattern, namespace: namespace ?? null, url: url.replace(/\/+$/, ""), lokiUid }) : null;
}

export function grafanaFrom(raw) {
  if (raw === undefined) return NO_GRAFANA;
  if (!isObject(raw)) {
    console.log("k9s settings: grafana is not an object, Grafana links stay hidden");
    return NO_GRAFANA;
  }
  const rawTargets = Array.isArray(raw.targets) ? raw.targets : [];
  const targets = rawTargets.map(targetFrom).filter(Boolean);
  if (targets.length !== rawTargets.length) console.log(`k9s settings: ignored ${rawTargets.length - targets.length} invalid grafana targets`);
  const rawNamespaces = Array.isArray(raw.serviceNamespaces) ? raw.serviceNamespaces : [];
  const serviceNamespaces = rawNamespaces.filter((one) => typeof one === "string" && NAMESPACE.test(one));
  return Object.freeze({ targets: Object.freeze(targets), serviceNamespaces: Object.freeze(serviceNamespaces) });
}

function parsedJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.log(`k9s settings: ${settingsPath()} is not valid JSON, using defaults (read-only, no Grafana): ${error?.message ?? error}`);
    return null;
  }
}

export function parseSettings(text) {
  if (typeof text !== "string" || !text.trim()) return DEFAULT_SETTINGS;
  const raw = parsedJson(text);
  if (!isObject(raw)) {
    if (raw !== null) console.log("k9s settings: the file is not a JSON object, using defaults");
    return DEFAULT_SETTINGS;
  }
  return Object.freeze({ writeContexts: writeContextsFrom(raw.writeContexts), grafana: grafanaFrom(raw.grafana) });
}

export async function loadSettings() {
  const text = await readTextFile(settingsPath()).catch((error) => {
    console.log(`k9s settings: could not read ${settingsPath()}, using defaults: ${error?.message ?? error}`);
    return null;
  });
  current = parseSettings(text);
  return current;
}
