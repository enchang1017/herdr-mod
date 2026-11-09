import { cpuCores, memoryBytes, formatCpu, formatMemory, age } from "./quantity.js";
import { conditionsOf, stateTone } from "./model-pod.js";

const REVISION = "deployment.kubernetes.io/revision";
const ROLE_PREFIX = "node-role.kubernetes.io/";
const NODE_PROBLEMS = new Set(["MemoryPressure", "DiskPressure", "PIDPressure", "NetworkUnavailable"]);

function labelsText(labels) {
  const pairs = Object.entries(labels ?? {}).map(([key, value]) => `${key}=${value}`);
  return pairs.length > 0 ? pairs.join(", ") : "-";
}

function workloadHeadline(desired, ready, isPaused) {
  if (isPaused) return { word: "Paused", tone: "warning", pulse: false, why: "rollout paused" };
  if (desired === 0) return { word: "Scaled to zero", tone: "subtle", pulse: false, why: "0 replicas wanted" };
  if (ready >= desired) return { word: "Available", tone: "success", pulse: false, why: `${ready}/${desired} ready` };
  if (ready === 0) return { word: "Unavailable", tone: "error", pulse: false, why: `0/${desired} ready` };
  return { word: "Progressing", tone: "warning", pulse: true, why: `${ready}/${desired} ready` };
}

function strategyText(spec) {
  const strategy = spec.strategy ?? spec.updateStrategy ?? {};
  const rolling = strategy.rollingUpdate;
  if (!rolling) return strategy.type ?? "-";
  const parts = [rolling.maxSurge !== undefined ? `surge ${rolling.maxSurge}` : "", rolling.maxUnavailable !== undefined ? `unavailable ${rolling.maxUnavailable}` : ""];
  return `${strategy.type ?? "RollingUpdate"} (${parts.filter(Boolean).join(", ")})`;
}

function rolloutRows(replicaSets) {
  return [...replicaSets]
    .map((one) => ({
      revision: Number(one.metadata?.annotations?.[REVISION] ?? 0), name: one.metadata?.name ?? "",
      images: (one.spec?.template?.spec?.containers ?? []).map((c) => c.image).join(", "),
      replicas: one.status?.replicas ?? 0, ready: one.status?.readyReplicas ?? 0, created: one.metadata?.creationTimestamp ?? "",
    }))
    .sort((a, b) => b.revision - a.revision)
    .slice(0, 5);
}

export function workloadModel(object, replicaSets) {
  const spec = object.spec ?? {};
  const status = object.status ?? {};
  const desired = spec.replicas ?? 1;
  const ready = status.readyReplicas ?? 0;
  return {
    headline: workloadHeadline(desired, ready, spec.paused === true),
    replicas: { desired, bars: [["Ready", ready], ["Updated", status.updatedReplicas ?? 0], ["Available", status.availableReplicas ?? 0]] },
    facts: [
      ["Strategy", strategyText(spec)], ["Selector", labelsText(spec.selector?.matchLabels)],
      ["Generation", `${status.observedGeneration ?? "-"} / ${object.metadata?.generation ?? "-"}`], ["Created", `${age(object.metadata?.creationTimestamp)} ago`],
    ],
    images: (spec.template?.spec?.containers ?? []).map((one) => ({ name: one.name, image: one.image ?? "" })),
    conditions: conditionsOf(object), rollouts: rolloutRows(replicaSets ?? []),
  };
}

function servicePorts(spec) {
  return (spec.ports ?? []).map((one) => `${one.name ? `${one.name} ` : ""}${one.port}\u{2192}${one.targetPort ?? one.port}/${one.protocol ?? "TCP"}${one.nodePort ? ` node ${one.nodePort}` : ""}`);
}

export function serviceModel(object) {
  const spec = object.spec ?? {};
  const ingress = (object.status?.loadBalancer?.ingress ?? []).map((one) => one.hostname ?? one.ip).filter(Boolean);
  return {
    headline: { word: spec.type ?? "ClusterIP", tone: "success", pulse: false, why: `${(spec.ports ?? []).length} port(s)` },
    facts: [
      ["Type", spec.type ?? "ClusterIP"], ["Cluster IP", (spec.clusterIPs ?? [spec.clusterIP]).filter(Boolean).join(", ") || "-"],
      ["External", [...(spec.externalIPs ?? []), ...ingress].join(", ") || "-"], ["Selector", labelsText(spec.selector)],
      ["Session affinity", spec.sessionAffinity ?? "None"], ["Created", `${age(object.metadata?.creationTimestamp)} ago`],
    ],
    lists: [["Ports", servicePorts(spec)]],
  };
}

function backendText(backend) {
  const service = backend?.service;
  if (!service) return backend?.resource ? `${backend.resource.kind}/${backend.resource.name}` : "-";
  return `${service.name}:${service.port?.number ?? service.port?.name ?? "?"}`;
}

export function ingressModel(object) {
  const spec = object.spec ?? {};
  const routes = (spec.rules ?? []).flatMap((rule) => (rule.http?.paths ?? []).map((path) => `${rule.host ?? "*"}${path.path ?? "/"} \u{2192} ${backendText(path.backend)}`));
  const address = (object.status?.loadBalancer?.ingress ?? []).map((one) => one.hostname ?? one.ip).filter(Boolean);
  return {
    headline: { word: address.length > 0 ? "Routed" : "No address", tone: address.length > 0 ? "success" : "warning", pulse: address.length === 0, why: `${routes.length} route(s)` },
    facts: [
      ["Class", spec.ingressClassName ?? object.metadata?.annotations?.["kubernetes.io/ingress.class"] ?? "-"], ["Address", address.join(", ") || "-"],
      ["Default backend", spec.defaultBackend ? backendText(spec.defaultBackend) : "-"], ["Created", `${age(object.metadata?.creationTimestamp)} ago`],
    ],
    lists: [["Routes", routes], ["TLS hosts", (spec.tls ?? []).flatMap((one) => one.hosts ?? [])]],
  };
}

function nodeRoles(labels) {
  const roles = Object.keys(labels ?? {}).filter((key) => key.startsWith(ROLE_PREFIX)).map((key) => key.slice(ROLE_PREFIX.length));
  return roles.length > 0 ? roles.join(", ") : "worker";
}

function nodeHeadline(object, conditions) {
  const ready = conditions.find((one) => one.type === "Ready");
  const pressure = conditions.filter((one) => !one.ok).map((one) => one.type);
  const word = ready?.ok ? (object.spec?.unschedulable ? "Ready, cordoned" : "Ready") : "NotReady";
  return { word, tone: ready?.ok ? (pressure.length > 0 || object.spec?.unschedulable ? "warning" : "success") : "error", pulse: false, why: pressure.join(", ") || ready?.message || "" };
}

export function nodeModel(object, metrics) {
  const status = object.status ?? {};
  const info = status.nodeInfo ?? {};
  const conditions = conditionsOf(object).map((one) => (NODE_PROBLEMS.has(one.type) ? { ...one, ok: !one.ok } : one));
  const allocatable = status.allocatable ?? {};
  const capacity = status.capacity ?? {};
  const internal = (status.addresses ?? []).find((one) => one.type === "InternalIP")?.address ?? "-";
  return {
    headline: nodeHeadline(object, conditions),
    facts: [
      ["Roles", nodeRoles(object.metadata?.labels)], ["Internal IP", internal], ["Kubelet", info.kubeletVersion ?? "-"], ["Runtime", info.containerRuntimeVersion ?? "-"],
      ["OS image", info.osImage ?? "-"], ["Kernel", info.kernelVersion ?? "-"],
      ["CPU cap / alloc", `${formatCpu(cpuCores(capacity.cpu))} / ${formatCpu(cpuCores(allocatable.cpu))}`],
      ["Memory cap / alloc", `${formatMemory(memoryBytes(capacity.memory))} / ${formatMemory(memoryBytes(allocatable.memory))}`],
      ["Pods", `${allocatable.pods ?? "-"} allocatable`], ["Created", `${age(object.metadata?.creationTimestamp)} ago`],
    ],
    usage: {
      cpu: { usage: metrics ? cpuCores(metrics.usage?.cpu) : null, request: null, limit: cpuCores(allocatable.cpu), limitWord: "allocatable" },
      memory: { usage: metrics ? memoryBytes(metrics.usage?.memory) : null, request: null, limit: memoryBytes(allocatable.memory), limitWord: "allocatable" },
    },
    conditions,
    lists: [["Taints", (object.spec?.taints ?? []).map((one) => `${one.key}${one.value ? `=${one.value}` : ""}:${one.effect}`)]],
  };
}

export function eventRows(list) {
  return [...(list?.items ?? [])]
    .map((one) => ({
      type: one.type ?? "Normal", reason: one.reason ?? "", message: one.message ?? "", count: one.count ?? one.series?.count ?? 1,
      at: one.lastTimestamp ?? one.eventTime ?? one.metadata?.creationTimestamp ?? "", source: one.source?.component ?? one.reportingComponent ?? "",
      tone: one.type === "Warning" ? "warning" : "subtle",
    }))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export { stateTone };
