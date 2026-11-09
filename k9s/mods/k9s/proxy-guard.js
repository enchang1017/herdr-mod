const SAFE_CONTEXT = /^[A-Za-z0-9@%+=:,./_-]+$/;
const SEGMENT = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const FORBIDDEN_SEGMENTS = new Set(["exec", "attach", "portforward", "proxy", "binding", "eviction", "token", "ephemeralcontainers"]);
const CORE_RESOURCES = new Set(["pods", "services", "events"]);
const GROUP_RESOURCES = {
  "apps/v1": new Set(["deployments", "statefulsets"]),
  "networking.k8s.io/v1": new Set(["ingresses"]),
};
const QUERY_RULES = {
  limit: /^\d{1,4}$/,
  tailLines: /^\d{1,5}$/,
  continue: /^[A-Za-z0-9_=+/-]{1,4096}$/,
  includeObject: /^(Object|Metadata)$/,
  container: SEGMENT,
  labelSelector: /^[A-Za-z0-9._/=,-]{1,1024}$/,
};

export const PROXY_HOST = "127.0.0.1";
export const METRICS_GROUP = "metrics.k8s.io";
export const METRICS_VERSION = "v1beta1";

export const PROXY_FLAGS = Object.freeze([
  `--address=${PROXY_HOST}`,
  "--port=0",
  "--reject-methods=^(POST|PUT|PATCH|DELETE|CONNECT|OPTIONS|TRACE)$",
  "--accept-paths=^/version/?$,^/api/v1/(nodes|namespaces)(/[^/]+)?$,^/api/v1/(namespaces/[^/]+/)?(pods|services|events)(/[^/]+)?$,^/api/v1/namespaces/[^/]+/pods/[^/]+/log$,^/apis/apps/v1/(namespaces/[^/]+/)?(deployments|statefulsets)(/[^/]+)?$,^/apis/networking\\.k8s\\.io/v1/(namespaces/[^/]+/)?ingresses(/[^/]+)?$,^/apis/metrics\\.k8s\\.io/v1beta1/(namespaces/[^/]+/)?pods(/[^/]+)?$,^/apis/metrics\\.k8s\\.io/v1beta1/nodes(/[^/]+)?$",
  "--reject-paths=^/api/.*/pods/.*/exec,^/api/.*/pods/.*/attach,^/api/.*/pods/.*/portforward,/proxy(/|$)",
]);

export function proxyArgv(context) {
  return ["kubectl", "proxy", `--context=${context}`, ...PROXY_FLAGS];
}

export function proxyStartRefusal(argv) {
  if (!Array.isArray(argv) || argv.length !== PROXY_FLAGS.length + 3) return "k9s refused: proxy argv has the wrong shape";
  const [binary, verb, contextFlag, ...flags] = argv;
  if (binary !== "kubectl" || verb !== "proxy") return "k9s refused: only kubectl proxy may run as a helper";
  const context = String(contextFlag).startsWith("--context=") ? contextFlag.slice("--context=".length) : "";
  if (!SAFE_CONTEXT.test(context)) return `k9s refused proxy context: ${JSON.stringify(contextFlag)}`;
  const isExact = flags.every((flag, index) => flag === PROXY_FLAGS[index]);
  return isExact ? null : "k9s refused: proxy flags differ from the read-only set";
}

function namespacedTail(rest, isAllowed) {
  if (rest[0] !== "namespaces") return isAllowed(rest);
  if (rest.length === 1 || rest.length === 2) return true;
  return isAllowed(rest.slice(2));
}

function coreAllowed(rest) {
  const [resource, name, sub, ...more] = rest;
  if (more.length > 0) return false;
  if (resource === "nodes") return sub === undefined;
  if (!CORE_RESOURCES.has(resource)) return false;
  if (sub === undefined) return true;
  return resource === "pods" && name !== undefined && sub === "log";
}

function groupAllowed(resources) {
  return (rest) => rest.length >= 1 && rest.length <= 2 && resources.has(rest[0]);
}

function metricsAllowed(rest) {
  const [first, namespace, resource] = rest;
  if (first === "nodes" || first === "pods") return rest.length <= 2;
  return first === "namespaces" && namespace !== undefined && resource === "pods" && rest.length <= 4;
}

function pathAllowed(segments) {
  const [root, ...rest] = segments;
  if (root === "version") return rest.length === 0;
  if (root === "apis" && rest[0] === METRICS_GROUP && rest[1] === METRICS_VERSION) return rest.length > 2 && metricsAllowed(rest.slice(2));
  if (root === "api") return rest[0] === "v1" && rest.length > 1 && namespacedTail(rest.slice(1), coreAllowed);
  if (root !== "apis" || rest.length < 3) return false;
  const resources = GROUP_RESOURCES[`${rest[0]}/${rest[1]}`];
  return Boolean(resources) && namespacedTail(rest.slice(2), groupAllowed(resources));
}

function pathRefusal(path) {
  if (typeof path !== "string" || !path.startsWith("/")) return "k9s refused API path: must start with /";
  const segments = path.slice(1).split("/");
  const bad = segments.find((one) => !SEGMENT.test(one) || FORBIDDEN_SEGMENTS.has(one));
  if (bad !== undefined) return `k9s refused API path segment: ${JSON.stringify(bad)}`;
  return pathAllowed(segments) ? null : `k9s refused API path: ${path}`;
}

function queryRefusal(query) {
  const bad = Object.entries(query ?? {}).find(([key, value]) => !QUERY_RULES[key] || typeof value !== "string" || !QUERY_RULES[key].test(value));
  return bad ? `k9s refused API query: ${bad[0]}` : null;
}

export function requestRefusal(request, knownContexts) {
  if (request.method !== "GET") return `k9s is read-only, refused method: ${String(request.method)}`;
  if (!knownContexts.has(request.context)) return `k9s refused unknown context: ${String(request.context)}`;
  if (!Number.isInteger(request.port) || request.port < 1024 || request.port > 65535) return "k9s refused proxy port";
  return pathRefusal(request.path) ?? queryRefusal(request.query);
}
