import { notify, setShared, hc, run } from "herdr";
import { readShared } from "./lease.js";
import { liveTerminals } from "./agents.js";
import { claudeSession } from "./target.js";

const FEEDBACK_KEY = "change-radar.ship-feedback";
const SEEN_KEY = "change-radar.ship-seen";
const AUTO_KEY = "change-radar.ship-auto";
const FRESH_MS = 3_600_000;
const KEEP_MS = 7 * 86_400_000;
const LOG_LINES = 40;
const TEXT_MAX = 7000;
const SID = /^[\w-]+$/;

export const feedbackList = () => Object.values(readShared(FEEDBACK_KEY)).sort((a, b) => b.at - a.at);
export const seen = (id) => Boolean(readShared(SEEN_KEY)[id]);

export function markSeen(ids) {
  const now = Date.now();
  const kept = Object.entries(readShared(SEEN_KEY)).filter(([, at]) => now - at < KEEP_MS);
  setShared(SEEN_KEY, { ...Object.fromEntries(kept), ...Object.fromEntries(ids.map((id) => [id, now])) });
}

export function saveFeedback(item) {
  const now = Date.now();
  const kept = Object.entries(readShared(FEEDBACK_KEY)).filter(([, one]) => now - one.at < KEEP_MS);
  setShared(FEEDBACK_KEY, { ...Object.fromEntries(kept), [item.id]: item });
}

export function dropFeedback(id) {
  setShared(FEEDBACK_KEY, Object.fromEntries(Object.entries(readShared(FEEDBACK_KEY)).filter(([k]) => k !== id)));
}

export function autoState() {
  const raw = readShared(AUTO_KEY);
  return { default: raw.default === true, sessions: raw.sessions && typeof raw.sessions === "object" ? raw.sessions : {} };
}

export function autoOn(sessionId) {
  const state = autoState();
  return typeof state.sessions[sessionId] === "boolean" ? state.sessions[sessionId] : state.default;
}

export function setAuto(sessionId, value) {
  const state = autoState();
  const next = sessionId ? { ...state, sessions: { ...state.sessions, [sessionId]: value } } : { ...state, default: value };
  setShared(AUTO_KEY, next);
}

const tail = (text) => String(text ?? "").split("\n").slice(-LOG_LINES).join("\n");
const bound = (text) => (text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX)}\n(truncated)` : text);

export function ciMessage(ctx, pipeline, jobs) {
  const head = `CI failed for ${ctx.repo} on branch ${ctx.branch ?? "?"}: pipeline #${pipeline.id} (${pipeline.url})${ctx.commit ? ` at commit ${ctx.commit.short} "${ctx.commit.subject}"` : ""}.`;
  const parts = jobs.map((j) => `Job ${j.name} (stage ${j.stage}) ${j.url}\nLast log lines:\n${tail(j.log)}`);
  return bound([head, ...parts, "Please find the cause, fix it and push again. Do not post anything on GitLab."].join("\n\n"));
}

export function reviewMessage(ctx, mr, notes) {
  const head = `New unresolved review comments on MR !${mr.iid} "${mr.title}" (${mr.url}) in ${ctx.repo}, branch ${ctx.branch}:`;
  const items = notes.map((n, i) => `${i + 1}. ${n.path ? `${n.path}${n.line ? `:${n.line}` : ""}` : "(general)"} by @${n.author}: ${n.body.replace(/\s+/g, " ").trim()}`);
  return bound([head, ...items, "Please address these comments in the code and push. Do not reply, resolve or approve on GitLab."].join("\n"));
}

export const isFresh = (at) => !at || Date.now() - at < FRESH_MS;

export async function resolveSession(sessionId) {
  if (!SID.test(sessionId ?? "")) return null;
  for (const one of liveTerminals().filter((t) => t.address && !t.address.includes("/"))) {
    const session = await claudeSession(one.address).catch(() => null);
    if (session?.sessionId === sessionId) {
      return { address: one.address, status: session.status ?? null, pid: session.pid ?? null };
    }
  }
  return null;
}

async function send(address, text, onlyIdle) {
  const ran = await hc(["send", ...(onlyIdle ? ["--if", "idle"] : []), address, text]);
  if (ran.code !== 0) throw new Error((ran.stderr || ran.stdout).trim() || `hc send exited ${ran.code}`);
}

function markSent(item, address, auto) {
  saveFeedback({ ...item, sent: true, sentAt: Date.now(), sentTo: address, auto });
}

export async function sendFeedback(item) {
  const target = await resolveSession(item.sessionId);
  if (!target) return { live: false };
  await send(target.address, item.text, false);
  markSent(item, target.address, false);
  notify({ title: `Sent to ${item.label}`, body: item.title, level: "success", timeout: 3000, action: { name: "pane.focus", args: { terminal: target.address } } });
  return { live: true, address: target.address };
}

export function reviveAndSend(item, session) {
  if (!SID.test(item.sessionId)) return;
  run("tab.new", { name: item.label, argv: ["claude", "--resume", item.sessionId], task: item.text, ...(session?.cwd ? { folder: session.cwd } : {}) });
  markSent(item, "revived", false);
}

export async function autoSendOne(item) {
  const target = await resolveSession(item.sessionId);
  if (!target || target.status !== "idle") return false;
  await send(target.address, item.text, true);
  markSent(item, target.address, true);
  notify({ title: `Auto-sent to ${item.label}`, body: item.title, level: "info", timeout: 5000, action: { name: "pane.focus", args: { terminal: target.address } } });
  return true;
}

export function queuedAuto() {
  return feedbackList().filter((f) => !f.sent && !f.stale && !f.dismissed && autoOn(f.sessionId));
}

export function toast(item, sent) {
  notify({
    title: item.title,
    body: sent ? "Auto-sent to the agent" : autoOn(item.sessionId) ? "Auto-send queued until the agent is idle. Click to open the Session tab" : "Click to open the Session tab: Send to agent / Open are under Pipelines",
    level: item.kind === "ci" ? "error" : "warning",
    timeout: 10000,
    action: { name: `change-radar.ship-open-${item.sessionId}` },
  });
}
