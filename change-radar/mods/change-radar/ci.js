import { exec } from "herdr";
import { gitHost } from "./settings.js";

const ACTIVE_PIPELINE = new Set(["running", "pending", "created", "preparing", "waiting_for_resource", "scheduled"]);
const DONE_JOB = new Set(["success", "skipped"]);
const ACTIVE_JOB = new Set(["running", "pending", "preparing", "waiting_for_resource", "created"]);
const NO_GLAB = /ENOENT|command not found|executable file not found|No such file or directory|failed to spawn|\bexit 127\b/i;
const NO_REMOTE = /none of the git remotes|known GitLab host|no (git )?remotes?\b|not a gitlab|could not determine (the )?(host|remote|project)/i;
const AUTH_FAILURE = /glab auth login|\b40[13]\b|unauthorized|forbidden|not logged in|invalid token|authentication/i;
const UNREACHABLE = /no such host|could not resolve|connection refused|timed? ?out|network is unreachable|dial tcp/i;
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
const SECTION = /section_(start|end):\d+:[^\s\u001b]*/g;
export const LOG_LINES = 80;

export function isPipelineActive(pipeline) {
  return Boolean(pipeline) && ACTIVE_PIPELINE.has(pipeline.status);
}

function authHint(host) {
  return host ? `glab is not signed in: run glab auth login --hostname ${host}` : "glab is not signed in: run glab auth login (set gitHost in data/change-radar/settings.json for the exact command)";
}

export function classifyGlabFailure(message) {
  if (NO_GLAB.test(message)) return { kind: "no-glab", text: "glab is not installed", blocking: true };
  if (NO_REMOTE.test(message)) return { kind: "no-remote", text: "no GitLab remote", blocking: false };
  if (AUTH_FAILURE.test(message)) return { kind: "auth", text: authHint(gitHost()), blocking: true };
  if (UNREACHABLE.test(message)) return { kind: "unreachable", text: `${gitHost() || "The GitLab host"} is unreachable (VPN or DNS?)`, blocking: true };
  return { kind: "error", text: message.split("\n")[0].slice(0, 200), blocking: false };
}

function parseList(json) {
  const list = JSON.parse(json || "[]");
  return Array.isArray(list) ? list : [];
}

export function parseMergeRequest(json) {
  const [first] = parseList(json);
  if (!first) return null;
  return { iid: first.iid, title: first.title, url: first.web_url, state: first.state, draft: first.draft === true || first.work_in_progress === true };
}

export function parsePipeline(json) {
  const [first] = parseList(json);
  return first ? { id: first.id, iid: first.iid, status: first.status, url: first.web_url } : null;
}

function stageStatus(jobs) {
  const has = (status) => jobs.some((job) => job.status === status);
  if (has("failed")) return "failed";
  if (jobs.some((job) => ACTIVE_JOB.has(job.status))) return "running";
  if (jobs.every((job) => DONE_JOB.has(job.status))) return "success";
  if (has("manual")) return "manual";
  if (has("canceled")) return "canceled";
  return "created";
}

function countBy(jobs) {
  return jobs.reduce((counts, job) => ({ ...counts, [job.status]: (counts[job.status] ?? 0) + 1 }), {});
}

export function summarizeJobs(json) {
  const jobs = parseList(json).slice().sort((a, b) => a.id - b.id);
  const order = [...new Set(jobs.map((job) => job.stage))];
  return {
    stages: order.map((name) => {
      const mine = jobs.filter((job) => job.stage === name);
      return { name, status: stageStatus(mine), done: mine.filter((job) => DONE_JOB.has(job.status)).length, total: mine.length, counts: countBy(mine) };
    }),
    failed: jobs.filter((job) => job.status === "failed").map((job) => ({ id: job.id, name: job.name, stage: job.stage, url: job.web_url, allowed: job.allow_failure === true })),
  };
}

export function currentStage(jobs) {
  if (!jobs?.stages.length) return null;
  return jobs.stages.find((stage) => stage.status !== "success") ?? jobs.stages[jobs.stages.length - 1];
}

async function glab(args, cwd, on) {
  const ran = await exec("glab", args, { cwd, on });
  if (ran.code !== 0) throw new Error((ran.stderr || ran.stdout || `glab exited ${ran.code}`).trim());
  return ran.stdout;
}

export async function loadCi(path, branch, on) {
  if (!branch) return { problem: { kind: "detached", text: "detached HEAD", blocking: false } };
  try {
    const [mrJson, pipelineJson] = await Promise.all([
      glab(["mr", "list", "--source-branch", branch, "--all", "-P", "1", "-F", "json"], path, on),
      glab(["ci", "list", "-r", branch, "-P", "1", "-F", "json"], path, on),
    ]);
    const pipeline = parsePipeline(pipelineJson);
    const jobs = pipeline ? summarizeJobs(await glab(["api", `projects/:id/pipelines/${pipeline.id}/jobs?per_page=100`], path, on)) : null;
    return { branch, mr: parseMergeRequest(mrJson), pipeline, jobs };
  } catch (e) {
    return { branch, problem: classifyGlabFailure(String(e.message ?? e)) };
  }
}

function cleanLine(line) {
  const last = line.split("\r").filter((part) => part.length).pop() ?? "";
  return last.replace(SECTION, "").replace(ANSI, "").replace(/\u001b/g, "");
}

export function logTail(raw, count = LOG_LINES) {
  const lines = raw.replace(/\n+$/, "").split("\n").map(cleanLine).filter((line) => line.trim());
  return lines.slice(-count).join("\n");
}

export async function jobLog(path, jobId, on) {
  const raw = await glab(["api", `projects/:id/jobs/${jobId}/trace`], path, on);
  return logTail(raw);
}
