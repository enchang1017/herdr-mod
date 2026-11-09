import { div } from "gpui-kit";
import { v_flex, h_flex, InputState } from "gpui-base";
import { run, spaces, exec, hc, pickFolder, props, closeOverlay, notify } from "herdr";
import { agentName, errorText, localId, machineHome, nameTab } from "./agents.js";
import { devTabId, leadBase, leadRunArgs } from "./lead.js";
import { spaceOn } from "./launch.js";
import { baseName } from "./data.js";
import { button, card, tabs, field, labeled, errorRow } from "./kit.js";
import { loadSettings, workspaceRoot, planUrlPattern } from "./settings.js";

const JIRA_KEY = /^[A-Z][A-Z0-9]+-\d+$/;
const ANY_HTTPS = /^https:\/\/\S+$/;
const DEV_ARGV = ["claude", "--model", "opus"];
const WAIT_MS = 250;
const WAIT_TRIES = 40;
const SHELL_CHECK = 'printf %s "${SHELL:-/bin/sh}"';
const SKILL_CHECK = 'if [ -f "$1/.claude/skills/dev-lead/SKILL.md" ]; then echo /dev-lead; else exit 1; fi';

export function isPlanUrl(url) {
  const pattern = planUrlPattern();
  return pattern ? new RegExp(`^(?:${pattern})\\/?(?:[?#]\\S*)?$`).test(url) : ANY_HTTPS.test(url);
}

export function devInputs(jira, plan) {
  const key = jira.trim().toUpperCase();
  const url = plan.trim();
  if (key && !JIRA_KEY.test(key)) throw new Error(`Jira key must look like PROJ-123, not ${key}`);
  if (url && !isPlanUrl(url)) throw new Error(planUrlPattern() ? "Plan URL does not match planUrlPattern in data/team/settings.json" : "Plan URL must start with https://");
  return { key, url };
}

export function devMessage(command, key, url) {
  return [command, key, url].filter(Boolean).join(" ");
}

async function resolveFolder(text, on) {
  const raw = text.trim() || workspaceRoot();
  const base = await machineHome(on);
  const dir = raw === "~" ? base : raw.startsWith("~/") ? `${base}/${raw.slice(2)}` : raw;
  if (!dir.startsWith("/")) throw new Error(`Folder must start with / or ~: ${raw}`);
  const found = await exec("test", ["-d", dir], { on });
  if (found.code !== 0) throw new Error(`${dir} is not a folder${on ? ` on ${on}` : ""}`);
  const skill = await exec("sh", ["-c", SKILL_CHECK, "sh", base], { on });
  if (skill.code !== 0) throw new Error(`The dev-lead skill is not installed${on ? ` on ${on}` : ""} (~/.claude/skills/dev-lead)`);
  return { dir: dir.replace(/\/+$/, "") || "/", command: skill.stdout.trim() };
}

async function waitForTab(spaceId, tabId, cx) {
  for (let attempt = 0; attempt < WAIT_TRIES; attempt += 1) {
    const tab = spaces().find((one) => one.id === spaceId)?.tabs.find((one) => localId(one.id) === tabId);
    if (tab) return tab;
    await cx.sleep(WAIT_MS);
  }
  return null;
}

async function loginShell(on) {
  const r = await exec("sh", ["-c", SHELL_CHECK], { on });
  return r.code === 0 && r.stdout.trim().startsWith("/") ? r.stdout.trim() : "/bin/sh";
}

async function startLead(form, space, tabId) {
  const lead = agentName(leadBase(form.key, baseName(form.folder)));
  const args = leadRunArgs({ name: lead, folder: form.folder, machine: form.machine, space: localId(space.id), tab: tabId,
    shell: await loginShell(form.machine), argv: [...DEV_ARGV, devMessage(form.command, form.key, form.url)] });
  const ran = await hc(args);
  if (ran.code !== 0) throw new Error(errorText(ran));
  return lead;
}

async function openDevTab(form, cx) {
  const space = await spaceOn(form.machine, form.folder, cx);
  if (!space) throw new Error("No space is focused to hold the dev tab.");
  const name = `dev ${form.key || baseName(form.folder)}`;
  const tabId = devTabId(Date.now());
  const lead = await startLead(form, space, tabId);
  const tab = await waitForTab(space.id, tabId, cx);
  if (!tab) throw new Error(`The ${name} tab did not appear.`);
  await nameTab(space.id, tabId, cx, name);
  run("tab.select", { id: tab.id });
  return { name, tab: tab.id, lead };
}

export class DevStart {
  constructor() {
    this.jira = InputState.new({ placeholder: "PROJ-123 (optional)" });
    this.plan = InputState.new({ placeholder: "https://... plan link (optional)" });
    this.folder = InputState.new({ placeholder: "the lead's working folder" });
    this.folder.set_value(workspaceRoot());
    this.machine = null; this.launching = false; this.error = null; this.last = null;
  }

  focus() {
    this.jira.focus();
  }

  prefill(key, plan) {
    if (typeof key !== "string" || !JIRA_KEY.test(key)) return;
    this.jira.set_value(key);
    this.plan.set_value(typeof plan === "string" && isPlanUrl(plan) ? plan : "");
    this.error = null;
  }

  loadDefaults(cx) {
    const shown = workspaceRoot();
    cx.spawn(async (cx) => {
      try {
        await loadSettings();
        if (this.folder.value() === shown) this.folder.set_value(workspaceRoot());
      } catch (e) {
        this.error = String(e.message ?? e);
      }
      cx.notify();
    });
  }

  chooseFolder(cx) {
    cx.spawn(async (cx) => {
      const picked = await pickFolder({ prompt: "Dev folder" }).catch(() => null);
      if (picked) this.folder.set_value(picked);
      cx.notify();
    });
  }

  pickMachine(name, cx) {
    this.machine = name || null; this.error = null;
    cx.notify();
  }

  launch(cx) {
    if (this.launching) return;
    let inputs = null;
    try {
      inputs = devInputs(this.jira.value(), this.plan.value());
    } catch (e) {
      this.error = String(e.message ?? e);
      cx.notify();
      return;
    }
    const machine = this.machine;
    this.launching = true; this.error = null;
    cx.spawn(async (cx) => {
      try {
        const { dir: folder, command } = await resolveFolder(this.folder.value(), machine);
        const opened = await openDevTab({ ...inputs, folder, command, machine }, cx);
        const message = devMessage(command, inputs.key, inputs.url);
        this.last = `${opened.name} (${opened.lead}): ${message}`;
        notify({ title: `${opened.name} started`, body: `${opened.lead}: claude ${message} in ${folder}`, level: "success", timeout: 5000 });
        if (props()?.overlay) closeOverlay(props().overlay);
      } catch (e) {
        this.error = `Could not start dev: ${e.message ?? e}`;
      } finally {
        this.launching = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  machineRow(app, t) {
    const connected = app.machines.filter((one) => one.state === "connected").map((one) => [one.name, one.name]);
    return labeled(t, "MACHINE", h_flex().child(tabs(t, "dev-machine", [["", "This Mac"], ...connected], this.machine ?? "", (key, _e, cx) => this.pickMachine(key, cx))), app.wide);
  }

  render(app, t) {
    const folderButton = button("dev-folder", "Folder…", t, (_e, cx) => this.chooseFolder(cx), { small: true, disabled: Boolean(this.machine), tooltip: "Pick the working folder on this Mac" });
    return card(t, "dev")
      .child(v_flex().p(8).gap(6)
        .child(div().text_size(10.5).text_color(t.dim).child("New tab running claude /dev-lead with the Jira key and plan link."))
        .child(field(t, "dev-jira", "JIRA", this.jira, app.wide))
        .child(field(t, "dev-plan", "PLAN", this.plan, app.wide))
        .child(field(t, "dev-folder-input", "FOLDER", this.folder, app.wide, [folderButton]))
        .child(this.machineRow(app, t))
        .when(Boolean(this.error), (e) => e.child(errorRow(t, this.error ?? "")))
        .child(h_flex().gap(8).items_center()
          .child(button("dev-launch", this.launching ? "Starting…" : "Start dev", t, (_e, cx) => this.launch(cx), { primary: true, disabled: this.launching }))
          .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(this.last ?? "Opens a tab running the dev-lead skill; teammates start later, from the lead."))));
  }
}
