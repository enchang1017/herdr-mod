import { exec, home } from "herdr";

export const DASHBOARD = "http://localhost:19800";

export function dashboardAt(port) {
  return port ? `http://localhost:${port}` : "";
}
const LOG_LINES = 1000;
const TRACE_LIMIT = 100;

export function errorText(error) {
  return error?.message ?? String(error);
}

export function firstLine(text) {
  return String(text ?? "").trim().split("\n")[0].slice(0, 300);
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function asText(value, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

export function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${what}: the response is not JSON (${firstLine(text) || "empty"})`);
  }
}

async function request(base, path, options) {
  if (!base) throw Object.assign(new Error("This Orbit instance has no dashboard port."), { unreachable: true });
  let response;
  try {
    response = await fetch(`${base}${path}`, options);
  } catch (error) {
    const unreachable = new Error(`Orbit daemon unreachable at ${base}: ${errorText(error)}`);
    throw Object.assign(unreachable, { unreachable: true });
  }
  const text = await response.text();
  const body = text.trim() ? parseJson(text, path) : {};
  const reported = asText(asObject(body).error);
  if (!response.ok || reported) throw new Error(reported || `${path}: HTTP ${response.status}`);
  return body;
}

export function getJson(base, path) {
  return request(base, path, undefined);
}

export function postJson(base, path, payload = {}) {
  return request(base, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
}

function parseHealth(raw) {
  const health = asObject(raw);
  const attempts = asNumber(health.attempts);
  const max = asNumber(health.max_retries);
  return attempts || max ? `${attempts}/${max}` : "";
}

function parseSidecars(raw) {
  return asArray(raw).map(asObject).filter((one) => asText(one.url)).map((one) => ({ name: asText(one.name, "sidecar"), url: asText(one.url) }));
}

function byKindAndName(a, b) {
  return a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "service" ? -1 : b.kind === "service" ? 1 : a.kind.localeCompare(b.kind);
}

export function sortResources(resources) {
  return [...resources].sort(byKindAndName);
}

export function parseResource(raw) {
  const r = asObject(raw);
  return {
    name: asText(r.name, "?"), kind: asText(r.kind), role: asText(r.role), state: asText(r.state, "unknown"),
    phase: asText(r.starting_phase), logs: r.logs_available === true, restarts: asNumber(r.restart_count),
    ports: Object.entries(asObject(r.ports)).map(([key, value]) => `${key} ${asText(value)}`),
    url: asText(r.url), uptime: asText(r.uptime), startup: asText(r.startup_time), image: asText(r.image),
    health: parseHealth(r.health_progress), sidecars: parseSidecars(r.sidecars),
  };
}

function envName(context, configPath) {
  const name = asText(context.display_name) || asText(context.name);
  if (name) return name;
  return configPath.split("/").pop()?.replace(/\.ya?ml$/, "") || "unknown";
}

export function parseDaemonStatus(raw) {
  const body = asObject(raw);
  const context = asObject(body.context);
  const managed = asObject(context.managed_selection);
  const configPath = asText(body.config_path) || asText(context.config_path);
  const selected = managed.active === false ? asText(managed.name) : "";
  return {
    source: "daemon", env: envName(context, configPath), configPath, selected, error: "",
    resources: sortResources(asArray(body.resources).map(parseResource)),
  };
}

export async function loadDaemonStatus(base) {
  return parseDaemonStatus(await getJson(base, "/api/status"));
}

export async function runOrbit(args) {
  try {
    return await exec("orbit", args);
  } catch {
    return exec(`${home()}/.local/bin/orbit`, args);
  }
}

export function instanceArgs(instance, args) {
  return instance ? ["--instance", instance, ...args] : args;
}

export async function orbitJson(args) {
  const ran = await runOrbit(args);
  const text = ran.stdout.trim();
  if (!text) throw new Error(firstLine(ran.stderr) || `orbit ${args.join(" ")} exited ${ran.code}`);
  return asObject(parseJson(text, `orbit ${args.join(" ")}`));
}

function cliError(body) {
  const error = asObject(body.error);
  const message = asText(error.message) || "orbit status failed";
  const hint = asText(error.hint);
  return hint ? `${message}\n${hint}` : message;
}

async function inspectedEnv(instance) {
  const body = await orbitJson(instanceArgs(instance, ["inspect", "--json"])).catch(() => ({}));
  return asText(asObject(asObject(body.data).environment).selected_name);
}

export async function loadCliStatus(instance) {
  const body = await orbitJson(instanceArgs(instance, ["status", "--json"]));
  const data = asObject(body.data);
  const env = asText(asObject(data.environment).selected_name);
  const resources = sortResources(asArray(data.resources).map((raw) => ({ ...parseResource(raw), state: asText(asObject(raw).state) || "stopped" })));
  if (body.ok === true) return { source: "cli", env: env || "unknown", configPath: "", selected: "", error: "", resources };
  return { source: "cli", env: env || (await inspectedEnv(instance)) || "unknown", configPath: "", selected: "", error: cliError(body), resources };
}

export async function loadLogs(base, name) {
  const body = asObject(await getJson(base, `/api/logs/${encodeURIComponent(name)}?lines=${LOG_LINES}`));
  return asArray(body.lines).slice(-LOG_LINES).map((line) => asText(line, JSON.stringify(line)));
}

function parseTraceSummary(raw) {
  const r = asObject(raw);
  return {
    id: asText(r.traceId), rootService: asText(r.rootService, "?"), rootName: asText(r.rootName), start: asNumber(r.startUnixNano),
    durationMs: asNumber(r.durationMs), spanCount: asNumber(r.spanCount), services: asArray(r.services).map((one) => asText(one)),
    status: asText(r.status, "unset"),
  };
}

function parseSpan(raw) {
  const r = asObject(raw);
  return {
    id: asText(r.spanId), parentId: asText(r.parentId), service: asText(r.service, "?"), name: asText(r.name), kind: asText(r.kind),
    start: asNumber(r.startUnixNano), durationMs: asNumber(r.durationMs), status: asText(r.status, "unset"),
    attributes: Object.entries(asObject(r.attributes)).map(([key, value]) => [key, asText(value, JSON.stringify(value))]),
  };
}

export async function loadTraces(base, includeHealth) {
  const query = includeHealth ? `limit=${TRACE_LIMIT}&include_health=1` : `limit=${TRACE_LIMIT}`;
  const body = await getJson(base, `/api/traces?${query}`);
  return asArray(body).slice(0, TRACE_LIMIT).map(parseTraceSummary).filter((one) => one.id);
}

export async function loadTrace(base, id) {
  const body = asObject(await getJson(base, `/api/traces/${encodeURIComponent(id)}`));
  return { ...parseTraceSummary(body), spans: asArray(body.spans).map(parseSpan) };
}

export async function loadTraceLogs(base, id) {
  const body = asObject(await getJson(base, `/api/traces/${encodeURIComponent(id)}/logs`));
  return asArray(body.lines).slice(-LOG_LINES).map(asObject).map((one) => `[${asText(one.service, "?")}] ${asText(one.line)}`);
}

export async function runAction(base, action, name) {
  if (action !== "restart" && action !== "stop") throw new Error(`unknown action ${action}`);
  await postJson(base, `/api/${action}/${encodeURIComponent(name)}`);
}
