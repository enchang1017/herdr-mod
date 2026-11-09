import { k9sSettings } from "./settings.js";

const POD_SUFFIX = /-[a-z0-9]{6,10}-[a-z0-9]{5}$/;
const SHORT_SUFFIX = /-([a-z0-9]{5}|\d+)$/;

export function lokiTarget(context, namespace) {
  if (typeof context !== "string" || !context) return null;
  const { targets } = k9sSettings().grafana;
  return targets.find((one) => one.pattern.test(context) && (!one.namespace || one.namespace === namespace)) ?? null;
}

export function workloadName(resource, name) {
  if (resource !== "pods") return name;
  if (POD_SUFFIX.test(name)) return name.replace(POD_SUFFIX, "");
  return name.replace(SHORT_SUFFIX, "");
}

export function serviceSelector(namespace, workload) {
  return k9sSettings().grafana.serviceNamespaces.includes(namespace)
    ? `{service_name="${namespace}/${workload}"}`
    : `{service_name=~".*/${workload}"}`;
}

export function lokiExploreUrl(context, namespace, resource, name) {
  const target = lokiTarget(context, namespace);
  if (!target) return null;
  const expr = serviceSelector(namespace, workloadName(resource, name));
  const panes = {
    a: {
      datasource: target.lokiUid,
      queries: [{ refId: "A", expr, queryType: "range", datasource: { type: "loki", uid: target.lokiUid } }],
      range: { from: "now-1h", to: "now" },
    },
  };
  return `${target.url}/explore?schemaVersion=1&orgId=1&panes=${encodeURIComponent(JSON.stringify(panes))}`;
}

export function lokiHost(context, namespace) {
  return lokiTarget(context, namespace)?.url.replace(/^https?:\/\//, "") ?? null;
}
