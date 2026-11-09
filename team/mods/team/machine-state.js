import { focused, spaces } from "herdr";
import { loadMachines, remoteRepos, remoteTemplate, copyTemplate, rootsFor, saveRoots, parseRoots, formatRoots } from "./remote.js";
import { loadRepos } from "./data.js";

export function focusedMachine() {
  const f = focused();
  return spaces().find((one) => one.id === f?.space)?.machine ?? null;
}

export async function refreshMachines(app) {
  try {
    app.machines = await loadMachines();
    app.machinesError = null;
  } catch (e) {
    app.machinesError = `Could not list machines: ${e.message ?? e}`;
  }
  if (app.machine === undefined) {
    const wanted = focusedMachine();
    app.machine = app.machines.some((one) => one.name === wanted && one.state === "connected") ? wanted : null;
  }
}

export async function refreshRepos(app, cx) {
  app.reposError = null;
  app.reposInfo = "listing…";
  cx.notify();
  try {
    if (app.machine) {
      const roots = rootsFor(app.machine);
      app.rootsInput.set_value(formatRoots(roots));
      const found = await remoteRepos(app.machine, roots, cx);
      app.repos = found.repos;
      app.reposError = found.error;
      app.reposInfo = `${found.repos.length} on ${app.machine}`;
    } else {
      const found = await loadRepos();
      app.repos = found.repos;
      app.reposInfo = `${found.repos.length} from ${found.source}`;
    }
  } catch (e) {
    app.repos = [];
    app.reposError = `Could not list repos${app.machine ? ` on ${app.machine}` : ""}: ${e.message ?? e}`;
    app.reposInfo = "";
  }
  if (app.repo && !app.repos.includes(app.repo)) {
    app.repoNote = `${app.repo} was not found${app.machine ? ` on ${app.machine}` : ""}: pick a repo there`;
    app.repo = null;
  }
}

export async function refreshRemoteTemplate(app, cx) {
  app.remoteTpl = null;
  if (!app.machine || !app.template) return;
  const machine = app.machine, template = app.template;
  try {
    const found = await remoteTemplate(machine, template);
    if (app.machine === machine && app.template === template) app.remoteTpl = found;
  } catch (e) {
    if (app.machine === machine) app.remoteTpl = { error: `Could not check ${template} on ${machine}: ${e.message ?? e}` };
  }
  cx.notify();
}

export function pickMachine(app, name, cx) {
  const target = name ? app.machines.find((one) => one.name === name) : null;
  if (name && target?.state !== "connected") return;
  app.machine = name; app.plain = false; app.confirming = false; app.repoNote = null;
  if (name) app.where = "tab";
  cx.spawn(async (cx) => {
    await refreshRepos(app, cx);
    await refreshRemoteTemplate(app, cx);
    cx.notify();
  });
  cx.notify();
}

export function applyRoots(app, cx) {
  if (!app.machine) return;
  try {
    saveRoots(app.machine, parseRoots(app.rootsInput.value()));
  } catch (e) {
    app.reposError = String(e.message ?? e);
    cx.notify();
    return;
  }
  cx.spawn(async (cx) => { await refreshRepos(app, cx); cx.notify(); });
}

export function copyRemoteTemplate(app, cx) {
  const machine = app.machine, template = app.template;
  app.copying = true;
  cx.spawn(async (cx) => {
    try {
      await copyTemplate(machine, template);
      app.launchError = null;
    } catch (e) {
      app.launchError = `Could not copy ${template} to ${machine}: ${e.message ?? e}`;
    } finally {
      app.copying = false;
      await refreshRemoteTemplate(app, cx);
    }
  });
  cx.notify();
}

export function remoteBlock(app) {
  const tpl = app.remoteTpl;
  if (!app.machine || app.plain) return null;
  if (!tpl) return `Checking ${app.template} on ${app.machine}…`;
  if (tpl.error) return tpl.error;
  if (!tpl.present) return `Template ${app.template} is not on ${app.machine}.`;
  return null;
}
