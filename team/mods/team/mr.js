import { div } from "gpui-kit";
import { v_flex, h_flex, InputState } from "gpui-base";
import { exec, home, readTextFile, notify } from "herdr";
import { agentName, launchTemplate, nameTab, teamTabId } from "./agents.js";
import { spaceOn } from "./launch.js";
import { baseName } from "./data.js";
import { button, card, shade, field, errorRow } from "./kit.js";
import { loadSettings, workspaceRootPath, gitHost } from "./settings.js";

const ANY_HOST = "[A-Za-z0-9.-]+(?::\\d+)?";
const MR_PATH = "((?:[A-Za-z0-9._-]+\\/)+[A-Za-z0-9._-]+)\\/-\\/merge_requests\\/(\\d+)(?:[/?#]\\S*)?$";
const MR_EXAMPLE = "https://<gitlab-host>/<group>/<project>/-/merge_requests/<iid>";
const TEMPLATE = "mr-reviewer";
const TEAM = "mr-review";
const CONFIRM_FROM = 2;
const RESULT_DIR = () => `${home()}/.cache/herdr-team/mr-review`;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function mrPattern(host) {
  return new RegExp(`^https:\\/\\/(${host ? escapeRegex(host) : ANY_HOST})\\/${MR_PATH}`);
}

export function parseMrUrl(text) {
  const url = text.trim();
  const host = gitHost();
  const match = mrPattern(host).exec(url);
  if (!match) throw new Error(`Paste a merge request URL like ${host ? MR_EXAMPLE.replace("<gitlab-host>", host) : MR_EXAMPLE}`);
  return { url: `https://${match[1]}/${match[2]}/-/merge_requests/${match[3]}`, project: match[2], iid: match[3] };
}

async function localRepo(project) {
  await loadSettings();
  const path = `${workspaceRootPath()}/${baseName(project)}`;
  const found = await exec("test", ["-e", `${path}/.git`]).catch(() => ({ code: 1 }));
  return found.code === 0 ? path : null;
}

function mrTask(mr, repo, note) {
  return [
    `Review merge request ${mr.url} (project ${mr.project}, iid ${mr.iid}).`,
    repo ? `Local repo for reading surrounding code only: ${repo}.` : `No local checkout was found under ${workspaceRootPath()}; read code from the MR diff and glab only.`,
    note ? `Focus note from the user: ${note}` : "",
  ].filter(Boolean).join("\n");
}

export async function readMrResult(address) {
  const text = await readTextFile(`${RESULT_DIR()}/${address}.json`).catch(() => null);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return { url: typeof parsed.url === "string" ? parsed.url : null, file: typeof parsed.file === "string" ? parsed.file : null, counts: String(parsed.counts ?? "") };
  } catch (e) {
    return { url: null, file: null, counts: "", error: `Result file for ${address} is not valid JSON: ${e.message ?? e}` };
  }
}

export function openLink(target, cx, onError) {
  cx.spawn(async (cx) => {
    const r = await exec("open", [target]).catch((e) => ({ code: 1, stderr: String(e.message ?? e) }));
    if (r.code !== 0) onError(`Could not open ${target}: ${(r.stderr || "").trim() || `exit ${r.code}`}`);
    cx.notify();
  });
}

export function resultRow(id, result, t, onError) {
  if (result.error) return div().text_size(10.5).text_color(t.ansi1).child(result.error);
  const target = result.url ?? result.file;
  if (!target) return div().text_size(10.5).text_color(t.blocked).child(`Report not published${result.counts ? `: ${result.counts}` : ""}`);
  return h_flex().gap(6).items_center().px(6).py(3).rounded(6).bg(shade(t.accent, "subtle"))
    .child(div().flex_none().text_size(10.5).font_semibold().text_color(t.accent).child(result.url ? "Link" : "Report"))
    .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.foreground).child(`${result.counts ? `${result.counts}  ` : ""}${target}`))
    .child(button(`open-${id}`, "Open", t, (_e, cx) => openLink(target, cx, onError), { small: true }))
    .child(button(`copy-${id}`, "Copy", t, (_e, cx) => cx.write_to_clipboard(target), { small: true }));
}

export class MrReview {
  constructor() {
    this.url = InputState.new({ placeholder: MR_EXAMPLE });
    this.note = InputState.new({ placeholder: "optional: what to look at closely" });
    this.launching = false; this.error = null; this.last = null; this.confirming = false;
  }

  launch(app, cx, confirmed) {
    if (this.launching) return;
    let mr = null;
    try {
      mr = parseMrUrl(this.url.value());
    } catch (e) {
      this.error = String(e.message ?? e);
      cx.notify();
      return;
    }
    if (!confirmed && app.running.list().length >= CONFIRM_FROM) { this.confirming = true; cx.notify(); return; }
    this.confirming = false; this.launching = true; this.error = null;
    const note = this.note.value().trim();
    cx.spawn(async (cx) => {
      try {
        const started = await this.start(mr, note, cx);
        this.last = `${started.name} (${started.address}) on ${mr.project} !${mr.iid}`;
        notify({ title: `mr-reviewer started: ${baseName(mr.project)} !${mr.iid}`, body: this.last, level: "success", timeout: 5000, action: { name: "agent.focus", args: { terminal: started.address } } });
      } catch (e) {
        this.error = `Could not start mr-reviewer: ${e.message ?? e}`;
      } finally {
        this.launching = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  async start(mr, note, cx) {
    const repo = await localRepo(mr.project);
    const cwd = workspaceRootPath();
    const space = await spaceOn(null, cwd, cx);
    if (!space) throw new Error("No space on this Mac to hold the team tab.");
    const tab = teamTabId(space.id);
    cx.spawn(async (cx) => nameTab(space.id, tab, cx));
    const name = agentName(`mr-${baseName(mr.project)}-${mr.iid}`);
    return launchTemplate({ template: TEMPLATE, team: TEAM, name, cwd, repo: mr.project, space: space.id, tab, task: mrTask(mr, repo, note), on: null });
  }

  confirmRow(app, t) {
    return h_flex().gap(8).px(10).py(8).items_center().rounded(8).border_1().border_color(shade(t.blocked, "border")).bg(shade(t.blocked, "subtle"))
      .child(div().flex_1().text_size(11.5).text_color(t.blocked).child(`${app.running.list().length} agents already running: each is a full Claude session using quota. Start another?`))
      .child(button("mr-confirm-yes", "Start anyway", t, (_e, cx) => this.launch(app, cx, true), { primary: true, small: true }))
      .child(button("mr-confirm-no", "Cancel", t, (_e, cx) => { this.confirming = false; cx.notify(); }, { small: true, tooltip: "esc" }));
  }

  render(app, t) {
    return card(t, "mr")
      .child(v_flex().p(8).gap(6)
        .child(div().text_size(10.5).text_color(t.dim).child("mr-reviewer: read-only review of a GitLab merge request; its report link shows in Running."))
        .child(field(t, "mr-url", "MR URL", this.url, app.wide))
        .child(field(t, "mr-note", "FOCUS", this.note, app.wide))
        .when(Boolean(this.error), (e) => e.child(errorRow(t, this.error ?? "")))
        .child(this.confirming ? this.confirmRow(app, t) : this.launchRow(app, t)));
  }

  launchRow(app, t) {
    return h_flex().gap(8).items_center()
      .child(button("mr-launch", this.launching ? "Starting…" : "Review", t, (_e, cx) => this.launch(app, cx, false), { primary: true, disabled: this.launching }))
      .child(div().flex_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(this.last ?? "Starts in this space's team tab; its Running row gets the report link."));
  }
}
