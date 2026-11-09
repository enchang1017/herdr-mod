import { kubectl, rowNamespaceOf, isClusterScoped, firstLine, errorText } from "./kubectl.js";
import { apiJson, objectPath } from "./api.js";
import { METRICS_GROUP, METRICS_VERSION } from "./proxy-guard.js";
import { WORKLOAD_KINDS } from "./write-guard.js";

const TIMEOUT_MS = 15_000;
const TIMEOUT_FLAG = "--request-timeout=15s";
const NO_METRICS_SERVER = /could not find the requested resource|metrics api not available|ServiceUnavailable|the server is currently unable/i;
const SINGULAR = { pods: "pod", deployments: "deployment", services: "service", nodes: "node", ingresses: "ingress" };

function scopeFlags(context, namespace) {
  return [`--context=${context}`, ...(namespace ? [`--namespace=${namespace}`] : [])];
}

function parsed(ran) {
  if (!ran.ok) return { ok: false, error: firstLine(ran.error) || ran.error };
  try {
    return { ok: true, value: JSON.parse(ran.stdout), via: "kubectl" };
  } catch (error) {
    return { ok: false, error: `Unreadable kubectl answer: ${errorText(error)}` };
  }
}

async function kubectlJson(context, namespace, args) {
  return parsed(await kubectl(["kubectl", "get", ...args, ...scopeFlags(context, namespace), "--output=json", TIMEOUT_FLAG]));
}

async function getObject(pool, cx, context, resource, namespace, name) {
  const path = objectPath(resource, namespace, name);
  const got = path ? await apiJson(pool, cx, { context, path, timeoutMs: TIMEOUT_MS }) : { fallback: true };
  if (!got.fallback) return { ...got, via: "proxy" };
  return kubectlJson(context, namespace, [resource, name]);
}

function metricsPath(resource, namespace, name) {
  const base = `/apis/${METRICS_GROUP}/${METRICS_VERSION}`;
  return resource === "nodes" ? `${base}/nodes/${name}` : `${base}/namespaces/${namespace}/pods/${name}`;
}

function topLines(stdout) {
  return stdout.split("\n").map((line) => line.trim().split(/\s+/)).filter((cells) => cells.length >= 3);
}

function fromTop(resource, stdout) {
  const lines = topLines(stdout);
  if (resource === "nodes") return lines[0] ? { usage: { cpu: lines[0][1], memory: lines[0][3] } } : null;
  return { containers: lines.map((cells) => ({ name: cells[1], usage: { cpu: cells[2], memory: cells[3] } })) };
}

async function getMetrics(pool, cx, context, resource, namespace, name) {
  const got = await apiJson(pool, cx, { context, path: metricsPath(resource, namespace, name), timeoutMs: TIMEOUT_MS });
  if (!got.fallback) return got.ok ? got : { ok: false, error: got.error, missing: NO_METRICS_SERVER.test(got.error ?? "") };
  const argv = resource === "nodes"
    ? ["kubectl", "top", "node", name, ...scopeFlags(context, null), "--no-headers", TIMEOUT_FLAG]
    : ["kubectl", "top", "pod", name, ...scopeFlags(context, namespace), "--containers", "--no-headers", TIMEOUT_FLAG];
  const ran = await kubectl(argv);
  if (!ran.ok) return { ok: false, error: firstLine(ran.error), missing: NO_METRICS_SERVER.test(ran.error) };
  return { ok: true, value: fromTop(resource, ran.stdout) };
}

async function getEvents(context, resource, namespace, name) {
  const where = isClusterScoped(resource) ? "default" : namespace;
  return kubectlJson(context, where, ["events", `--field-selector=involvedObject.name=${name}`]);
}

function controllerOf(object) {
  return (object?.metadata?.ownerReferences ?? []).find((one) => one.controller) ?? null;
}

async function ownerChain(pool, cx, context, namespace, pod) {
  const first = controllerOf(pod);
  if (!first) return { owners: [], workload: null };
  const owners = [{ kind: first.kind, name: first.name }];
  if (first.kind !== "ReplicaSet") return { owners, workload: await workloadOf(pool, cx, context, namespace, first.kind, first.name) };
  const replicaSet = await kubectlJson(context, namespace, ["replicaset", first.name]);
  const top = replicaSet.ok ? controllerOf(replicaSet.value) : null;
  if (!top) return { owners, workload: null };
  return { owners: [...owners, { kind: top.kind, name: top.name }], workload: await workloadOf(pool, cx, context, namespace, top.kind, top.name) };
}

async function workloadOf(pool, cx, context, namespace, kind, name) {
  const lower = kind.toLowerCase();
  if (!WORKLOAD_KINDS.includes(lower)) return null;
  const got = await getObject(pool, cx, context, `${lower}s`, namespace, name);
  return got.ok ? { kind: lower, name, replicas: got.value.spec?.replicas ?? 0 } : { kind: lower, name, replicas: null };
}

function selectorOf(object) {
  const pairs = Object.entries(object.spec?.selector?.matchLabels ?? {}).map(([key, value]) => `${key}=${value}`);
  return pairs.length > 0 && (object.spec?.selector?.matchExpressions ?? []).length === 0 ? pairs.join(",") : null;
}

async function replicaSetsOf(context, namespace, deployment) {
  const selector = selectorOf(deployment);
  if (!selector) return [];
  const got = await kubectlJson(context, namespace, ["replicasets", `--selector=${selector}`]);
  const uid = deployment.metadata?.uid;
  return got.ok ? (got.value.items ?? []).filter((one) => (one.metadata?.ownerReferences ?? []).some((ref) => ref.uid === uid)) : [];
}

async function extrasFor(pool, cx, scope, namespace, object) {
  const { resource, context } = scope;
  const name = object.metadata?.name;
  const wantsMetrics = resource === "pods" || resource === "nodes";
  const [metrics, events, chain, replicaSets] = await Promise.all([
    wantsMetrics ? getMetrics(pool, cx, context, resource, namespace, name) : null,
    getEvents(context, resource, namespace, name),
    resource === "pods" ? ownerChain(pool, cx, context, namespace, object) : { owners: [], workload: null },
    resource === "deployments" ? replicaSetsOf(context, namespace, object) : [],
  ]);
  const workload = resource === "deployments" ? { kind: "deployment", name, replicas: object.spec?.replicas ?? 0 } : chain.workload;
  return { metrics, events, owners: chain.owners, workload, replicaSets };
}

export function overviewKey(scope, row) {
  return `${scope.context}|${scope.resource}|${row.id}`;
}

export function hasOverview(resource) {
  return resource in SINGULAR;
}

export async function loadOverview(pool, cx, scope, row) {
  const namespace = rowNamespaceOf(scope, row);
  const got = await getObject(pool, cx, scope.context, scope.resource, namespace ?? null, row.name);
  if (!got.ok) return { error: got.error ?? "Not found", via: got.via };
  const extras = await extrasFor(pool, cx, scope, namespace, got.value);
  return { object: got.value, namespace, via: got.via, ...extras };
}
