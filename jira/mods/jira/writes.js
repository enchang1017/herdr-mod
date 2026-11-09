import { acli, KEY } from "./acli.js";

const MAX_COMMENT = 30000;

function checkKey(key) {
  if (!KEY.test(String(key ?? ""))) throw new Error(`Not a single Jira key: ${key}`);
  return key;
}

function transitionPlan(issue, status) {
  const target = String(status ?? "").trim();
  if (!target) throw new Error("Pick a status first.");
  if (target === issue.status) throw new Error(`${issue.key} is already ${target}.`);
  return {
    title: `Move ${issue.key} to ${target}`,
    lines: [`Status: ${issue.status || "?"} \u{2192} ${target}`, "Jira refuses it if the workflow has no such transition."],
    argv: ["jira", "workitem", "transition", "--key", checkKey(issue.key), "--status", target, "--yes"],
  };
}

function assignPlan(issue) {
  return {
    title: `Assign ${issue.key} to me`,
    lines: [`Assignee: ${issue.assignee || "Unassigned"} \u{2192} you (@me)`],
    argv: ["jira", "workitem", "assign", "--key", checkKey(issue.key), "--assignee", "@me", "--yes"],
  };
}

function unassignPlan(issue) {
  if (!issue.assignee) throw new Error(`${issue.key} has no assignee.`);
  return {
    title: `Unassign ${issue.key}`,
    lines: [`Assignee: ${issue.assignee} \u{2192} Unassigned`],
    argv: ["jira", "workitem", "assign", "--key", checkKey(issue.key), "--remove-assignee", "--yes"],
  };
}

function commentPlan(issue, body) {
  const text = String(body ?? "").trim();
  if (!text) throw new Error("Write the comment first.");
  if (text.length > MAX_COMMENT) throw new Error(`The comment is ${text.length} characters; keep it under ${MAX_COMMENT}.`);
  return {
    title: `Comment on ${issue.key}`,
    lines: [`Posts ${text.length} characters as you, visible to everyone who can see ${issue.key}:`, text],
    argv: ["jira", "workitem", "comment", "create", "--key", checkKey(issue.key), "--body", text],
  };
}

const PLANS = { transition: transitionPlan, assign: assignPlan, unassign: unassignPlan, comment: commentPlan };

export function writePlan(kind, issue, value) {
  const build = PLANS[kind];
  if (!build) throw new Error(`Unknown write: ${kind}`);
  return Object.freeze({ kind, key: issue.key, ...build(issue, value) });
}

export function argvText(plan) {
  return ["acli", ...plan.argv.map((one) => (/^[\w@./:=,-]+$/.test(one) ? one : `'${one.replace(/'/g, "'\\''")}'`))].join(" ");
}

export function runPlan(plan) {
  return acli(plan.argv, `acli ${plan.argv.slice(0, 3).join(" ")} ${plan.key}`);
}
