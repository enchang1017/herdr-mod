import { readTextFile, home, exec } from "herdr";
import { DASHBOARD, dashboardAt, orbitJson, loadDaemonStatus, asArray, asObject, asText, asNumber } from "./api.js";
import { countTones } from "./model.js";

export const DEFAULT_INSTANCE = Object.freeze({
  name: "", label: "default", environment: "", state: "", base: DASHBOARD, port: 19800, live: false, stale: false,
  pid: 0, pidAlive: false, configPath: "", lastActive: "", healthy: 0, total: 0,
});

async function readJson(path) {
  const text = await readTextFile(path).catch(() => "");
  try {
    return asObject(JSON.parse(text));
  } catch {
    return {};
  }
}

async function dashboardPort(name) {
  const ports = await readJson(`${home()}/.orbit/instances/${name}/ports.json`);
  return asNumber(asObject(ports.ports).dashboard);
}

async function isPidAlive(pid) {
  if (!pid) return false;
  try {
    const ran = await exec("/bin/kill", ["-0", String(pid)]);
    return ran.code === 0;
  } catch {
    return false;
  }
}

async function namedInstance(raw) {
  const r = asObject(raw);
  const name = asText(r.name);
  const port = await dashboardPort(name);
  return {
    ...DEFAULT_INSTANCE, name, label: name, environment: asText(r.environment), state: asText(r.state), base: dashboardAt(port), port,
    pid: asNumber(r.pid), configPath: asText(r.config_path), lastActive: asText(r.last_active_at),
  };
}

async function defaultInstance() {
  const pidFile = await readJson(`${home()}/.orbit/orbit.pid`);
  const port = asNumber(pidFile.dashboard_port);
  return { ...DEFAULT_INSTANCE, pid: asNumber(pidFile.pid), port: port || DEFAULT_INSTANCE.port, base: port ? dashboardAt(port) : DASHBOARD };
}

async function probe(instance) {
  const pidAlive = await isPidAlive(instance.pid);
  const stale = Boolean(instance.name) && !pidAlive;
  if (!instance.base) return { ...instance, pidAlive, stale };
  try {
    const status = await loadDaemonStatus(instance.base);
    const counts = countTones(status.resources);
    return {
      ...instance, live: true, pidAlive, stale: false, environment: status.env || instance.environment,
      configPath: status.configPath || instance.configPath, healthy: counts.healthy ?? 0, total: status.resources.length,
    };
  } catch {
    return { ...instance, live: false, pidAlive, stale, healthy: 0, total: 0 };
  }
}

export async function loadInstances() {
  const body = await orbitJson(["instance", "list", "--json"]);
  if (body.ok === false) throw new Error(asText(asObject(body.error).message) || "orbit instance list failed");
  const named = await Promise.all(asArray(asObject(body.data).instances).map(namedInstance));
  const all = [await defaultInstance(), ...named.filter((one) => one.name)];
  return Promise.all(all.map(probe));
}

export function splitInstances(instances, current) {
  const shown = instances.filter((one) => !one.stale || one.name === current);
  const stale = instances.filter((one) => one.stale && one.name !== current);
  return { shown: [...shown].sort((a, b) => Number(b.live) - Number(a.live)), stale };
}

export function dbStatePath(instance) {
  return instance ? `${home()}/.orbit/instances/${instance}/db-state.json` : `${home()}/.orbit/db-state.json`;
}
