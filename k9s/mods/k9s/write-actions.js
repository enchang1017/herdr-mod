import { notify } from "herdr";
import { rowNamespaceOf, errorText } from "./kubectl.js";
import { canWrite, deletePodArgv, restartArgv, scaleArgv, shellArgv, writeRefusal, MAX_REPLICAS } from "./write-guard.js";
import { runWrite, openShell } from "./writes.js";
import * as browse from "./browse-actions.js";
import { refreshDrawer } from "./drawer-actions.js";

const DEFAULT_SHELL = "/bin/sh";
const TITLES = { delete: "Delete pod", restart: "Rollout restart", scale: "Scale" };

function workloadOf(panel, row) {
  if (panel.state.scope.resource === "deployments") {
    const replicas = panel.state.overview.data?.object?.spec?.replicas ?? null;
    return { kind: "deployment", name: row.name, replicas };
  }
  return panel.state.overview.data?.workload ?? null;
}

function firstContainer(panel) {
  const containers = panel.state.overview.data?.object?.spec?.containers ?? [];
  return containers[0]?.name ?? null;
}

export function writeTargets(panel) {
  const { scope } = panel.state;
  const row = browse.selectedRow(panel);
  if (!row || !canWrite(scope.context)) return { pod: null, workload: null };
  const namespace = rowNamespaceOf(scope, row);
  const pod = scope.resource === "pods" ? { name: row.name, namespace, container: firstContainer(panel) } : null;
  const workload = scope.resource === "pods" || scope.resource === "deployments" ? workloadOf(panel, row) : null;
  return { pod, workload: workload ? { ...workload, namespace } : null };
}

function planFor(panel, action) {
  const { scope } = panel.state;
  const { pod, workload } = writeTargets(panel);
  if (action === "delete" && pod) return { action, argv: deletePodArgv(scope.context, pod.namespace, pod.name), expect: pod.name, subject: pod.name };
  if (action === "restart" && workload) return { action, argv: restartArgv(scope.context, workload.namespace, workload.kind, workload.name), expect: workload.name, subject: `${workload.kind}/${workload.name}` };
  if (action === "scale" && workload && workload.replicas !== null) {
    return { action, workload, current: workload.replicas, argv: scaleArgv(scope.context, workload.namespace, workload.kind, workload.name, workload.replicas), subject: `${workload.kind}/${workload.name}` };
  }
  return null;
}

export function beginWrite(panel, action, cx) {
  if (!canWrite(panel.state.scope.context)) {
    panel.set({ message: "This context is read-only." });
    return;
  }
  if (action === "shell") {
    startShell(panel, null, cx);
    return;
  }
  const plan = planFor(panel, action);
  if (!plan) {
    panel.set({ message: panel.state.overview.loading ? "Still loading the details, try again in a moment." : `${TITLES[action]} is not available for this row.` });
    return;
  }
  panel.set({ write: { ...plan, title: TITLES[action], phase: "confirm", typed: "", replicas: plan.current ?? null, error: "" } });
  const input = action === "scale" ? panel.scaleInput : panel.confirmInput;
  input.set_value(action === "scale" ? String(plan.current) : "");
  input.focus();
}

export function cancelWrite(panel) {
  panel.set({ write: null });
  panel.handle.focus();
}

function parseReplicas(text) {
  const value = Number(String(text).trim());
  return Number.isInteger(value) && value >= 0 && value <= MAX_REPLICAS ? value : null;
}

export function typedWrite(panel) {
  const write = panel.state.write;
  if (!write) return;
  if (write.action !== "scale") {
    panel.set({ write: { ...write, typed: panel.confirmInput.value() } });
    return;
  }
  const replicas = parseReplicas(panel.scaleInput.value());
  const { workload } = write;
  const argv = replicas === null ? write.argv : scaleArgv(panel.state.scope.context, workload.namespace, workload.kind, workload.name, replicas);
  panel.set({ write: { ...write, replicas, argv } });
}

export function writeReady(write) {
  if (!write || write.phase !== "confirm" || writeRefusal(write.argv)) return false;
  if (write.action === "scale") return write.replicas !== null && write.replicas !== write.current;
  return write.typed.trim() === write.expect;
}

function toast(result, title, subject) {
  const body = [result.text, result.audit].filter(Boolean).join("\n");
  notify({ title: result.ok ? `${title}: ${subject}` : `${title} failed: ${subject}`, body, level: result.ok ? "success" : "error", timeout: result.ok ? 5000 : 12000 });
}

export function submitWrite(panel, cx) {
  const write = panel.state.write;
  if (!writeReady(write)) return;
  panel.set({ write: { ...write, phase: "running" } });
  cx.notify();
  cx.spawn(async (cx) => {
    const result = await runWrite(write.argv).catch((error) => ({ ok: false, text: errorText(error), audit: "" }));
    toast(result, write.title, write.subject);
    panel.set({ write: result.ok ? null : { ...write, phase: "confirm", error: result.text } });
    if (result.ok) panel.handle.focus();
    browse.reloadList(panel, cx, true);
    refreshDrawer(panel, cx);
    cx.notify();
  });
}

export function startShell(panel, container, cx) {
  const { pod } = writeTargets(panel);
  const name = container ?? pod?.container;
  if (!pod || !name) {
    panel.set({ message: pod ? "Waiting for the pod's containers to load." : "Shell needs a pod on a write context." });
    return;
  }
  const argv = shellArgv(panel.state.scope.context, pod.namespace, pod.name, name, DEFAULT_SHELL);
  panel.set({ message: `Opening a shell in ${pod.name}/${name}...` });
  cx.spawn(async (cx) => {
    const result = await openShell(argv, pod.name, cx).catch((error) => ({ ok: false, text: errorText(error), audit: "" }));
    toast(result, "Shell", `${pod.name}/${name}`);
    panel.set({ message: result.ok ? "" : result.text });
    cx.notify();
  });
}
