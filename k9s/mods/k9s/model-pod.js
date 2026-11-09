import { cpuCores, memoryBytes, sumOf, age } from "./quantity.js";

const ERROR_WORD = /crashloop|backoff|error|oomkilled|failed|evicted|invalid|errimage|configerror|unknown|lost/i;
const PENDING_WORD = /pending|creating|init|terminating|waiting|notready|not ready/i;
const GOOD_WORD = /^(running|ready|succeeded|active|bound)$/i;
const TRANSITIONAL = /pending|terminating|crashloop|backoff|creating|init/i;

export function stateTone(word) {
  if (ERROR_WORD.test(word ?? "")) return "error";
  if (PENDING_WORD.test(word ?? "")) return "warning";
  if (GOOD_WORD.test(word ?? "")) return "success";
  return "subtle";
}

export function isTransitional(word) {
  return TRANSITIONAL.test(word ?? "");
}

function runningState(status, running) {
  const word = status.ready ? "Running" : "Running, not ready";
  return { word, tone: status.ready ? "success" : "warning", detail: "", since: running.startedAt ?? "" };
}

function containerState(status) {
  const state = status?.state ?? {};
  if (state.waiting) {
    const word = state.waiting.reason || "Waiting";
    return { word, tone: stateTone(word), detail: state.waiting.message ?? "", since: "" };
  }
  if (state.terminated) {
    const word = state.terminated.reason || "Terminated";
    return { word, tone: state.terminated.exitCode === 0 ? "subtle" : "error", detail: `exit code ${state.terminated.exitCode}`, since: state.terminated.finishedAt ?? "" };
  }
  if (state.running) return runningState(status, state.running);
  return { word: "Unknown", tone: "subtle", detail: "", since: "" };
}

function lastTermination(status) {
  const done = status?.lastState?.terminated;
  return done ? { reason: done.reason || "Terminated", exitCode: done.exitCode, at: done.finishedAt ?? "" } : null;
}

function metricsFor(metrics, name) {
  const found = (metrics?.containers ?? []).find((one) => one.name === name);
  return found ? { cpu: cpuCores(found.usage?.cpu), memory: memoryBytes(found.usage?.memory) } : { cpu: null, memory: null };
}

function portText(port) {
  return `${port.containerPort}/${port.protocol ?? "TCP"}${port.name ? ` ${port.name}` : ""}`;
}

function containerModel(container, status, metrics, isInit) {
  const usage = metricsFor(metrics, container.name);
  const requests = container.resources?.requests ?? {};
  const limits = container.resources?.limits ?? {};
  return {
    name: container.name, image: container.image ?? "", isInit, state: containerState(status), ready: status?.ready === true,
    restarts: status?.restartCount ?? 0, last: lastTermination(status), ports: (container.ports ?? []).map(portText),
    cpu: { usage: usage.cpu, request: cpuCores(requests.cpu), limit: cpuCores(limits.cpu) },
    memory: { usage: usage.memory, request: memoryBytes(requests.memory), limit: memoryBytes(limits.memory) },
  };
}

function allContainers(pod, metrics) {
  const statuses = new Map([...(pod.status?.initContainerStatuses ?? []), ...(pod.status?.containerStatuses ?? [])].map((one) => [one.name, one]));
  const inits = (pod.spec?.initContainers ?? []).map((one) => containerModel(one, statuses.get(one.name), metrics, true))
    .filter((one) => one.state.word !== "Completed");
  return [...inits, ...(pod.spec?.containers ?? []).map((one) => containerModel(one, statuses.get(one.name), metrics, false))];
}

const WHY_LIMIT = 180;

function clipped(text) {
  return text.length > WHY_LIMIT ? `${text.slice(0, WHY_LIMIT - 1)}\u{2026}` : text;
}

function lastExitText(last) {
  return last ? `last exit ${last.reason} (code ${last.exitCode}) ${age(last.at)} ago` : "";
}

function headline(pod, containers) {
  const restarts = containers.reduce((sum, one) => sum + one.restarts, 0);
  const last = containers.map((one) => one.last).find(Boolean) ?? null;
  if (pod.metadata?.deletionTimestamp) return { word: "Terminating", tone: "warning", pulse: true, why: `deleting since ${age(pod.metadata.deletionTimestamp)}`, restarts };
  const bad = containers.find((one) => one.state.tone === "error") ?? containers.find((one) => one.state.tone === "warning");
  const word = bad?.state.word ?? pod.status?.reason ?? pod.status?.phase ?? "Unknown";
  const main = containers.filter((one) => !one.isInit);
  const readiness = `${main.filter((one) => one.ready).length}/${main.length} containers ready`;
  const why = [bad ? clipped(`${bad.name}: ${bad.state.detail || bad.state.word}`) : clipped(pod.status?.message ?? readiness), lastExitText(last)].filter(Boolean).join(" \u{00b7} ");
  return { word, tone: stateTone(word), pulse: isTransitional(word), why, restarts };
}

function total(containers, resource, field) {
  const values = containers.filter((one) => !one.isInit).map((one) => one[resource][field]);
  if (field === "limit" && values.some((value) => value === null)) return null;
  return sumOf(values);
}

function usageOf(containers, resource) {
  return { usage: total(containers, resource, "usage"), request: total(containers, resource, "request"), limit: total(containers, resource, "limit") };
}

export function conditionsOf(object) {
  return (object.status?.conditions ?? []).map((one) => ({
    type: one.type, ok: one.status === "True", reason: one.reason ?? "", message: one.message ?? "", at: one.lastTransitionTime ?? one.lastUpdateTime ?? "",
  }));
}

function facts(pod, head, owners) {
  const started = pod.status?.startTime;
  return [
    ["Status", pod.status?.phase ?? "-", stateTone(pod.status?.phase)],
    ["Restarts", String(head.restarts), head.restarts >= 10 ? "error" : head.restarts > 0 ? "warning" : "subtle"],
    ["Node", pod.spec?.nodeName ?? "unscheduled"],
    ["Pod IP", pod.status?.podIP ?? "-"],
    ["Controlled by", owners.length > 0 ? owners.map((one) => `${one.kind}/${one.name}`).join(" \u{2192} ") : "-"],
    ["Service account", pod.spec?.serviceAccountName ?? "default"],
    ["QoS class", pod.status?.qosClass ?? "-"],
    ["Started", started ? `${age(started)} ago` : "-"],
  ];
}

export function podModel(pod, metrics, owners) {
  const containers = allContainers(pod, metrics);
  const head = headline(pod, containers);
  return {
    headline: head, facts: facts(pod, head, owners), containers, conditions: conditionsOf(pod),
    usage: { cpu: usageOf(containers, "cpu"), memory: usageOf(containers, "memory") },
  };
}
