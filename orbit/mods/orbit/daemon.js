import { runOrbit, instanceArgs, errorText, firstLine } from "./api.js";
import { loadInstances } from "./instances.js";
import { refreshStatus, isLive, CONFIRM_MS, EMPTY_STATUS, EMPTY_LOGS, EMPTY_TRACES } from "./actions.js";
import { EMPTY_DB, EMPTY_DIFF } from "./db-actions.js";

export const DAEMON_ACTION = "daemon-stop";

export function refreshInstances(panel, cx) {
  if (panel.state.loadingInstances) return;
  panel.set({ loadingInstances: true });
  cx.spawn(async (cx) => {
    try {
      panel.set({ instances: await loadInstances(), instancesError: "" });
    } catch (error) {
      panel.set({ instancesError: `Instances: ${errorText(error)}` });
    } finally {
      panel.set({ loadingInstances: false });
      cx.notify();
    }
  });
}

export function selectInstance(panel, name, cx) {
  if (panel.state.instance === name) return;
  panel.set({
    instance: name, status: EMPTY_STATUS, logs: EMPTY_LOGS, traces: EMPTY_TRACES, trace: null, lastTrace: null, traceCursor: null,
    db: EMPTY_DB, dbDiff: EMPTY_DIFF, confirm: null, message: "",
  });
  panel.persist();
  refreshStatus(panel, cx, true);
}

function instanceLabel(panel) {
  return panel.state.instance || "default";
}

export function requestDaemonStop(panel, cx) {
  if (!isLive(panel)) return panel.set({ message: "The Orbit daemon is not running." });
  const { confirm } = panel.state;
  const name = instanceLabel(panel);
  if (confirm?.action === DAEMON_ACTION && confirm.name === name && Date.now() - confirm.at < CONFIRM_MS) {
    stopDaemon(panel, cx);
    return;
  }
  const at = Date.now();
  panel.set({ confirm: { action: DAEMON_ACTION, name, at }, message: "" });
  cx.timer.after(CONFIRM_MS, (cx) => {
    if (panel.state.confirm?.at !== at) return;
    panel.set({ confirm: null });
    cx.notify();
  });
}

export function stopDaemon(panel, cx) {
  const { instance } = panel.state;
  const name = instanceLabel(panel);
  panel.set({ confirm: null, stoppingDaemon: true, message: `Stopping the Orbit daemon (${name})...` });
  cx.notify();
  cx.spawn(async (cx) => {
    try {
      const ran = await runOrbit(instanceArgs(instance, ["daemon", "stop"]));
      if (ran.code !== 0) throw new Error(firstLine(ran.stderr || ran.stdout) || `orbit daemon stop exited ${ran.code}`);
      panel.set({ message: `Orbit daemon (${name}) stopped.` });
    } catch (error) {
      panel.set({ message: `Could not stop the Orbit daemon (${name}): ${errorText(error)}` });
    } finally {
      panel.set({ stoppingDaemon: false });
      refreshStatus(panel, cx, true);
      refreshInstances(panel, cx);
      cx.notify();
    }
  });
}
