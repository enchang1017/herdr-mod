import * as fs from "fs/promises";
import { appHome, writeTextFile } from "herdr";
import { deliver, loadTargetName } from "./target.js";
import { waterfall, formatMs, clockOf } from "./model.js";

const SECTION_LIMIT = 12000;
const INLINE_LIMIT = 400;
const ATTRIBUTE_LIMIT = 30;

function clip(text, keep) {
  const body = text.trim() || "(empty)";
  if (body.length <= SECTION_LIMIT) return body;
  return keep === "tail" ? `...(clipped)\n${body.slice(-SECTION_LIMIT)}` : `${body.slice(0, SECTION_LIMIT)}\n...(clipped)`;
}

function fenced(title, text, keep) {
  return ["", `## ${title}`, "```", clip(text, keep), "```"];
}

export function logsPrompt(env, resource, lines, filter) {
  return [
    `These are the last ${lines.length} log lines of ${resource} in the local Orbit dev environment ${env}${filter ? ` (filtered by "${filter}")` : ""}.`,
    "Find errors or anomalies, say what likely causes them, and suggest the next check or code change.",
    "Do not restart, stop or reconfigure Orbit resources unless asked.",
    ...fenced(`${resource} logs`, lines.join("\n"), "tail"),
  ].join("\n");
}

function waterfallText(trace) {
  return waterfall(trace).map((row) => {
    const indent = "  ".repeat(row.depth);
    const mark = row.span.status === "error" ? " ERROR" : "";
    return `${indent}[${row.span.service}] ${row.span.name} ${formatMs(row.span.durationMs)} @+${formatMs(row.offsetMs)} (${row.span.kind || "span"})${mark}`;
  }).join("\n");
}

function errorSpans(trace) {
  return trace.spans.filter((span) => span.status === "error").map((span) => {
    const attributes = span.attributes.slice(0, ATTRIBUTE_LIMIT).map(([key, value]) => `  ${key}: ${value}`);
    return [`[${span.service}] ${span.name}`, ...attributes].join("\n");
  }).join("\n\n");
}

function traceSummary(env, trace) {
  return [
    `env: ${env}`,
    `trace: ${trace.id}`,
    `root: ${trace.rootService} ${trace.rootName}`,
    `status: ${trace.status}`,
    `started: ${clockOf(trace.start)}`,
    `duration: ${formatMs(trace.durationMs)}`,
    `spans: ${trace.spans.length || trace.spanCount}`,
    `services: ${trace.services.join(", ")}`,
  ].join("\n");
}

export function tracePrompt(env, trace, logs) {
  const errors = errorSpans(trace);
  return [
    `This is a distributed trace from the local Orbit dev environment ${env}: summary, span waterfall and the log lines carrying its trace id.`,
    "Explain what the request did, find where and why it failed or was slow, and suggest the code change or next check.",
    "Do not restart, stop or reconfigure Orbit resources unless asked.",
    ...fenced("Summary", traceSummary(env, trace), "head"),
    ...fenced("Waterfall (indent = depth, @+ = offset from trace start)", waterfallText(trace), "head"),
    ...(errors ? fenced("Error span attributes", errors, "head") : []),
    ...fenced("Logs with this trace id", logs.join("\n"), "tail"),
  ].join("\n");
}

function opsText(result) {
  return result.ops.map((op) => `${op.action} ${op.type} ${op.name}${op.dataLoss ? " (possible data loss)" : ""}`).join("\n");
}

function filesText(result) {
  return result.files.map((one) => `${one.action} ${one.path}`).join("\n");
}

export function dbPrompt(env, row, result) {
  const summary = [
    `database: ${row.db}`, `project: ${row.project || "?"} ${row.path}`,
    `last publish: ${row.publish ? `${row.publish.at} (${row.publish.source})` : "unknown"}`,
    `changes: ${result.changes} (create ${result.created}, alter ${result.altered}, drop ${result.dropped})${result.dataLoss ? ", possible data loss" : ""}`,
  ].join("\n");
  return [
    `The SQL Server database ${row.db} in the local Orbit dev environment ${env} has drifted from its SQL project: this is what a publish would change.`,
    "Explain the drift, say whether it comes from uncommitted project edits or from the deployed database, and suggest the next step.",
    "Do not publish, reset or change the database unless asked.",
    ...fenced("Summary", summary, "head"),
    ...(result.ops.length ? fenced("Schema operations", opsText(result), "head") : []),
    ...(result.files.length ? fenced("Changed source files", filesText(result), "head") : []),
  ].join("\n");
}

function askFolder() {
  return `${appHome()}/data/orbit`;
}

async function writeAskFile(text) {
  const path = `${askFolder()}/ask-${Date.now()}.md`;
  await fs.mkdir(askFolder(), { recursive: true });
  await writeTextFile(path, text, null);
  return path;
}

async function messageFor(env, title, text) {
  if (text.length <= INLINE_LIMIT && !text.includes("\n")) return text;
  const path = await writeAskFile(text);
  return `Read ${path} (a snapshot of ${title} from the local Orbit env ${env}) and do what it asks.`;
}

export async function askAgent(env, title, text) {
  const message = await messageFor(env, title, text);
  return deliver(loadTargetName(), message, { name: `orbit ${env}/${title}` });
}
