import { hc, exec, run, spaces, focused, terminals, home } from "herdr";
import { shortTitle } from "./data.js";

const WAIT_MS = 250;
const WAIT_TRIES = 40;
const NAME_MAX = 32;

const localId = (id) => String(id ?? "").split("/").pop();

function hcError(ran) {
  const text = (ran.stderr || ran.stdout || "").trim();
  try {
    const parsed = JSON.parse(text).error;
    return [parsed?.message, parsed?.hint].filter(Boolean).join(" ") || text;
  } catch {
    return text || `hc exited ${ran.code}`;
  }
}

function targetSpace() {
  const f = focused();
  const current = spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active) ?? null;
  if (current && !current.machine) return current;
  return spaces().find((s) => !s.machine) ?? null;
}

function newTabId() {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `tb${hex}`;
}

function terminalName(session) {
  const base = shortTitle(session, 20).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || session.kind;
  const taken = new Set(terminals().map((t) => t.name).filter(Boolean));
  const name = `${base}-${session.id.slice(0, 4)}`.slice(0, NAME_MAX);
  return taken.has(name) ? `${name.slice(0, NAME_MAX - 6)}-${String(Date.now()).slice(-5)}` : name;
}

async function folderFor(session) {
  if (session.cwd) {
    const probe = await exec("test", ["-d", session.cwd]);
    if (probe.code === 0) return session.cwd;
  }
  return focused()?.cwd || home();
}

function resumeArgv(session, fork) {
  if (session.kind === "codex") return ["codex", "resume", session.id];
  return ["claude", "--resume", session.id, ...(fork ? ["--fork-session"] : [])];
}

async function nameAndFocus(spaceId, tabId, address, title, cx) {
  for (let attempt = 0; attempt < WAIT_TRIES; attempt += 1) {
    const tab = spaces().find((s) => localId(s.id) === localId(spaceId))?.tabs.find((t) => localId(t.id) === tabId);
    if (tab) {
      run("tab.rename", { id: tab.id, name: title });
      run("tab.select", { id: tab.id });
      run("pane.focus", { terminal: address });
      return true;
    }
    await cx.sleep(WAIT_MS);
  }
  return false;
}

export async function resumeSession(session, fork, cx) {
  const space = targetSpace();
  if (!space) throw new Error("No space on this computer to open the session in.");
  const tabId = newTabId();
  const cwd = await folderFor(session);
  const args = ["run", "--bg", "--json", "--no-parent", "--name", terminalName(session), "--cwd", cwd,
    "--label", `herdr.space=${localId(space.id)}`, "--label", `herdr.tab=${tabId}`, "--", ...resumeArgv(session, fork)];
  const ran = await hc(args);
  if (ran.code !== 0) throw new Error(hcError(ran));
  const address = JSON.parse(ran.stdout)?.address;
  if (!address) throw new Error("hc run did not return an address");
  const shown = await nameAndFocus(space.id, tabId, address, shortTitle(session), cx);
  return { address, shown, cwd };
}

async function foregroundPid(address) {
  const ran = await hc(["get", address, "--json"]);
  if (ran.code !== 0) return null;
  try {
    return JSON.parse(ran.stdout)?.foreground?.pid ?? null;
  } catch {
    return null;
  }
}

export async function terminalForPid(pid) {
  const local = terminals().filter((t) => t.state === "live" && t.address && !t.address.includes("/"));
  const pids = await Promise.all(local.map(async (t) => [t.address, await foregroundPid(t.address)]));
  return pids.find(([, found]) => found === pid)?.[0] ?? null;
}

export async function focusLive(session) {
  const address = await terminalForPid(session.pid);
  if (!address) return null;
  run("agent.focus", { terminal: address });
  return address;
}
