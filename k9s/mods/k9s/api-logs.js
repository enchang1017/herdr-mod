import { objectPath, collectionPath, TEXT_ACCEPT } from "./api.js";

const PHASE_RANK = { Running: 0, Unknown: 1, Pending: 2 };

function isReady(pod) {
  return (pod.status?.conditions ?? []).some((one) => one.type === "Ready" && one.status === "True");
}

function readySince(pod) {
  return (pod.status?.conditions ?? []).find((one) => one.type === "Ready")?.lastTransitionTime ?? "";
}

function maxRestarts(pod) {
  return Math.max(0, ...(pod.status?.containerStatuses ?? []).map((one) => one.restartCount ?? 0));
}

function olderFirst(a, b) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}

export function compareForLogging(a, b) {
  const assignedA = Boolean(a.spec?.nodeName);
  const assignedB = Boolean(b.spec?.nodeName);
  if (a.spec?.nodeName !== b.spec?.nodeName && assignedA !== assignedB) return assignedA ? -1 : 1;
  const phase = (PHASE_RANK[a.status?.phase] ?? 0) - (PHASE_RANK[b.status?.phase] ?? 0);
  if (phase !== 0) return phase;
  if (isReady(a) !== isReady(b)) return isReady(a) ? -1 : 1;
  if (isReady(a) && isReady(b) && readySince(a) !== readySince(b)) return olderFirst(readySince(a), readySince(b));
  if (maxRestarts(a) !== maxRestarts(b)) return maxRestarts(b) - maxRestarts(a);
  return olderFirst(a.metadata?.creationTimestamp ?? "", b.metadata?.creationTimestamp ?? "");
}

function containerNames(pod) {
  const spec = pod.spec ?? {};
  return [...(spec.initContainers ?? []), ...(spec.containers ?? []), ...(spec.ephemeralContainers ?? [])].map((one) => one.name);
}

function prefixed(pod, container, text) {
  const lines = text.split("\n");
  const kept = lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
  return kept.map((line) => `[pod/${pod}/${container}] ${line}`);
}

async function podLogs(get, pod, tail) {
  const namespace = pod.metadata.namespace;
  const name = pod.metadata.name;
  let lines = [];
  for (const container of containerNames(pod)) {
    const got = await get({ path: `${objectPath("pods", namespace, name)}/log`, query: { container, tailLines: String(tail) }, accept: TEXT_ACCEPT });
    if (!got.ok) return got;
    lines = [...lines, ...prefixed(name, container, got.text)];
  }
  return { ok: true, stdout: lines.length > 0 ? `${lines.join("\n")}\n` : "" };
}

function labelSelector(deployment) {
  const selector = deployment.spec?.selector ?? {};
  if ((selector.matchExpressions ?? []).length > 0) return null;
  const pairs = Object.entries(selector.matchLabels ?? {}).map(([key, value]) => `${key}=${value}`);
  return pairs.length > 0 ? pairs.join(",") : null;
}

async function firstPod(getJson, namespace, name) {
  const deployment = await getJson({ path: objectPath("deployments", namespace, name) });
  if (!deployment.ok) return deployment;
  const selector = labelSelector(deployment.value);
  if (!selector) return { fallback: true };
  const pods = await getJson({ path: collectionPath("pods", namespace), query: { labelSelector: selector } });
  if (!pods.ok) return pods;
  const [pod] = [...(pods.value.items ?? [])].sort(compareForLogging);
  return pod ? { ok: true, value: pod } : { ok: false, error: `error: timed out waiting for the condition (no pods for deployment/${name})` };
}

export async function logsSnapshot(get, getJson, resource, namespace, name, tail) {
  const pod = resource === "pods" ? await getJson({ path: objectPath("pods", namespace, name) }) : await firstPod(getJson, namespace, name);
  if (!pod.ok) return pod;
  return podLogs(get, pod.value, tail);
}
