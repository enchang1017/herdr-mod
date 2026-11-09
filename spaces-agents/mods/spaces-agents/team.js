import { exec, focused, panes, terminals } from "herdr";
import { revive, reviveMate } from "./revive.js";

const WAIT_MS = 250;
const WAIT_TRIES = 60;

const localId = (id) => String(id ?? "").split("/").pop();

export const groupKey = (e) => JSON.stringify([e.machine ?? null, localId(e.space?.id), localId(e.tab?.id)]);

function unitsOf(entries) {
  const addresses = new Set(entries.map((e) => e.address).filter(Boolean));
  const leadsTeam = (e) => entries.some((m) => m.team && m.parent === e.address && m !== e);
  const isLead = (e) => leadsTeam(e) || !e.parent || e.parent === e.address || !addresses.has(e.parent);
  const leads = entries.filter(isLead);
  const units = leads.map((lead) => ({ lead, mates: entries.filter((e) => !isLead(e) && e.parent === lead.address) }));
  const claimed = new Set(units.flatMap((u) => [u.lead, ...u.mates]).map((e) => e.sessionId));
  const orphans = entries.filter((e) => !claimed.has(e.sessionId)).map((lead) => ({ lead, mates: [] }));
  return [...units, ...orphans];
}

export function groupsOf(lost) {
  const keys = [...new Set(lost.map(groupKey))];
  return keys.map((key) => {
    const entries = lost.filter((e) => groupKey(e) === key);
    const first = entries[0];
    return { key, space: first.space, tab: first.tab, machine: first.machine ?? null, entries, units: unitsOf(entries) };
  });
}

const qualified = (address, machine) => (machine && !address.includes("/") ? `${machine}/${address}` : address);

const paneOf = (address, machine) => panes().find((p) => p.terminal === address || p.terminal === qualified(address, machine))?.pane ?? null;

const known = (address, machine) => terminals().some((t) => (t.address === address || t.address === qualified(address, machine)) && t.state !== "finished");

async function waitTerminal(address, machine, cx) {
  for (let attempt = 0; attempt < WAIT_TRIES; attempt += 1) {
    if (known(address, machine)) return;
    await cx.sleep(WAIT_MS);
  }
  throw new Error(`Terminal ${address} did not show up within ${(WAIT_MS * WAIT_TRIES) / 1000}s.`);
}

async function keep(address, place, machine, cx) {
  await waitTerminal(address, machine, cx);
  await command("terminal.keep", { terminal: qualified(address, machine), place });
  return waitPane(address, machine, cx);
}

async function waitPane(address, machine, cx) {
  for (let attempt = 0; attempt < WAIT_TRIES; attempt += 1) {
    const pane = paneOf(address, machine);
    if (pane) return pane;
    await cx.sleep(WAIT_MS);
  }
  throw new Error(`Terminal ${address} did not get a pane within ${(WAIT_MS * WAIT_TRIES) / 1000}s.`);
}

function parsed(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function command(name, args) {
  const ran = await exec("herdr-app", ["do", name, JSON.stringify(args)]);
  const text = (ran.stdout || ran.stderr || "").trim();
  const out = parsed(text);
  if (ran.code === 0 && out && !out.error) return out;
  const reason = typeof out?.error === "string" ? out.error : out?.error?.message ?? (text || `exit ${ran.code}`);
  throw new Error(`${name} failed: ${reason}`);
}

async function focus(pane, cx) {
  await command("pane.focus", { pane });
  for (let attempt = 0; attempt < WAIT_TRIES; attempt += 1) {
    if (focused()?.pane === pane) return;
    await cx.sleep(WAIT_MS);
  }
  throw new Error(`Could not focus pane ${pane}.`);
}

async function stack(leadPane, mates, machine, cx) {
  await focus(leadPane, cx);
  const first = await keep(mates[0], "right", machine, cx);
  await focus(first, cx);
  let stacked = [first];
  for (const address of mates.slice(1)) {
    stacked = [...stacked, await keep(address, "down", machine, cx)];
  }
  for (const pane of stacked) await command("layout.resize", { id: pane, weight: 1 });
  await focus(leadPane, cx);
}

async function reviveTeam(unit, machine, onRevived, cx) {
  const lead = await revive(unit.lead, false, cx);
  onRevived(unit.lead, lead);
  const leadPane = await waitPane(lead, machine, cx);
  let mates = [];
  for (const mate of unit.mates) {
    const address = await reviveMate(mate, lead);
    onRevived(mate, address);
    mates = [...mates, address];
  }
  await stack(leadPane, mates, machine, cx);
}

export async function reviveGroup(group, onRevived, cx) {
  for (const unit of group.units) {
    if (unit.mates.length) {
      await reviveTeam(unit, group.machine, onRevived, cx);
    } else {
      onRevived(unit.lead, await revive(unit.lead, false, cx));
    }
  }
}
