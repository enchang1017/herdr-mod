import { notify } from "herdr";
import { trimDiff, buildPrompt, cachedSummary, untrackedNote, DIFF_LIMIT } from "./summary.js";
import { untrackedDiff } from "./ranges.js";
import { hash } from "./store.js";
import { sessionDiffText } from "./session-git.js";
import { resolveTarget, deliver } from "./target.js";
import { startReviewer } from "./review.js";
import { sessionLabel } from "./session-data.js";
import { reviewCommand } from "./settings.js";

const UNTRACKED_FOR_MODEL = 10;
const SCOPE = "changes made by one Claude session (and its subagents): its own commits plus its current uncommitted edits to the files it touched";

async function untrackedSections(repo) {
  const fresh = repo.files.filter((f) => f.untracked).slice(0, UNTRACKED_FOR_MODEL);
  const parts = [];
  for (const f of fresh) parts.push(`diff --git a/${f.path} b/${f.path}\nnew file (untracked)\n${(await untrackedDiff(repo.repo, f.path, null)).slice(0, 200).join("\n")}\n`);
  return parts.join("");
}

export async function summaryInput(repo, name) {
  const full = (await sessionDiffText(repo)) + (await untrackedSections(repo));
  const trimmed = trimDiff(full);
  const rest = repo.files.filter((f) => f.untracked).slice(UNTRACKED_FOR_MODEL);
  const prompt = buildPrompt({ name, scope: SCOPE, subjects: repo.commitList.map((c) => c.subject), files: repo.files, diff: trimmed.text + untrackedNote(rest) });
  return { key: hash(`v1|session|${full}`), prompt, trimmed };
}

export async function summarizeRepo(repo, name, cache) {
  const input = await summaryInput(repo, name);
  const meta = { truncated: input.trimmed.truncated, size: input.trimmed.size, limit: DIFF_LIMIT };
  if (!input.trimmed.text.trim()) return { error: "Nothing to summarize: the diff is empty or only lock/secret files" };
  return { ...(await cachedSummary(cache, input.key, input.prompt)), ...meta };
}

function repoLines(repo) {
  const commits = repo.commitList.map((c) => `${c.short} "${c.subject}" [${c.state}]`);
  const uncommitted = repo.files.filter((f) => f.state === "uncommitted").map((f) => f.path);
  const committed = repo.files.filter((f) => f.state === "local" || f.state === "pushed").map((f) => f.path);
  return [
    `${repo.repo} (${repo.group}, branch ${repo.branch ?? "detached"})`,
    commits.length && `commits: ${commits.join(", ")}`,
    uncommitted.length && `uncommitted files: ${uncommitted.slice(0, 60).join(", ")}`,
    committed.length && `committed files: ${committed.slice(0, 60).join(", ")}`,
  ].filter(Boolean);
}

export function reviewTask(session, repos) {
  const head = `Review the changes the Claude session ${sessionLabel(session)} (${session.sessionId}) made, repo by repo in release order. Use ${reviewCommand()} on each repo, scoped to the commits and files listed (pushed commits included).`;
  return [head, ...repos.map((r) => `- ${repoLines(r).join("; ")}`)].join("\n");
}

export function reviewLine(session, repos) {
  const parts = repos.map((r) => repoLines(r).join("; "));
  return `${reviewCommand()} Changes from Claude session ${sessionLabel(session)} (${session.sessionId}), review each repo scoped to these commits and files: ${parts.join(" | ")}`;
}

export async function sendSessionReview(app, session, repos, cx) {
  const name = app.targetInput.value().trim();
  const target = name ? await resolveTarget(name) : { reason: "unset" };
  if (target.address) {
    app.afterSend(await deliver(name, reviewLine(session, repos), { name: `review ${sessionLabel(session)}` }));
    return;
  }
  const why = target.reason === "unset" ? null : `${name} is not a live Claude session`;
  const cwd = session.cwd || repos[0].repo;
  await startReviewer(cwd, null, null, cx, why, reviewTask(session, repos));
}

export function reportError(title, e) {
  notify({ title, body: String(e?.message ?? e), level: "error" });
}
