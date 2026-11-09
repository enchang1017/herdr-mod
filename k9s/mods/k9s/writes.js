import * as fs from "fs/promises";
import { exec, hc, appHome, focused, spaces, panes, run } from "herdr";
import { writeRefusal } from "./write-guard.js";
import { firstLine, errorText } from "./kubectl.js";

const SHELL_WAIT_MS = 250;
const SHELL_WAIT_TRIES = 16;

function auditFolder() {
  return `${appHome()}/data/k9s`;
}

export function auditPath() {
  return `${auditFolder()}/audit.jsonl`;
}

async function appendAudit(entry) {
  try {
    await fs.mkdir(auditFolder(), { recursive: true });
    const path = auditPath();
    const before = (await fs.exists(path)) ? await fs.readFile(path, "utf8") : "";
    await fs.writeFile(path, `${before}${JSON.stringify(entry)}\n`);
    return "";
  } catch (error) {
    return `audit log not written: ${errorText(error)}`;
  }
}

function contextOf(argv) {
  return argv.find((token) => token.startsWith("--context="))?.slice("--context=".length) ?? "";
}

function auditEntry(argv, code, stderr) {
  return { at: new Date().toISOString(), context: contextOf(argv), argv, code, stderr: firstLine(stderr) };
}

export async function runWrite(argv) {
  const refusal = writeRefusal(argv);
  if (refusal) return { ok: false, code: -1, text: refusal, audit: "" };
  try {
    const result = await exec("kubectl", argv.slice(1));
    const audit = await appendAudit(auditEntry(argv, result.code, result.stderr));
    const text = result.code === 0 ? firstLine(result.stdout) || "done" : firstLine(result.stderr) || `kubectl exited with ${result.code}`;
    return { ok: result.code === 0, code: result.code, text, audit };
  } catch (error) {
    const text = `kubectl did not run: ${errorText(error)}`;
    return { ok: false, code: -1, text, audit: await appendAudit(auditEntry(argv, -1, text)) };
  }
}

function localSpace() {
  const now = focused()?.space ?? "";
  const local = spaces().filter((one) => !one.machine);
  return (local.find((one) => one.id === now) ?? local[0])?.id ?? null;
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function shellRunArgs(argv, space, tab, pod) {
  const name = `${`sh-${slug(pod)}`.slice(0, 27).replace(/-+$/, "")}-${tab.slice(-4)}`;
  return ["run", "--json", "--bg", "--keep", "--no-parent", "--no-notify", "--name", name,
    "--label", `herdr.space=${space}`, "--label", `herdr.tab=${tab}`, "--", ...argv];
}

async function nameTab(address, title, cx) {
  for (let attempt = 0; attempt < SHELL_WAIT_TRIES; attempt += 1) {
    const tab = panes().find((pane) => pane.terminal === address)?.tab;
    if (tab) {
      run("tab.rename", { id: tab, name: title });
      run("tab.select", { id: tab });
      return "";
    }
    await cx.sleep(SHELL_WAIT_MS);
  }
  return `shell started as ${address}; its tab did not show up yet`;
}

function addressOf(stdout) {
  try {
    return JSON.parse(stdout).address ?? "";
  } catch {
    return "";
  }
}

export async function openShell(argv, pod, cx) {
  const refusal = writeRefusal(argv);
  if (refusal) return { ok: false, text: refusal };
  const space = localSpace();
  if (!space) return { ok: false, text: "No local space to open the shell tab in." };
  const ran = await hc(shellRunArgs(argv, space, `k9s-sh-${Date.now().toString(36)}`, pod));
  const audit = await appendAudit(auditEntry(argv, ran.code, ran.stderr));
  const address = ran.code === 0 ? addressOf(ran.stdout) : "";
  if (!address) return { ok: false, text: `hc run failed: ${firstLine(ran.stderr) || `exit ${ran.code}`}`, audit };
  const late = await nameTab(address, `sh ${pod}`, cx);
  return { ok: true, text: late || `Shell open in tab "sh ${pod}"`, audit };
}
