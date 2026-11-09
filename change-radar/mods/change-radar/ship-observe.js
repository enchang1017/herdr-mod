import { failedLogs } from "./ship-glab.js";
import { hash } from "./store.js";
import { seen, markSeen, saveFeedback, ciMessage, reviewMessage, isFresh, autoOn, autoSendOne, toast } from "./ship-feedback.js";

async function announce(item) {
  saveFeedback(item);
  if (item.stale) return;
  let sent = false;
  if (autoOn(item.sessionId)) sent = await autoSendOne(item).catch((e) => { saveFeedback({ ...item, sendError: String(e.message ?? e) }); return false; });
  toast(item, sent);
}

export async function observePipeline(ctx, pipeline) {
  if (pipeline?.status !== "failed") return;
  const id = `ci:${pipeline.id}`;
  if (seen(id)) return;
  markSeen([id]);
  const jobs = await failedLogs(ctx.path, pipeline.failed ?? []);
  await announce({
    id, kind: "ci", sessionId: ctx.sessionId, label: ctx.label, repo: ctx.repo, path: ctx.path, branch: ctx.branch ?? pipeline.ref,
    title: `CI failed: ${ctx.repo} ${ctx.branch ?? pipeline.ref} (by ${ctx.label})`, url: pipeline.url,
    text: ciMessage({ repo: ctx.repo, branch: ctx.branch ?? pipeline.ref, commit: ctx.kind === "p" ? ctx.commit : null }, pipeline, jobs),
    jobs: jobs.map((j) => ({ id: j.id, name: j.name, stage: j.stage, url: j.url })), at: Date.now(), stale: !isFresh(pipeline.at), sent: false,
  });
}

export async function observeMr(ctx, mr) {
  if (!mr) return;
  if (mr.pipeline) await observePipeline(ctx, mr.pipeline);
  const fresh = mr.unresolved.filter((n) => !seen(`note:${ctx.path}!${mr.iid}:${n.id}`));
  if (!fresh.length) return;
  markSeen(fresh.map((n) => `note:${ctx.path}!${mr.iid}:${n.id}`));
  await announce({
    id: `mr:${hash(`${ctx.path}!${mr.iid}:${fresh.map((n) => n.id).join(",")}`)}`, kind: "review", sessionId: ctx.sessionId, label: ctx.label,
    repo: ctx.repo, path: ctx.path, branch: ctx.branch, title: `${fresh.length} new review comment${fresh.length === 1 ? "" : "s"}: ${ctx.repo} !${mr.iid} (by ${ctx.label})`,
    url: mr.url, text: reviewMessage({ repo: ctx.repo, branch: ctx.branch }, mr, fresh), at: Date.now(), stale: !fresh.some((n) => isFresh(n.at)), sent: false,
  });
}
