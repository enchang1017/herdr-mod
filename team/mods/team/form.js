import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { button, chip, card, tabs, shade, field, labeled, errorRow } from "./kit.js";
import { baseName } from "./data.js";
import { pickMachine, applyRoots, copyRemoteTemplate } from "./machine-state.js";

const WHERE = [["tab", "Team tab"], ["worktree", "New worktree"]];
const REPO_ROWS = 60;

function oneLine(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function templateRow(app, one, t) {
  const on = app.template === one.name;
  return h_flex().id(`tpl-${one.name}`).h(28).px(10).gap(10).items_center().cursor_pointer().border_l(2).border_color(on ? t.accent : t.background)
    .when(on, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => app.openTemplate(one.name, cx))
    .child(div().flex_none().font_bold().text_size(12).child(one.name))
    .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child(oneLine(one.description)))
    .child(div().flex_none().text_size(10.5).text_color(t.dim).child(one.command));
}

function templateList(app, t) {
  const loading = !app.templatesError && !app.templates.length;
  return card(t, "templates")
    .when(Boolean(app.templatesError), (e) => e.child(div().px(10).py(6).child(errorRow(t, app.templatesError ?? ""))))
    .when(Boolean(app.launchError), (e) => e.child(div().px(10).py(6).child(errorRow(t, app.launchError ?? ""))))
    .when(loading, (e) => e.child(div().px(10).py(6).text_size(11).text_color(t.dim).child("Loading hc templates…")))
    .children(app.templates.map((one) => templateRow(app, one, t)));
}

function templateBar(app, t) {
  const one = app.templates.find((tpl) => tpl.name === app.template);
  return h_flex().flex_none().h(30).px(8).gap(10).items_center().bg(t.surface).border_b(1).border_color(t.border)
    .child(button("tpl-back", "Templates", t, (_e, cx) => app.closeTemplate(cx), { small: true, tooltip: "Back to the template list (esc)" }))
    .child(div().flex_none().font_bold().text_size(12).child(app.template ?? ""))
    .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.muted).child(oneLine(one?.description)))
    .child(div().flex_none().text_size(10.5).text_color(t.dim).child(one?.command ?? ""));
}

function repoRow(app, path, t) {
  const on = app.repo === path;
  return h_flex().id(`repo-${path}`).px(8).h(22).gap(8).items_center().cursor_pointer()
    .when(on, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => app.pickRepo(path, cx))
    .child(div().flex_none().text_size(12).font_semibold().child(baseName(path)))
    .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(path));
}

function repoBlock(app, t) {
  const shown = app.filteredRepos();
  const folder = app.machine ? [] : [button("folder", "Folder…", t, (_e, cx) => app.chooseFolder(cx), { small: true, tooltip: "Pick a repo folder outside this list" })];
  const more = shown.length > REPO_ROWS ? `${shown.length - REPO_ROWS} more: type to filter` : "";
  return v_flex().gap(4)
    .child(field(t, "repo-filter", "REPO", app.repoFilter, app.wide, [div().flex_none().text_size(10.5).text_color(t.dim).child(app.reposInfo), ...folder]))
    .when(Boolean(app.repoNote), (e) => e.child(div().text_size(11).text_color(t.blocked).child(app.repoNote ?? "")))
    .when(Boolean(app.reposError), (e) => e.child(errorRow(t, app.reposError ?? "")))
    .child(v_flex().id("repo-list").max_h(132).overflow_y_scrollbar().rounded(6).border_1().border_color(t.border).bg(t.background)
      .children(shown.slice(0, REPO_ROWS).map((path) => repoRow(app, path, t))))
    .when(Boolean(more), (e) => e.child(div().text_size(10.5).text_color(t.dim).child(more)));
}

function machineChoice(app, id, label, state, t) {
  const on = (app.machine ?? null) === id, usable = id === null || state === "connected";
  return h_flex().id(`machine-${id ?? "local"}`).h(22).px(9).gap(6).items_center().rounded(5).text_size(11)
    .when(on, (e) => e.bg(t.solid).text_color(t.solid_foreground).font_semibold())
    .when(!on && usable, (e) => e.cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover)))
    .when(!usable, (e) => e.text_color(t.dim))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .when(usable, (e) => e.on_click((_e, cx) => pickMachine(app, id, cx)))
    .child(label)
    .when(Boolean(id && state !== "connected"), (e) => e.child(chip(t, state, t.dim, "outline")));
}

function templateNote(app, t) {
  const tpl = app.remoteTpl;
  if (!app.machine || !tpl || tpl.error) return tpl?.error ? errorRow(t, tpl.error) : null;
  const plugins = tpl.missingPlugins.length ? `It uses skills from ${tpl.missingPlugins.join(", ")}, which ${tpl.missingPlugins.length > 1 ? "are" : "is"} not installed on ${app.machine}.` : "";
  if (tpl.present && !plugins) return null;
  return v_flex().gap(6).px(10).py(6).rounded(8).border_1().border_color(shade(t.blocked, "border")).bg(shade(t.blocked, "subtle"))
    .child(div().text_size(11).text_color(t.blocked).child([tpl.present ? "" : `Template ${app.template} is not on ${app.machine}.`, plugins].filter(Boolean).join(" ")))
    .child(h_flex().gap(6)
      .when(!tpl.present && tpl.localExists, (e) => e.child(button("copy-template", app.copying ? "Copying…" : `Copy ${app.template} to ${app.machine}`, t, (_e, cx) => copyRemoteTemplate(app, cx), { small: true, disabled: app.copying })))
      .child(button("plain", app.plain ? "Plain claude: on" : "Launch plain claude with the task instead", t, (_e, cx) => { app.plain = !app.plain; app.launchError = null; cx.notify(); }, { small: true, active: app.plain })));
}

function machineBlock(app, t) {
  const choices = h_flex().gap(4).flex_wrap().child(machineChoice(app, null, "This Mac", "connected", t))
    .children(app.machines.map((one) => machineChoice(app, one.name, one.name, one.state, t)));
  return v_flex().gap(6)
    .child(labeled(t, "MACHINE", choices, app.wide))
    .when(Boolean(app.machinesError), (e) => e.child(errorRow(t, app.machinesError ?? "")))
    .when(Boolean(app.machine), (e) => e.child(field(t, "roots", "ROOTS", app.rootsInput, app.wide, [button("rescan", "Rescan", t, (_e, cx) => applyRoots(app, cx), { small: true, tooltip: "Rescan the repo roots (enter)" })])))
    .children([templateNote(app, t)].filter(Boolean));
}

function whereRow(app, t) {
  const content = app.machine
    ? div().text_size(11).text_color(t.dim).child(`Team tab in a ${app.machine} space (worktrees are this Mac only)`)
    : tabs(t, "where", WHERE, app.where, (key, _e, cx) => app.pickWhere(key, cx));
  return labeled(t, "WHERE", h_flex().child(content), app.wide);
}

function confirmRow(app, t) {
  const n = app.running.list().length;
  return h_flex().gap(8).px(10).py(6).items_center().rounded(8).border_1().border_color(shade(t.blocked, "border")).bg(shade(t.blocked, "subtle"))
    .child(div().flex_1().text_size(11.5).text_color(t.blocked).child(`${n} agents already running: each is a full Claude session using quota. Start another?`))
    .child(button("confirm-yes", "Start anyway", t, (_e, cx) => app.launch(cx, true), { primary: true, small: true }))
    .child(button("confirm-no", "Cancel", t, (_e, cx) => { app.confirming = false; cx.notify(); }, { small: true, tooltip: "esc" }));
}

function launchRow(app, t) {
  if (app.confirming) return confirmRow(app, t);
  const ready = Boolean(app.template && app.repo && !app.launching);
  return h_flex().gap(8).items_center()
    .child(button("launch", app.launching ? "Starting…" : "Launch", t, (_e, cx) => app.launch(cx, false), { primary: true, disabled: !ready }))
    .when(Boolean(app.repo), (e) => e.child(chip(t, baseName(app.repo ?? ""), t.accent, "outline")))
    .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(app.lastLaunch ?? (app.repo ? "" : "Pick a repo to launch in")));
}

function launchForm(app, t) {
  return card(t, "launch").child(templateBar(app, t))
    .child(v_flex().p(8).gap(6)
      .child(machineBlock(app, t))
      .child(repoBlock(app, t))
      .child(field(t, "task", "TASK", app.taskInput, app.wide))
      .child(whereRow(app, t))
      .when(app.where === "worktree" && !app.machine, (e) => e.child(field(t, "branch", "BRANCH", app.branchInput, app.wide)))
      .when(Boolean(app.launchError), (e) => e.child(errorRow(t, app.launchError ?? "")))
      .child(launchRow(app, t)));
}

export function agentsView(app, t) {
  return app.agentsStage === "form" && app.template ? launchForm(app, t) : templateList(app, t);
}
