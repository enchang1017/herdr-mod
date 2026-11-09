import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState } from "gpui-base";
import { theme, notify, nextCommand, props, settings, fonts, exec, pickFolder, shared } from "herdr";
import { dockHere, openAsTab, floatAgain } from "./dock.js";
import { loadTemplates, defaultTask, baseName } from "./data.js";
import { refreshMachines, refreshRepos, refreshRemoteTemplate, applyRoots, remoteBlock } from "./machine-state.js";
import { launchInTeamTab, launchInWorktree, defaultBranch } from "./launch.js";
import { Running } from "./running.js";
import { agentsView } from "./form.js";
import { button } from "./kit.js";
import { TABS, initialTab, saveTab, tabBar, statusStrip } from "./tabs.js";
import { onKey, escape } from "./keys.js";
import { DevStart } from "./dev.js";
import { MrReview } from "./mr.js";

const MOD = "team";
const CONFIRM_FROM = 2;
const WIDE_FROM = 520;
const DEV_REQUEST_KEY = "team.dev-request";
const FOCUS_INPUT = { dev: (app) => app.dev.focus(), mr: (app) => app.mr.url.focus() };

function monoFont() {
  const nerd = fonts().find((f) => f === "JetBrainsMono Nerd Font" || f === "JetBrainsMono Nerd Font Mono");
  return nerd ?? settings().font_family ?? "JetBrains Mono";
}

export default class Team extends View {
  init(_props, cx) {
    this.templates = []; this.templatesError = null; this.template = null;
    this.repos = []; this.reposError = null; this.reposInfo = ""; this.repo = null;
    this.machines = []; this.machinesError = null; this.machine = undefined; this.remoteTpl = null; this.plain = false; this.copying = false; this.repoNote = null;
    this.rootsInput = InputState.new({ placeholder: "path or path:depth, comma separated: ~/Project, ~:1" });
    this.rootsInput.on("submit", (_e, cx) => applyRoots(this, cx));
    this.where = "tab"; this.launching = false; this.launchError = null; this.confirming = false; this.lastLaunch = null;
    this.running = new Running();
    this.dev = new DevStart();
    this.dev.loadDefaults(cx);
    this.dev.prefill(props()?.jira, props()?.plan);
    this.mr = new MrReview();
    this.taskInput = InputState.new({ placeholder: "what the agent should do (first message, after the template's instructions)" });
    this.branchInput = InputState.new({ placeholder: "agent/<template>-<task>-<yyMMdd-HHmm> (git worktree add -b, from HEAD)" });
    this.repoFilter = InputState.new({ placeholder: "filter repos" });
    this.repoFilter.on("change", (_e, cx) => cx.notify());
    this.handle = cx.focus_handle();
    this.wide = true; this.typing = new Set();
    this.trackTyping();
    this.tab = initialTab(props()?.section, typeof props()?.template === "string");
    this.agentsStage = "list";
    const focusInput = FOCUS_INPUT[props()?.section];
    cx.timer.after(300, () => (focusInput ? focusInput(this) : this.handle.focus()));
    this.load(cx);
    cx.timer.every(1000, (cx) => this.running.tick(cx));
    cx.spawn(async (cx) => { for (;;) { this.command(await nextCommand(), cx); cx.notify(); } });
  }

  trackTyping() {
    const inputs = [this.rootsInput, this.taskInput, this.branchInput, this.repoFilter, this.dev.jira, this.dev.plan, this.dev.folder, this.mr.url, this.mr.note];
    inputs.forEach((input, index) => {
      input.on("focus", (_e, cx) => { this.typing = new Set([...this.typing, index]); cx.notify(); });
      input.on("blur", (_e, cx) => { this.typing = new Set([...this.typing].filter((one) => one !== index)); cx.notify(); });
    });
  }

  blur(cx) {
    this.typing = new Set();
    this.handle.focus();
    cx.notify();
  }

  setTab(tab, cx) {
    if (!TABS.includes(tab)) return;
    if (this.tab !== tab && this.typing.size) this.blur(cx);
    this.tab = tab;
    saveTab(tab);
    cx.notify();
  }

  showSection(tab, cx) {
    this.setTab(tab, cx);
    const focusInput = FOCUS_INPUT[tab];
    if (focusInput) focusInput(this);
    else this.handle.focus();
  }

  openTemplate(name, cx) {
    if (this.template !== name) this.pickTemplate(name, cx);
    this.agentsStage = "form";
    cx.notify();
  }

  closeTemplate(cx) {
    this.agentsStage = "list"; this.confirming = false;
    this.blur(cx);
  }

  load(cx) {
    cx.spawn(async (cx) => {
      try {
        this.templates = await loadTemplates();
        const wanted = this.templates.find((one) => one.name === props()?.template)?.name;
        if (props()?.template !== undefined && !wanted) this.launchError = `Props: unknown template ${JSON.stringify(props().template)}`;
        if (!this.template && this.templates.length) this.pickTemplate(wanted ?? this.templates[0].name, cx);
        if (wanted && !this.propsApplied) this.agentsStage = "form";
      } catch (e) {
        this.templatesError = `Could not list templates: ${e.message ?? e}`;
      }
      await refreshMachines(this);
      this.machineFromProps();
      await refreshRepos(this, cx);
      await this.applyProps(cx);
      await refreshRemoteTemplate(this, cx);
      cx.notify();
    });
  }

  machineFromProps() {
    const wanted = props()?.machine;
    if (this.propsApplied || typeof wanted !== "string") return;
    const found = this.machines.find((one) => one.name === wanted);
    if (found?.state === "connected") { this.machine = wanted; this.where = "tab"; }
    else this.launchError = `Props: machine ${wanted} is ${found ? found.state : "unknown"}`;
  }

  async applyProps(cx) {
    const p = props() ?? {};
    if (this.propsApplied) return;
    this.propsApplied = true;
    if (p.where === "tab" || p.where === "worktree") this.where = p.where;
    if (typeof p.repo === "string" && p.repo.startsWith("/") && !this.machine) await this.useFolder(p.repo, cx);
    if (typeof p.repo === "string" && this.machine && this.repos.includes(p.repo)) this.pickRepo(p.repo, cx);
    else if (typeof p.repo === "string" && this.machine) this.repoNote = `Repo ${p.repo} not found on ${this.machine}`;
    if (typeof p.task === "string" && p.task.trim()) this.taskInput.set_value(p.task.trim());
    if (typeof p.branch === "string" && p.branch.trim()) this.branchInput.set_value(p.branch.trim());
    if (p.plain === true) this.plain = true;
  }

  async useFolder(folder, cx) {
    const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder }).catch((e) => ({ code: 1, stderr: String(e.message ?? e) }));
    if (r.code !== 0) { this.reposError = `${folder} is not a git repository`; cx.notify(); return; }
    const top = r.stdout.trim();
    this.reposError = null;
    if (!this.repos.includes(top)) this.repos = [top, ...this.repos];
    this.pickRepo(top, cx);
  }

  chooseFolder(cx) {
    cx.spawn(async (cx) => {
      const folder = await pickFolder({ prompt: "Use repo" }).catch(() => null);
      if (folder) await this.useFolder(folder, cx);
      cx.notify();
    });
  }

  filteredRepos() {
    const f = this.repoFilter.value().trim().toLowerCase();
    return this.repos.filter((path) => !f || path.toLowerCase().includes(f));
  }

  refillTask() {
    if (this.template && this.repo) this.taskInput.set_value(defaultTask(this.template, this.repo));
    if (this.template) this.branchInput.set_value(defaultBranch(this.template, this.repo ? `${baseName(this.repo)} ${this.taskInput.value()}` : this.template));
  }

  pickTemplate(name, cx) {
    this.template = name; this.confirming = false; this.plain = false;
    this.refillTask();
    cx.spawn(async (cx) => refreshRemoteTemplate(this, cx));
    cx.notify();
  }

  pickRepo(path, cx) {
    this.repo = path; this.confirming = false; this.repoNote = null;
    this.refillTask();
    cx.notify();
  }

  pickWhere(where, cx) {
    this.where = where; this.confirming = false;
    if (where === "worktree" && !this.branchInput.value().trim()) this.refillTask();
    cx.notify();
  }

  launch(cx, confirmed) {
    if (this.launching || !this.template || !this.repo) return;
    const task = this.taskInput.value().trim();
    if (!task) { this.launchError = "Write a task for the agent."; cx.notify(); return; }
    const blocked = remoteBlock(this);
    if (blocked) { this.launchError = blocked; cx.notify(); return; }
    if (!confirmed && this.running.list().length >= CONFIRM_FROM) { this.confirming = true; cx.notify(); return; }
    const form = { template: this.template, repo: this.repo, task, branch: this.branchInput.value(), machine: this.machine ?? null, plain: this.plain };
    const where = this.machine ? "tab" : this.where;
    this.confirming = false; this.launching = true; this.launchError = null;
    cx.spawn(async (cx) => {
      try {
        const result = where === "worktree" ? await launchInWorktree(form, cx) : await launchInTeamTab(form, cx);
        this.lastLaunch = `${result.name} (${result.address}) in ${result.where}`;
        notify({ title: `${form.plain ? "claude" : form.template} started: ${baseName(form.repo)}`, body: result.sent ? this.lastLaunch : `${this.lastLaunch}: it did not take its task yet, open it and check its screen`,
          level: result.sent ? "success" : "warning", timeout: 5000, action: { name: "agent.focus", args: { terminal: result.address } } });
        if (where === "worktree") this.branchInput.set_value(defaultBranch(form.template, `${baseName(form.repo)} ${task}`));
      } catch (e) {
        this.launchError = `Could not start ${form.template}: ${e.message ?? e}`;
      } finally {
        this.launching = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  command(name, cx) {
    const section = /^section-(.+)$/.exec(name)?.[1];
    if (section && TABS.includes(section)) this.showSection(section, cx);
    else if (name === "focus") this.handle.focus();
    else if (name === "escape") escape(this, cx);
    else if (name === "dock" && props()?.overlay) this.togglePlace(cx);
    else if (name === "float" && !props()?.overlay) this.togglePlace(cx);
    else if (name === "tab") this.openTab(cx);
    else if (name === "refresh") this.load(cx);
    else if (name === "launch") this.launch(cx, false);
    else if (name === "dev-request") this.devRequest(cx);
    else if (TABS.includes(name)) this.showSection(name, cx);
    else notify({ title: "Team", body: `Unknown command: ${name}`, level: "warning" });
  }

  devRequest(cx) {
    const request = shared(DEV_REQUEST_KEY);
    if (!request || typeof request !== "object") return notify({ title: "Team", body: "No Start dev request to open.", level: "warning" });
    this.dev.prefill(request.jira, request.plan);
    this.showSection("dev", cx);
  }

  togglePlace(cx) {
    cx.spawn(async (cx) => {
      const error = props()?.overlay ? await dockHere(MOD, cx) : floatAgain(MOD);
      if (error) notify({ title: "Team", body: error, level: "warning" });
    });
  }

  openTab(cx) {
    if (!props()?.overlay) return;
    cx.spawn(async (cx) => {
      const error = await openAsTab(MOD, "Team", cx);
      if (error) notify({ title: "Team", body: error, level: "warning" });
    });
  }

  topBar(t) {
    const isWindow = Boolean(props()?.overlay);
    const tooltip = isWindow ? "Dock beside the focused pane (cmd-enter). New tab: cmd-shift-t" : "Back to a floating window (cmd-enter)";
    return h_flex().flex_none().h(32).px(10).gap(8).items_center().bg(t.chrome)
      .child(div().font_bold().text_size(13).child("Team"))
      .child(div().text_size(10.5).text_color(t.dim).child(isWindow ? "esc closes" : "agents"))
      .child(div().flex_1())
      .child(button("reload", "Reload", t, (_e, cx) => this.load(cx), { small: true, tooltip: "Reload templates and repos" }))
      .child(button("place", `${isWindow ? "Dock" : "Float"} \u{2318}\u{21b5}`, t, (_e, cx) => this.togglePlace(cx), { small: true, tooltip }));
  }

  render(cx) {
    const t = theme();
    return v_flex().id("team").size_full().min_h(0).bg(t.chrome).text_color(t.foreground).text_size(12).font_family(monoFont())
      .track_focus(this.handle)
      .on_key_down((e, cx) => { if (onKey(this, e, cx)) cx.stop_propagation(); })
      .on_size_change((size, cx) => this.resized(size, cx))
      .child(this.topBar(t))
      .child(tabBar(this, t))
      .child(v_flex().id(`team-body-${this.tab}`).flex_1().min_h(0).overflow_y_scrollbar().p(8).gap(6)
        .child(this.body(t)))
      .when(this.tab !== "running", (e) => e.child(statusStrip(this, t)));
  }

  resized(size, cx) {
    const wide = size.width >= WIDE_FROM;
    if (wide === this.wide) return;
    this.wide = wide;
    cx.notify();
  }

  body(t) {
    if (this.tab === "mr") return this.mr.render(this, t);
    if (this.tab === "agents") return agentsView(this, t);
    if (this.tab === "running") return this.running.render(t);
    return this.dev.render(this, t);
  }
}
