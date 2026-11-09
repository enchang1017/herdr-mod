import { exec } from "herdr";
import { summarizeJobs, classifyGlabFailure, jobLog } from "./ci.js";

const SHA = /^[0-9a-f]{7,40}$/;
const BRANCH = /^[A-Za-z0-9._\/-]+$/;
const NOTE_MAX = 600;
const DISCUSSION_PAGE = 100;

async function get(path, cwd) {
  const ran = await exec("glab", ["api", "--method", "GET", path], { cwd });
  if (ran.code !== 0) throw new Error((ran.stderr || ran.stdout || `glab exited ${ran.code}`).trim());
  return JSON.parse(ran.stdout || "null");
}

export function problemOf(e) {
  return classifyGlabFailure(String(e?.message ?? e));
}

function pipelineOf(raw) {
  return raw ? { id: raw.id, status: raw.status, url: raw.web_url, ref: raw.ref, at: Date.parse(raw.updated_at ?? raw.created_at ?? "") || null, createdAt: Date.parse(raw.created_at ?? "") || null } : null;
}

async function withJobs(repo, pipeline) {
  if (!pipeline || pipeline.status !== "failed") return pipeline;
  const jobs = summarizeJobs(JSON.stringify(await get(`projects/:id/pipelines/${pipeline.id}/jobs?per_page=100`, repo)));
  return { ...pipeline, stages: jobs.stages, failed: jobs.failed.filter((j) => !j.allowed) };
}

export async function commitPipeline(repo, sha) {
  if (!SHA.test(sha)) throw new Error(`Not a commit sha: ${sha}`);
  const list = await get(`projects/:id/pipelines?sha=${sha}&per_page=1`, repo);
  return withJobs(repo, pipelineOf(Array.isArray(list) ? list[0] : null));
}

function pickMr(list) {
  const all = Array.isArray(list) ? list : [];
  return all.find((m) => m.state === "opened") ?? all[0] ?? null;
}

function unresolvedNotes(discussions) {
  return (Array.isArray(discussions) ? discussions : []).flatMap((d) => {
    const notes = (d.notes ?? []).filter((n) => n.resolvable && !n.system);
    if (!notes.length || notes.every((n) => n.resolved)) return [];
    const first = notes[0], pos = first.position ?? {};
    return [{ id: String(d.id), author: first.author?.username ?? "?", body: String(first.body ?? "").slice(0, NOTE_MAX), path: pos.new_path ?? pos.old_path ?? null, line: pos.new_line ?? pos.old_line ?? null, replies: notes.length - 1, at: Date.parse(first.created_at ?? "") || null }];
  });
}

function mrOf(raw, approvals, discussions) {
  return {
    iid: raw.iid, title: raw.title, url: raw.web_url, state: raw.state, draft: raw.draft === true || raw.work_in_progress === true,
    at: Date.parse(raw.updated_at ?? "") || null, approved: approvals?.approved === true, approvedBy: (approvals?.approved_by ?? []).map((a) => a.user?.username).filter(Boolean),
    approvalsLeft: approvals?.approvals_left ?? null, pipeline: pipelineOf(raw.head_pipeline ?? raw.pipeline ?? null), unresolved: unresolvedNotes(discussions),
  };
}

export async function branchMr(repo, branch) {
  if (!BRANCH.test(branch)) throw new Error(`Not a branch name: ${branch}`);
  const found = pickMr(await get(`projects/:id/merge_requests?source_branch=${encodeURIComponent(branch)}&state=all&per_page=5`, repo));
  if (!found) return null;
  const [raw, approvals, discussions] = await Promise.all([
    get(`projects/:id/merge_requests/${found.iid}`, repo),
    get(`projects/:id/merge_requests/${found.iid}/approvals`, repo).catch(() => null),
    get(`projects/:id/merge_requests/${found.iid}/discussions?per_page=${DISCUSSION_PAGE}`, repo),
  ]);
  const mr = mrOf(raw, approvals, discussions);
  return { ...mr, pipeline: await withJobs(repo, mr.pipeline) };
}

export async function failedLogs(repo, jobs, max = 3) {
  const out = [];
  for (const job of jobs.slice(0, max)) out.push({ ...job, log: await jobLog(repo, job.id, null).catch((e) => `(could not read the log: ${e.message ?? e})`) });
  return out;
}
