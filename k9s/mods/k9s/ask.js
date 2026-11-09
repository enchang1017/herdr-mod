import * as fs from "fs/promises";
import { hc, appHome, writeTextFile } from "herdr";
import { kubectl, triageCommands, firstLine, shortContext } from "./kubectl.js";
import { deliver, loadTargetName } from "./target.js";
import { lokiExploreUrl } from "./grafana.js";

const SECTION_LIMIT = 8000;
const LIVE_READ_LINES = 150;
const INLINE_LIMIT = 400;

function clip(section) {
  const text = section.text.trim() || "(empty)";
  if (text.length <= SECTION_LIMIT) return text;
  return section.keep === "tail" ? `...(clipped)\n${text.slice(-SECTION_LIMIT)}` : `${text.slice(0, SECTION_LIMIT)}\n...(clipped)`;
}

function triagePrompt(scope, row, header, sections, lokiUrl) {
  const namespace = row.namespace ?? scope.namespace;
  const intro = [
    "Triage this Kubernetes resource from a read-only k9s snapshot. Find the root cause and say what to check or change next.",
    "Use the Grafana / Loki and Tempo tools when the snapshot is not enough. Do not run any kubectl command that changes the cluster.",
    "",
    `context: ${scope.context}`,
    `namespace: ${namespace}`,
    `resource: ${scope.resource}/${row.name}`,
    ...(lokiUrl ? [`loki: ${lokiUrl}`] : []),
    "",
    "```",
    header,
    row.line,
    "```",
  ];
  const body = sections.flatMap((section) => ["", `## ${section.title}`, "```", clip(section), "```"]);
  return [...intro, ...body].join("\n");
}

async function triageSection(command) {
  const ran = await kubectl(command.argv);
  if (ran.ok) return { title: command.title, text: ran.stdout, keep: command.keep };
  if (command.isOptional) return null;
  return { title: `${command.title} (failed)`, text: ran.error, keep: "head" };
}

export async function buildTriage(scope, row, header) {
  const sections = await Promise.all(triageCommands(scope, row).map(triageSection));
  const namespace = row.namespace ?? scope.namespace;
  const url = lokiExploreUrl(scope.context, namespace, scope.resource, row.name);
  return triagePrompt(scope, row, header, sections.filter(Boolean), url);
}

export function detailPrompt(scope, row, detail) {
  return [
    `This is the ${detail.kind} output of ${scope.resource}/${row.name} in namespace ${row.namespace ?? scope.namespace} (context ${scope.context}), from a read-only k9s view.`,
    "Find errors or anomalies, say what likely causes them, and suggest the next read-only check.",
    "",
    "```",
    clip({ text: detail.text, keep: detail.kind === "logs" ? "tail" : "head" }),
    "```",
  ].join("\n");
}

export async function livePrompt(live) {
  const ran = await hc(["read", live.address, "--lines", String(LIVE_READ_LINES)]);
  if (ran.code !== 0) return { error: `could not read ${live.address}: ${firstLine(ran.stderr) || `exit ${ran.code}`}` };
  const where = `${live.kind}/${live.name} in namespace ${live.namespace} (context ${live.context})`;
  const text = [
    `These are the last log lines of ${where}, from a live k9s stream (kubectl logs --prefix --timestamps).`,
    "Find errors or anomalies, say what likely causes them, and suggest the next read-only check.",
    "",
    "```",
    clip({ text: ran.stdout, keep: "tail" }),
    "```",
  ].join("\n");
  return { text };
}

function askFolder() {
  return `${appHome()}/data/k9s`;
}

async function writeAskFile(title, text) {
  const path = `${askFolder()}/ask-${Date.now()}.md`;
  await fs.mkdir(askFolder(), { recursive: true });
  await writeTextFile(path, text, null);
  return path;
}

async function messageFor(title, text) {
  if (text.length <= INLINE_LIMIT && !text.includes("\n")) return text;
  const path = await writeAskFile(title, text);
  return `Read ${path} (a read-only k9s snapshot of ${title}) and do what it asks. Do not run kubectl commands that change the cluster.`;
}

export async function askAgent(title, text, context) {
  const message = await messageFor(title, text);
  const session = { name: `k9s ${shortContext(context)}/${title.split("/").pop()}` };
  return deliver(loadTargetName(), message, session);
}
