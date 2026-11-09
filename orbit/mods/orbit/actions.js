import { loadDaemonStatus, loadCliStatus, loadLogs, loadTraces, loadTrace, loadTraceLogs, runAction, errorText } from "./api.js";
import { askAgent, logsPrompt, tracePrompt } from "./ask.js";
import { dockBeside } from "./dock.js";
import { filterLines, isErrorTrace } from "./model.js";
import { DEFAULT_INSTANCE } from "./instances.js";

const CLI_RETRY_MS = 15_000;
export const CONFIRM_MS = 6_000;
const NEEDS_DAEMON = "Needs the running Orbit daemon (start it with orbit up).";

export const EMPTY_STATUS = { source: "loading", env: "", configPath: "", selected: "", error: "", resources: [], at: 0 };
export const EMPTY_LOGS = { name: "", lines: [], error: "", loading: false, at: 0 };
export const EMPTY_TRACES = { list: [], error: "", loading: false, at: 0 };

export function isLive(panel) {
  return panel.state.status.source === "daemon";
}

export function baseOf(panel) {
  const { instance, instances } = panel.state;
  if (!instance) return DEFAULT_INSTANCE.base;
  return instances.find((one) => one.name === instance)?.base ?? "";
}

async function fallBack(panel, isForced, instance) {
  const { status } = panel.state;
  if (!isForced && status.source === "cli" && Date.now() - status.at < CLI_RETRY_MS) return;
  try {
    const cli = await loadCliStatus(instance);
    if (panel.state.instance === instance) panel.set({ status: { ...cli, at: Date.now() } });
  } catch (error) {
    const resources = status.resources.map((one) => ({ ...one, state: "stopped" }));
    if (panel.state.instance !== instance) return;
    panel.set({ status: { ...EMPTY_STATUS, source: "none", env: status.env, resources, error: `orbit status --json failed: ${errorText(error)}`, at: Date.now() } });
  }
}

export function refreshStatus(panel, cx, isForced) {
  if (panel.state.loadingStatus) return;
  panel.set({ loadingStatus: true });
  const { instance } = panel.state;
  cx.spawn(async (cx) => {
    try {
      const status = await loadDaemonStatus(baseOf(panel));
      if (panel.state.instance === instance) panel.set({ status: { ...status, at: Date.now() } });
    } catch (error) {
      if (error?.unreachable) await fallBack(panel, isForced, instance);
      else if (panel.state.instance === instance) panel.set({ status: { ...panel.state.status, source: "daemon", error: `Status unreadable: ${errorText(error)}`, at: Date.now() } });
    } finally {
      panel.set({ loadingStatus: false });
      cx.notify();
    }
  });
}

export function selectedResource(panel) {
  const { resources } = panel.state.status;
  return resources.find((one) => one.name === panel.state.selected) ?? null;
}

export function moveSelection(panel, step) {
  const { resources } = panel.state.status;
  if (resources.length === 0) return;
  const at = resources.findIndex((one) => one.name === panel.state.selected);
  const next = at < 0 ? 0 : Math.max(0, Math.min(resources.length - 1, at + step));
  panel.set({ selected: resources[next].name, confirm: null });
}

function scrollLogsDown(panel, before, after, cx) {
  if (!panel.state.follow || after.length === before.length) return;
  panel.logScroll.scroll_to_bottom();
  cx.timer.after(60, () => panel.logScroll.scroll_to_bottom());
}

export function reloadLogs(panel, cx) {
  const name = panel.state.logResource;
  const { logs } = panel.state;
  if (!name || logs.loading || panel.state.status.source === "loading") return;
  if (!isLive(panel)) {
    panel.set({ logs: { ...EMPTY_LOGS, name, error: NEEDS_DAEMON } });
    return;
  }
  const previous = logs.name === name ? logs.lines : [];
  panel.set({ logs: { ...logs, name, lines: previous, loading: true } });
  cx.spawn(async (cx) => {
    try {
      const lines = await loadLogs(baseOf(panel), name);
      if (panel.state.logResource !== name) return;
      panel.set({ logs: { name, lines, error: "", loading: false, at: Date.now() } });
      scrollLogsDown(panel, previous, lines, cx);
    } catch (error) {
      panel.set({ logs: { ...panel.state.logs, loading: false, error: `Logs for ${name}: ${errorText(error)}` } });
    } finally {
      cx.notify();
    }
  });
}

export function reloadTraces(panel, cx) {
  const { traces, includeHealth } = panel.state;
  if (traces.loading || panel.state.status.source === "loading") return;
  if (!isLive(panel)) {
    panel.set({ traces: { ...EMPTY_TRACES, error: NEEDS_DAEMON } });
    return;
  }
  panel.set({ traces: { ...traces, loading: true } });
  cx.spawn(async (cx) => {
    try {
      panel.set({ traces: { list: await loadTraces(baseOf(panel), includeHealth), error: "", loading: false, at: Date.now() } });
    } catch (error) {
      panel.set({ traces: { ...panel.state.traces, loading: false, error: `Traces: ${errorText(error)}` } });
    } finally {
      cx.notify();
    }
  });
}

export function shownTraces(panel) {
  const { list } = panel.state.traces;
  return panel.state.errorsOnly ? list.filter(isErrorTrace) : list;
}

export function openTrace(panel, id, cx) {
  if (!id) return;
  panel.set({ trace: { id, detail: null, logs: [], error: "", loading: true }, traceCursor: id });
  cx.notify();
  cx.spawn(async (cx) => {
    try {
      const [detail, logs] = await Promise.all([loadTrace(baseOf(panel), id), loadTraceLogs(baseOf(panel), id).catch((error) => [`(trace logs unavailable: ${errorText(error)})`])]);
      if (panel.state.trace?.id !== id) return;
      panel.set({ trace: { id, detail, logs, error: "", loading: false } });
    } catch (error) {
      if (panel.state.trace?.id === id) panel.set({ trace: { id, detail: null, logs: [], error: `Trace ${id.slice(0, 8)}: ${errorText(error)}`, loading: false } });
    } finally {
      cx.notify();
    }
  });
}

export function moveTraceCursor(panel, step) {
  const list = shownTraces(panel);
  if (list.length === 0) return;
  const at = list.findIndex((one) => one.id === panel.state.traceCursor);
  const next = at < 0 ? 0 : Math.max(0, Math.min(list.length - 1, at + step));
  panel.set({ traceCursor: list[next].id });
  panel.traceScroll.scroll_to_item(next);
}

export function requestAction(panel, action, cx) {
  const row = selectedResource(panel);
  if (!row) return panel.set({ message: "Select a resource first." });
  if (!isLive(panel)) return panel.set({ message: `${action === "restart" ? "Restart" : "Stop"}: ${NEEDS_DAEMON}` });
  const { confirm } = panel.state;
  if (confirm && confirm.action === action && confirm.name === row.name && Date.now() - confirm.at < CONFIRM_MS) {
    performAction(panel, action, row.name, cx);
    return;
  }
  const at = Date.now();
  panel.set({ confirm: { action, name: row.name, at }, message: "" });
  cx.timer.after(CONFIRM_MS, (cx) => {
    if (panel.state.confirm?.at !== at) return;
    panel.set({ confirm: null });
    cx.notify();
  });
}

export function performAction(panel, action, name, cx) {
  panel.set({ confirm: null, acting: name, message: `${action === "restart" ? "Restarting" : "Stopping"} ${name}...` });
  cx.notify();
  cx.spawn(async (cx) => {
    try {
      await runAction(baseOf(panel), action, name);
      panel.set({ message: `${action === "restart" ? "Restart" : "Stop"} requested for ${name}.` });
    } catch (error) {
      panel.set({ message: `Could not ${action} ${name}: ${errorText(error)}` });
    } finally {
      panel.set({ acting: "" });
      refreshStatus(panel, cx, true);
      cx.notify();
    }
  });
}

export function runAsk(panel, cx, build) {
  if (panel.state.asking) return;
  panel.set({ asking: true, message: "" });
  cx.notify();
  cx.spawn(async (cx) => {
    try {
      const { title, text } = build();
      const result = await askAgent(panel.state.status.env || "local", title, text);
      await dockBeside(result, cx, "orbit");
    } catch (error) {
      panel.set({ message: `Could not ask the agent: ${errorText(error)}` });
    } finally {
      panel.set({ asking: false });
      cx.notify();
    }
  });
}

export function askLogs(panel, cx) {
  const { logs, filter } = panel.state;
  const lines = filterLines(logs.lines, filter);
  if (!logs.name || lines.length === 0) return panel.set({ message: "No log lines to send." });
  runAsk(panel, cx, () => ({ title: `${logs.name} logs`, text: logsPrompt(panel.state.status.env, logs.name, lines, filter) }));
}

export function askTrace(panel, cx) {
  const trace = panel.state.trace;
  if (!trace?.detail) return panel.set({ message: "Open a trace first." });
  runAsk(panel, cx, () => ({
    title: `trace ${trace.id.slice(0, 8)}`,
    text: tracePrompt(panel.state.status.env, trace.detail, trace.logs),
  }));
}
