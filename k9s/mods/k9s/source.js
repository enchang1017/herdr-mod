import {
  kubectl, listArgv, namespacesArgv, detailArgv, targetsArgv, defaultNamespace, hasNamespaceColumn, isClusterScoped, rowNamespaceOf,
  firstLine, ALL_NAMESPACES, LOG_TAIL_LINES,
} from "./kubectl.js";
import { apiGet, apiJson, tablePages, collectionPath, objectPath } from "./api.js";
import { tablesToText, emptyNotice, tableTargets } from "./api-table.js";
import { toYaml, withoutManagedFields } from "./api-yaml.js";
import { logsSnapshot } from "./api-logs.js";

const LIST_TIMEOUT_MS = 8_000;
const USER_TIMEOUT_MS = 20_000;
const DETAIL_TIMEOUT_MS = 30_000;
const TARGET_TIMEOUT_MS = 5_000;
const KINDS = { Deployment: "deployment", StatefulSet: "statefulset" };

async function viaKubectl(argv) {
  return { ...(await kubectl(argv)), via: "kubectl" };
}

function listNamespace(scope) {
  if (isClusterScoped(scope.resource) || scope.namespace === ALL_NAMESPACES) return null;
  return scope.namespace;
}

async function listViaProxy(pool, cx, scope, isUser) {
  const namespace = listNamespace(scope);
  const path = collectionPath(scope.resource, namespace);
  if (!path) return null;
  const isSorted = scope.resource === "events";
  const timeoutMs = isUser || scope.namespace === ALL_NAMESPACES ? USER_TIMEOUT_MS : LIST_TIMEOUT_MS;
  const got = await tablePages(pool, cx, { context: scope.context, path, query: isSorted ? { includeObject: "Object" } : {}, timeoutMs });
  if (got.fallback) return null;
  if (!got.ok) return { ok: false, stdout: "", error: got.error, via: "proxy" };
  const stdout = tablesToText(got.tables, hasNamespaceColumn(scope), isSorted ? "lastTimestamp" : null);
  return { ok: true, stdout, stderr: stdout ? "" : emptyNotice(namespace), error: "", via: "proxy" };
}

export async function listResources(pool, cx, scope, isUser) {
  return (await listViaProxy(pool, cx, scope, isUser)) ?? viaKubectl(listArgv(scope, isUser));
}

export async function listNamespaces(pool, cx, context) {
  const got = await apiJson(pool, cx, { context, path: collectionPath("namespaces", null), timeoutMs: LIST_TIMEOUT_MS });
  if (got.fallback) return viaKubectl(namespacesArgv(context));
  if (!got.ok) return { ok: false, stdout: "", error: got.error, via: "proxy" };
  const names = (got.value.items ?? []).map((item) => item.metadata?.name).filter(Boolean);
  return { ok: true, stdout: names.map((name) => `namespace/${name}`).join("\n"), error: "", via: "proxy" };
}

async function yamlViaProxy(pool, cx, scope, namespace, name) {
  const got = await apiJson(pool, cx, { context: scope.context, path: objectPath(scope.resource, namespace ?? null, name), timeoutMs: DETAIL_TIMEOUT_MS });
  if (!got.ok) return got;
  return { ok: true, stdout: toYaml(withoutManagedFields(got.value)) };
}

function logsViaProxy(pool, cx, scope, namespace, name) {
  if (!namespace) return { fallback: true };
  const get = (request) => apiGet(pool, cx, { context: scope.context, timeoutMs: DETAIL_TIMEOUT_MS, ...request });
  const getJson = (request) => apiJson(pool, cx, { context: scope.context, timeoutMs: DETAIL_TIMEOUT_MS, ...request });
  return logsSnapshot(get, getJson, scope.resource, namespace, name, LOG_TAIL_LINES);
}

export async function detailText(pool, cx, scope, kind, row) {
  const argv = detailArgv(scope, kind, row);
  if (!argv) return null;
  if (kind === "describe") return viaKubectl(argv);
  const namespace = rowNamespaceOf(scope, row);
  const got = kind === "yaml" ? await yamlViaProxy(pool, cx, scope, namespace, row.name) : await logsViaProxy(pool, cx, scope, namespace, row.name);
  if (got.fallback) return viaKubectl(argv);
  return got.ok ? { ok: true, stdout: got.stdout, error: "", via: "proxy" } : { ok: false, stdout: "", error: got.error, via: "proxy" };
}

function count(cell) {
  const value = Number(cell);
  return Number.isFinite(value) ? value : 0;
}

export function parseTargets(stdout, context, namespaceByDefault) {
  return stdout.split("\n").flatMap((line) => {
    const [namespace = "", name = "", kindName = "", ready, desired] = line.trim().split(/\s+/);
    const kind = KINDS[kindName];
    if (!namespace || !name || !kind) return [];
    return [{ context, namespace, name, kind, ready: count(ready), desired: count(desired), isDefaultNamespace: namespace === namespaceByDefault }];
  });
}

async function targetsOf(pool, cx, context, namespace, namespaceByDefault) {
  const kinds = [["deployments", "deployment"], ["statefulsets", "statefulset"]];
  const results = await Promise.all(kinds.map(([resource]) => tablePages(pool, cx, { context, path: collectionPath(resource, namespace), timeoutMs: TARGET_TIMEOUT_MS })));
  const failed = results.find((one) => !one.ok);
  if (failed) return failed;
  return { ok: true, targets: results.flatMap((one, index) => tableTargets(one.tables, kinds[index][1], context, namespaceByDefault)) };
}

async function indexViaProxy(pool, cx, context, namespace) {
  if (!pool?.runningPort(context)) return null;
  const everywhere = await targetsOf(pool, cx, context, null, namespace);
  const got = !everywhere.ok && /forbidden/i.test(everywhere.error ?? "") ? await targetsOf(pool, cx, context, namespace, namespace) : everywhere;
  if (got.fallback) return null;
  return got.ok ? { targets: got.targets } : { error: firstLine(got.error) || "unreachable" };
}

export async function indexContext(pool, cx, context) {
  const namespace = await defaultNamespace(context);
  const proxied = await indexViaProxy(pool, cx, context, namespace);
  if (proxied) return proxied;
  const everywhere = await kubectl(targetsArgv(context));
  const ran = !everywhere.ok && /forbidden/i.test(everywhere.error) ? await kubectl(targetsArgv(context, namespace)) : everywhere;
  return ran.ok ? { targets: parseTargets(ran.stdout, context, namespace) } : { error: firstLine(ran.error) || "unreachable" };
}
