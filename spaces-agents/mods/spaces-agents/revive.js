import { hc, run, spaces, terminals } from "herdr";
import { agentName } from "./util.js";

const NAME_MAX = 32;
const WAIT_MS = 250;
const WAIT_TRIES = 40;

const localId = (id) => String(id ?? "").split("/").pop();
const message = (e) => String(e?.message ?? e);

const wantedName = (entry) => entry.terminalName ?? agentName(null, entry.name === "lead" ? null : entry.name, entry.cwd);

export function freeName(wanted) {
  const clean = String(wanted ?? "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, NAME_MAX) || "claude";
  const taken = new Set(terminals().filter((t) => t.state === "live" || t.state === undefined).map((t) => t.name).filter(Boolean));
  if (!taken.has(clean)) return clean;
  const free = Array.from({ length: 98 }, (_v, i) => `-${i + 2}`).map((s) => `${clean.slice(0, NAME_MAX - s.length)}${s}`).find((n) => !taken.has(n));
  return free ?? `${clean.slice(0, NAME_MAX - 6)}-${String(Date.now()).slice(-5)}`;
}

function errorText(ran) {
  const text = (ran.stderr || ran.stdout || "").trim();
  try {
    const parsed = JSON.parse(text).error;
    return [parsed?.message, parsed?.hint].filter(Boolean).join(" ") || text;
  } catch {
    return text || `hc run exited ${ran.code}`;
  }
}

async function start(args) {
  const ran = await hc(["run", "--bg", "--json", ...args]);
  if (ran.code !== 0) throw new Error(errorText(ran));
  try {
    const out = JSON.parse(ran.stdout);
    if (!out?.address) throw new Error("no address");
    return out.address;
  } catch (e) {
    throw new Error(`hc run gave no address: ${message(e)} ${ran.stdout.trim().slice(0, 160)}`);
  }
}

const claudeArgs = (sessionId, fork) => ["claude", "--resume", sessionId, ...(fork ? ["--fork-session"] : [])];

const onArgs = (entry) => (entry.machine ? ["--on", entry.machine] : []);

function teamLabels(entry) {
  const team = entry.team ? [`team=${entry.team}`] : [];
  const template = entry.template ? [`team.template=${entry.template}`] : [];
  return [...team, ...template].flatMap((l) => ["--label", l]);
}

function labelsOf(entry) {
  const labels = [`herdr.space=${localId(entry.space?.id)}`, `herdr.tab=${localId(entry.tab?.id)}`].flatMap((l) => ["--label", l]);
  return [...labels, ...teamLabels(entry)];
}

async function settleNames(entry, spaceKnown, tabKnown, cx) {
  for (let attempt = 0; attempt < WAIT_TRIES; attempt += 1) {
    const space = spaces().find((s) => localId(s.id) === localId(entry.space?.id));
    const tab = space?.tabs.find((t) => localId(t.id) === localId(entry.tab?.id));
    if (tab) {
      if (!spaceKnown && entry.space?.named && entry.space.name) run("space.rename", { id: space.id, name: entry.space.name });
      if (!tabKnown && entry.tab?.label && !/^\d+$/.test(entry.tab.label)) run("tab.rename", { id: tab.id, name: entry.tab.label });
      return;
    }
    await cx.sleep(WAIT_MS);
  }
}

export async function revive(entry, fork, cx) {
  if (!entry.space?.id || !entry.tab?.id) throw new Error("This entry has no recorded space or tab.");
  const space = spaces().find((s) => localId(s.id) === localId(entry.space.id));
  const tabKnown = Boolean(space?.tabs.some((t) => localId(t.id) === localId(entry.tab.id)));
  const name = freeName(fork ? `${wantedName(entry)}-fork` : wantedName(entry));
  const where = ["--no-parent", "--name", name, "--cwd", entry.cwd, ...onArgs(entry), ...labelsOf(entry)];
  const address = await start([...where, "--", ...claudeArgs(entry.sessionId, fork)]);
  await settleNames(entry, Boolean(space), tabKnown, cx);
  return address;
}

export async function reviveMate(entry, parent) {
  const name = freeName(wantedName(entry));
  const where = ["--parent", localId(parent), "--name", name, "--cwd", entry.cwd, ...onArgs(entry), ...teamLabels(entry)];
  return start([...where, "--", ...claudeArgs(entry.sessionId, false)]);
}
