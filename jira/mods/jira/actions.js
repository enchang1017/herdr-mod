import { notify } from "herdr";
import { acli, openUrl, errorText } from "./acli.js";
import { viewIssue, cachedDetail, knownStatuses, forgetLists } from "./data.js";
import { writePlan, runPlan } from "./writes.js";
import { branchName } from "./text.js";
import { startDev as handOff } from "./devlink.js";

const REVEAL_MS = 24;
const OPEN_MAX_AGE_MS = 60000;
const FOCUS_DELAY_MS = 60;
const NO_STATUSES = Object.freeze({ id: "", list: [], loading: false, error: "" });

function reveal(app, cx) {
  const token = (app.state.drawer?.token ?? 0) + 1;
  app.set({ drawer: { ...app.state.drawer, revealed: false, token } });
  cx.timer.after(REVEAL_MS, (cx) => {
    if (app.state.drawer?.token !== token) return;
    app.set({ drawer: { ...app.state.drawer, revealed: true } });
    cx.notify();
  });
}

export function loadDetail(app, key, cx, force, maxAge) {
  app.set({ detail: { key, loading: true, error: "" } });
  cx.spawn(async (cx) => {
    try {
      await viewIssue(key, force, maxAge);
      if (app.state.detail.key === key) app.set({ detail: { key, loading: false, error: "" } });
    } catch (e) {
      if (app.state.detail.key === key) app.set({ detail: { key, loading: false, error: errorText(e) } });
    }
    cx.notify();
  });
}

export function openDrawer(app, key, cx) {
  if (!key) return;
  const isSame = app.state.drawer?.key === key;
  app.set({ drawer: { key, token: app.state.drawer?.token ?? 0, revealed: true }, lastKey: key, action: isSame ? app.state.action : null });
  if (!isSame) reveal(app, cx);
  loadDetail(app, key, cx, false, OPEN_MAX_AGE_MS);
  cx.notify();
}

export function closeDrawer(app, cx) {
  app.set({ drawer: null, action: null });
  app.blur(cx);
}

export function issueOf(app, key) {
  if (!key) return null;
  return cachedDetail(key) ?? app.state.rows.find((row) => row.key === key) ?? null;
}

export function currentIssue(app) {
  return issueOf(app, app.state.drawer?.key ?? app.state.selected);
}

export function flash(app, text, cx) {
  const token = (app.flashToken ?? 0) + 1;
  app.flashToken = token;
  app.set({ message: text });
  cx.timer.after(4000, (cx) => {
    if (app.flashToken !== token) return;
    app.set({ message: "" });
    cx.notify();
  });
  cx.notify();
}

function loadStatuses(app, issue, cx) {
  const id = `${issue.project ?? issue.key.split("-")[0]}/${issue.type}`;
  if (app.state.statuses.id === id && !app.state.statuses.error) return;
  app.set({ statuses: { ...NO_STATUSES, id, loading: true } });
  cx.spawn(async (cx) => {
    try {
      const list = await knownStatuses(id.split("/")[0], issue.type);
      if (app.state.statuses.id === id) app.set({ statuses: { id, list, loading: false, error: list.length ? "" : "No statuses found for this project and type." } });
    } catch (e) {
      if (app.state.statuses.id === id) app.set({ statuses: { id, list: [], loading: false, error: errorText(e) } });
    }
    cx.notify();
  });
}

function planFor(app, kind, value, cx) {
  const issue = issueOf(app, app.state.drawer?.key);
  if (!issue) return;
  try {
    app.set({ action: { kind, key: issue.key, stage: "confirm", plan: writePlan(kind, issue, value), error: "" } });
    app.blur(cx);
  } catch (e) {
    if (app.state.action) app.set({ action: { ...app.state.action, error: errorText(e) } });
    flash(app, errorText(e), cx);
  }
  cx.notify();
}

export function beginAction(app, kind, cx) {
  const issue = issueOf(app, app.state.drawer?.key);
  if (!issue || app.state.action?.stage === "running") return;
  if (kind === "assign" || kind === "unassign") return planFor(app, kind, null, cx);
  app.set({ action: { kind, key: issue.key, stage: "pick", plan: null, error: "" } });
  if (kind === "transition") loadStatuses(app, issue, cx);
  if (kind === "comment") cx.timer.after(FOCUS_DELAY_MS, () => app.commentInput.focus());
  cx.notify();
}

export function pickStatus(app, status, cx) {
  planFor(app, "transition", status, cx);
}

export function reviewComment(app, cx) {
  planFor(app, "comment", app.commentInput.value(), cx);
}

export function cancelAction(app, cx) {
  const action = app.state.action;
  if (!action || action.stage === "running") return;
  app.set({ action: action.stage === "confirm" && action.kind === "comment" ? { ...action, stage: "pick", plan: null, error: "" } : null });
  cx.notify();
}

export function confirmAction(app, cx) {
  const action = app.state.action;
  if (!action || action.stage !== "confirm" || !action.plan) return;
  app.set({ action: { ...action, stage: "running", error: "" } });
  cx.spawn(async (cx) => {
    try {
      await runPlan(action.plan);
      notify({ title: "Jira", body: `${action.plan.title}: done`, level: "success", timeout: 3000 });
      if (action.kind === "comment") app.commentInput.set_value("");
      app.set({ action: null, statuses: NO_STATUSES });
      forgetLists();
      loadDetail(app, action.key, cx, true);
      app.load(cx, true);
    } catch (e) {
      app.set({ action: { ...action, stage: "confirm", error: errorText(e) } });
    }
    cx.notify();
  });
  cx.notify();
}

export function copyKey(app, cx) {
  const issue = currentIssue(app);
  if (!issue) return;
  cx.write_to_clipboard(issue.key);
  flash(app, `Copied ${issue.key}`, cx);
}

export function copyBranch(app, cx) {
  const issue = currentIssue(app);
  if (!issue) return;
  const name = branchName(issue.key, issue.summary);
  cx.write_to_clipboard(name);
  flash(app, `Copied ${name}`, cx);
}

export function openLink(app, url, cx) {
  openUrl(url).catch((e) => flash(app, `Could not open ${url}: ${errorText(e)}`, cx));
}

export function browse(app, cx) {
  const issue = currentIssue(app);
  if (!issue) return;
  const site = app.state.site;
  const opened = site ? openUrl(`https://${site}/browse/${issue.key}`) : acli(["jira", "workitem", "view", issue.key, "--web"], `acli jira workitem view ${issue.key} --web`);
  opened.catch((e) => flash(app, `Could not open ${issue.key}: ${errorText(e)}`, cx));
}

export function startDev(app, cx) {
  const issue = currentIssue(app);
  if (!issue) return;
  flash(app, `Opening Start dev for ${issue.key}\u{2026}`, cx);
  cx.spawn(async (cx) => {
    try {
      const detail = await viewIssue(issue.key, false);
      const request = await handOff(detail);
      flash(app, `Start dev: ${request.jira}${request.plan ? " + plan link" : ""} sent to Team`, cx);
    } catch (e) {
      flash(app, `Could not start dev: ${errorText(e)}`, cx);
    }
  });
}
