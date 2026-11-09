import { exec } from "herdr";
import { readOnlyRefusal, OUTPUT_SELECTOR, OUTPUT_NAMESPACE, OUTPUT_TARGETS } from "./guard.js";

export { readOnlyRefusal };

export const ALL_NAMESPACES = "all";
export const DEFAULT_NAMESPACE = "default";

export const RESOURCES = [
  { key: "pods", label: "pods" },
  { key: "deployments", label: "deploy" },
  { key: "services", label: "svc" },
  { key: "nodes", label: "nodes" },
  { key: "events", label: "events" },
  { key: "ingresses", label: "ing" },
];

const CLUSTER_SCOPED = new Set(["nodes"]);
const LOGGABLE = new Set(["pods", "deployments"]);
const DESCRIBABLE = new Set(["pods", "deployments", "services", "nodes", "ingresses"]);

const ERROR_LIMIT = 2000;
export const LOG_TAIL_LINES = 300;
const TRIAGE_LOG_LINES = 120;
const REQUEST_TIMEOUT = "--request-timeout=8s";
const USER_TIMEOUT = "--request-timeout=20s";
const TARGET_TIMEOUT = "--request-timeout=5s";

export function isClusterScoped(resource) {
  return CLUSTER_SCOPED.has(resource);
}

export function canLog(resource) {
  return LOGGABLE.has(resource);
}

export function canDescribe(resource) {
  return DESCRIBABLE.has(resource);
}

export function isProdContext(context) {
  return /prod/i.test(context ?? "");
}

export function shortContext(context) {
  return (context ?? "").split("/").pop() || context || "";
}

export function firstLine(text) {
  return String(text ?? "").split("\n").find((line) => line.trim() !== "")?.trim() ?? "";
}

export function errorText(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, ERROR_LIMIT);
}

function failure(result) {
  return (result.stderr.trim() || `kubectl exited with ${result.code}`).slice(0, ERROR_LIMIT);
}

export async function kubectl(argv) {
  const refusal = readOnlyRefusal(argv);
  if (refusal) return { ok: false, stdout: "", error: refusal };
  try {
    const result = await exec("kubectl", argv.slice(1));
    return result.code === 0
      ? { ok: true, stdout: result.stdout, stderr: result.stderr, error: "" }
      : { ok: false, stdout: result.stdout, error: failure(result) };
  } catch (error) {
    return { ok: false, stdout: "", error: `kubectl did not run: ${errorText(error)}` };
  }
}

function contextFlags(context) {
  return context ? [`--context=${context}`] : [];
}

function namespaceFlags(scope) {
  if (CLUSTER_SCOPED.has(scope.resource)) return [];
  if (scope.namespace === ALL_NAMESPACES) return ["--all-namespaces"];
  return [`--namespace=${scope.namespace}`];
}

export function hasNamespaceColumn(scope) {
  return scope.namespace === ALL_NAMESPACES && !CLUSTER_SCOPED.has(scope.resource);
}

export function listArgv(scope, isUser) {
  const sort = scope.resource === "events" ? ["--sort-by=.lastTimestamp"] : [];
  const timeout = isUser || scope.namespace === ALL_NAMESPACES ? USER_TIMEOUT : REQUEST_TIMEOUT;
  return ["kubectl", "get", scope.resource, ...contextFlags(scope.context), ...namespaceFlags(scope), ...sort, timeout];
}

export function contextsArgv() {
  return ["kubectl", "config", "get-contexts", "--output=name"];
}

export function currentContextArgv() {
  return ["kubectl", "config", "current-context"];
}

export function namespacesArgv(context) {
  return ["kubectl", "get", "namespaces", ...contextFlags(context), "--output=name", REQUEST_TIMEOUT];
}

export function defaultNamespaceArgv(context) {
  return ["kubectl", "config", "view", "--minify", ...contextFlags(context), OUTPUT_NAMESPACE];
}

export function parseNamespaces(stdout) {
  return stdout.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("namespace/"))
    .map((line) => line.slice("namespace/".length))
    .sort();
}

export function parseTable(stdout, withNamespace) {
  const [header = "", ...lines] = stdout.split("\n").filter((line) => line.trim() !== "");
  const rows = lines.map((line) => {
    const [first = "", second = ""] = line.trim().split(/\s+/);
    const namespace = withNamespace ? first : null;
    const name = withNamespace ? second : first;
    return { id: `${namespace ?? ""}/${name}`, name, namespace, line };
  });
  return { header, rows };
}

export function rowNamespaceOf(scope, row) {
  if (CLUSTER_SCOPED.has(scope.resource)) return undefined;
  return row.namespace ?? (scope.namespace === ALL_NAMESPACES ? undefined : scope.namespace);
}

function rowFlags(scope, row) {
  const namespace = row.namespace ?? (scope.namespace === ALL_NAMESPACES ? undefined : scope.namespace);
  const nsFlags = CLUSTER_SCOPED.has(scope.resource) || !namespace ? [] : [`--namespace=${namespace}`];
  return { namespace, common: [...contextFlags(scope.context), ...nsFlags] };
}

function logTarget(scope, row) {
  return scope.resource === "pods" ? row.name : `deployment/${row.name}`;
}

export function detailArgv(scope, kind, row) {
  const { common } = rowFlags(scope, row);
  if (kind === "logs") {
    if (!LOGGABLE.has(scope.resource)) return null;
    return ["kubectl", "logs", logTarget(scope, row), ...common, `--tail=${LOG_TAIL_LINES}`, "--all-containers", "--prefix"];
  }
  if (!DESCRIBABLE.has(scope.resource)) return null;
  if (kind === "describe") return ["kubectl", "describe", scope.resource, row.name, ...common];
  return ["kubectl", "get", scope.resource, row.name, ...common, "--output=yaml"];
}

export function triageCommands(scope, row) {
  const { namespace, common } = rowFlags(scope, row);
  const commands = [];
  if (DESCRIBABLE.has(scope.resource)) {
    commands.push({ title: "describe", argv: ["kubectl", "describe", scope.resource, row.name, ...common], keep: "head", isOptional: false });
  }
  if (LOGGABLE.has(scope.resource)) {
    const logs = ["kubectl", "logs", logTarget(scope, row), ...common, `--tail=${TRIAGE_LOG_LINES}`, "--all-containers", "--prefix"];
    commands.push({ title: `logs (last ${TRIAGE_LOG_LINES} lines)`, argv: logs, keep: "tail", isOptional: false });
    if (scope.resource === "pods") commands.push({ title: "logs of the previous container", argv: [...logs, "--previous"], keep: "tail", isOptional: true });
  }
  if (!CLUSTER_SCOPED.has(scope.resource) && namespace) {
    const events = ["kubectl", "get", "events", ...common, `--field-selector=involvedObject.name=${row.name}`, "--sort-by=.lastTimestamp"];
    commands.push({ title: "events", argv: events, keep: "tail", isOptional: true });
  }
  return commands;
}


export function targetsArgv(context, namespace) {
  const where = namespace ? [`--namespace=${namespace}`] : ["--all-namespaces"];
  return ["kubectl", "get", "deployments,statefulsets", ...contextFlags(context), ...where, "--no-headers", OUTPUT_TARGETS, TARGET_TIMEOUT];
}

export function selectorArgv(context, namespace, kind, name) {
  return ["kubectl", "get", kind, name, ...contextFlags(context), `--namespace=${namespace}`, OUTPUT_SELECTOR, TARGET_TIMEOUT];
}

export function parseSelector(stdout) {
  try {
    const labels = JSON.parse(stdout);
    const pairs = Object.entries(labels ?? {}).filter(([, value]) => typeof value === "string").map(([key, value]) => `${key}=${value}`);
    return pairs.length > 0 ? pairs.join(",") : null;
  } catch {
    return null;
  }
}

export async function readContexts() {
  const ran = await kubectl(contextsArgv());
  if (!ran.ok) return { contexts: [], error: firstLine(ran.error) };
  return { contexts: ran.stdout.split("\n").map((line) => line.trim()).filter(Boolean), error: "" };
}

export async function defaultNamespace(context) {
  const ran = await kubectl(defaultNamespaceArgv(context));
  return (ran.ok && ran.stdout.trim().split(/\s+/)[0]) || DEFAULT_NAMESPACE;
}

export async function currentScope() {
  const ran = await kubectl(currentContextArgv());
  if (!ran.ok) return { error: firstLine(ran.error) };
  const context = ran.stdout.trim();
  return { context, namespace: await defaultNamespace(context) };
}
