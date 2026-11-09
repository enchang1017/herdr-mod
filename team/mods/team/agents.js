import { hc, spaces, run, terminals, exec, home, readTextFile } from "herdr";

const NAME_MAX = 32;
const TEAM_TAB = "team";
const WAIT_MS = 250;
const WAIT_TRIES = 40;

export const localId = (id) => String(id ?? "").split("/").pop();

export function liveTerminals() {
  return terminals().filter((one) => one.state === "live" || one.state === undefined);
}

export function liveTeam() {
  return liveTerminals().filter((one) => typeof one.labels?.team === "string" && one.labels.team);
}

export function teamTabId(spaceId) {
  return `tb-team-${localId(spaceId).replace(/[^A-Za-z0-9]/g, "").slice(-12)}`;
}

export function agentName(base) {
  const clean = base.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, NAME_MAX) || "agent";
  const taken = new Set(liveTerminals().map((one) => one.name).filter(Boolean));
  if (!taken.has(clean)) return clean;
  const free = Array.from({ length: 98 }, (_v, i) => `-${i + 2}`).map((s) => `${clean.slice(0, NAME_MAX - s.length)}${s}`).find((one) => !taken.has(one));
  return free ?? `${clean.slice(0, NAME_MAX - 6)}-${String(Date.now()).slice(-5)}`;
}

export function errorText(ran) {
  const text = (ran.stderr || ran.stdout || "").trim();
  try {
    const parsed = JSON.parse(text).error;
    return [parsed?.message, parsed?.hint].filter(Boolean).join(" ") || text;
  } catch {
    return text || `hc run exited ${ran.code}`;
  }
}

const homes = new Map();

export async function machineHome(on) {
  if (!on) return home();
  if (homes.has(on)) return homes.get(on);
  const r = await exec("sh", ["-c", 'printf %s "$HOME"'], { on });
  if (r.code !== 0 || !r.stdout.trim()) throw new Error(`Could not find the home folder on ${on}`);
  homes.set(on, r.stdout.trim());
  return r.stdout.trim();
}

export function templatePath(name, base) {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`Not a template name: ${name}`);
  return `${base}/.config/herdr-core/templates/${name}.md`;
}

function parseTemplate(text, name) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!match) throw new Error(`Template ${name} has no frontmatter`);
  const meta = Object.fromEntries(match[1].split("\n").map((line) => /^(\w+):\s*(.*)$/.exec(line)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
  if (!meta.command) throw new Error(`Template ${name} has no command`);
  if (/["'`$\\;|&<>]/.test(meta.command)) throw new Error(`Template ${name}: its command must be plain words`);
  return { name, command: meta.command.split(/\s+/), body: match[2].trim() };
}

export async function readTemplate(name, on) {
  const text = await readTextFile(templatePath(name, await machineHome(on)), { on });
  if (text === null) throw new Error(on ? `Template ${name} is missing on ${on}` : `Template ${name} not found`);
  return parseTemplate(text, name);
}

function runArgs(spec, template) {
  const labels = [`herdr.space=${localId(spec.space)}`, `herdr.tab=${spec.tab}`, `team=${spec.team}`, `team.repo=${spec.repo}`, `team.template=${spec.template}`];
  return ["run", "--bg", "--json", "--no-parent", "--name", spec.name, "--cwd", spec.cwd,
    ...(spec.on ? ["--on", spec.on] : []), ...labels.flatMap((one) => ["--label", one]), "--", ...template.command, template.body ? `${template.body}\n\n${spec.task}` : spec.task];
}

export async function launchTemplate(spec) {
  const template = spec.plain ? { name: "claude", command: ["claude"], body: "" } : await readTemplate(spec.template, spec.on);
  const ran = await hc(runArgs(spec, template));
  if (ran.code !== 0) throw new Error(errorText(ran));
  let out = null;
  try {
    out = JSON.parse(ran.stdout);
  } catch {
    throw new Error(`hc run gave no JSON: ${ran.stdout.trim().slice(0, 200)}`);
  }
  if (!out?.address) throw new Error("hc run did not return an address");
  return { address: out.address, sent: true, name: spec.name };
}

function findTab(spaceId, tabId) {
  const space = spaces().find((one) => localId(one.id) === localId(spaceId));
  return space?.tabs.find((tab) => localId(tab.id) === tabId) ?? null;
}

export async function nameTab(spaceId, tabId, cx, name = TEAM_TAB) {
  for (let attempt = 0; attempt < WAIT_TRIES; attempt += 1) {
    const tab = findTab(spaceId, tabId);
    if (tab) {
      if (tab.name !== name) run("tab.rename", { id: tab.id, name });
      return true;
    }
    await cx.sleep(WAIT_MS);
  }
  return false;
}

export function focusAgent(address) {
  run("agent.focus", { terminal: address });
}
