import { div } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { button, chip, card, cardHeader, glyph, icon, caret, shade, ICONS } from "./kit.js";
import { errorRow, spinner, note, summaryBox, monoFont } from "./ui.js";
import { currentStage } from "./ci.js";

const CARD_MAX_PX = 340;
const LOG_MAX_PX = 220;

export function statusLook(t, status) {
  switch (status) {
    case "success": return { icon: "check", color: t.ansi2, label: "passed" };
    case "failed": return { icon: "x", color: t.ansi1, label: "failed" };
    case "running": return { icon: "circle-dot", color: t.working, label: "running" };
    case "pending":
    case "created":
    case "preparing":
    case "waiting_for_resource":
    case "scheduled": return { icon: "clock", color: t.ansi3, label: status.replace(/_/g, " ") };
    case "manual": return { icon: "play", color: t.ansi4, label: "manual" };
    case "canceled": return { icon: "ban", color: t.dim, label: "canceled" };
    case "skipped": return { icon: "ban", color: t.dim, label: "skipped" };
    default: return { icon: "circle-help", color: t.dim, label: status ?? "unknown" };
  }
}

export function mrLook(t, mr) {
  if (mr.state === "merged") return { color: t.ansi5, label: "merged" };
  if (mr.state === "closed") return { color: t.dim, label: "closed" };
  return mr.draft ? { color: t.muted, label: "draft" } : { color: t.ansi4, label: "open" };
}

function fenced(text) {
  const fence = "~".repeat(Math.max(3, ...(text.match(/~+/g) ?? []).map((run) => run.length + 1)));
  return `${fence}\n${text}\n${fence}`;
}

export function ciChips(t, entry) {
  const data = entry?.data;
  if (!data || data.problem) return [];
  const mr = data.mr ? [chip(t, `!${data.mr.iid} ${mrLook(t, data.mr).label}`, mrLook(t, data.mr).color, "outline")] : [];
  const pipe = data.pipeline ? [chip(t, "CI", statusLook(t, data.pipeline.status).color, "tint", statusLook(t, data.pipeline.status).icon)] : [];
  return [...mr, ...pipe];
}

function linkRow(t, id, name, color, text, url) {
  return h_flex().id(id).gap(8).items_center().text_size(11.5).cursor_pointer().hover((s) => s.underline())
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => cx.open_url(url))
    .child(icon(name, 13, color))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(text))
    .child(glyph(t.dim, "\u{2197}"));
}

function stageChip(t, stage, index) {
  const look = statusLook(t, stage.status);
  return h_flex().id(`stage-${index}`).h(22).px(8).gap(6).items_center().rounded(6).border_1().border_color(shade(look.color, "border")).bg(shade(look.color, "subtle"))
    .tooltip(Object.entries(stage.counts).map(([status, count]) => `${count} ${status}`).join(", "))
    .child(icon(look.icon, 12, look.color))
    .child(div().text_size(11).text_color(t.foreground).child(stage.name))
    .child(div().text_size(10.5).text_color(t.dim).child(`${stage.done}/${stage.total}`));
}

function logBlock(store, path, job, t) {
  const log = store.log(path, job);
  if (!log) return null;
  if (log.loading) return spinner(t, "Reading the job log…");
  if (log.error) return errorRow(t, `Could not read the log: ${log.error}`, `log-${job.id}`);
  const analysis = store.analysis(path, job);
  return v_flex().gap(6)
    .child(h_flex().gap(6)
      .child(button(`log-copy-${job.id}`, "Copy", t, (_e, cx) => cx.write_to_clipboard(log.text), { small: true }))
      .child(button(`log-ai-${job.id}`, analysis ? "Analyze again" : "AI analyze failure", t, (_e, cx) => store.analyze(path, job, Boolean(analysis), cx), { small: true, primary: !analysis, disabled: Boolean(analysis?.loading) })))
    .child(div().id(`log-text-${job.id}`).max_h(LOG_MAX_PX).overflow_y_scrollbar().rounded(6).bg(t.surface).border_1().border_color(t.border).p(6)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(TextView.markdown(`log-md-${job.id}`, fenced(log.text)).selectable(true).font_family(monoFont()).text_size(10.5)))
    .when(Boolean(analysis), (e) => e.child(summaryBox(t, analysis, (_e, cx) => store.analyze(path, job, true, cx))));
}

export function failedJob(store, path, job, t) {
  const open = Boolean(store.log(path, job));
  return v_flex().gap(4)
    .child(h_flex().id(`job-${job.id}`).h(24).px(6).gap(8).items_center().rounded(5).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => store.toggleLog(path, job, cx))
      .child(caret(open, t.dim))
      .child(icon(ICONS.close, 12, t.ansi1))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).child(job.name))
      .child(div().text_size(10.5).text_color(t.dim).child(job.allowed ? `${job.stage} (allowed)` : job.stage))
      .child(button(`job-open-${job.id}`, "\u{2197}", t, (_e, cx) => cx.open_url(job.url), { small: true, ghost: true, tooltip: "Open the job in the browser" })))
    .when(open, (e) => e.child(div().pl(22).child(logBlock(store, path, job, t))));
}

function pipelineBody(store, path, data, t) {
  const look = statusLook(t, data.pipeline.status);
  const stage = currentStage(data.jobs);
  return v_flex().gap(8)
    .child(linkRow(t, "ci-pipeline", look.icon, look.color, `Pipeline #${data.pipeline.id} ${look.label}${stage && data.pipeline.status !== "success" ? ` \u{b7} ${stage.name}` : ""}`, data.pipeline.url))
    .when(Boolean(data.jobs?.stages.length), (e) => e.child(h_flex().gap(6).flex_wrap().children(data.jobs.stages.map((one, i) => stageChip(t, one, i)))))
    .when(Boolean(data.jobs?.failed.length), (e) => e.child(v_flex().gap(2).children(data.jobs.failed.map((job) => failedJob(store, path, job, t)))));
}

function body(store, path, t) {
  if (store.blocked) return errorRow(t, `GitLab: ${store.blocked.text}`, "ci-blocked");
  const entry = store.get(path);
  if (!entry) return spinner(t, "Asking GitLab…");
  const data = entry.data;
  if (data.problem) return data.problem.kind === "no-remote" || data.problem.kind === "detached" ? note(t, `No CI: ${data.problem.text}`) : errorRow(t, `GitLab: ${data.problem.text}`, "ci-error");
  return v_flex().gap(8)
    .child(data.mr ? linkRow(t, "ci-mr", ICONS.mr, mrLook(t, data.mr).color, `!${data.mr.iid} ${mrLook(t, data.mr).label} \u{b7} ${data.mr.title}`, data.mr.url) : note(t, `No merge request for ${data.branch}`))
    .child(data.pipeline ? pipelineBody(store, path, data, t) : note(t, `No pipeline for ${data.branch}`));
}

export function ciCard(store, path, branch, t, onRefresh) {
  const busy = store.running.has(path);
  return card(t, "ci-card").mx(8).mt(8)
    .child(cardHeader(t, {
      icon: ICONS.ci, title: "GitLab", chips: branch ? [chip(t, branch, t.muted, "outline")] : [],
      actions: [button("ci-refresh", busy ? "Refreshing…" : "Refresh", t, onRefresh, { small: true, disabled: busy })],
    }))
    .child(div().id("ci-body").max_h(CARD_MAX_PX).overflow_y_scrollbar().p(10).child(body(store, path, t)));
}
