import { exec, hc, focused, panes, spaces } from "herdr";
import { dotnetFiles, localPlan, remotePlan } from "./plan.js";

const FIND_ARGS = ["-maxdepth", "1", "(", "-name", "*.sln", "-o", "-name", "*.slnx", "-o", "-name", "*.csproj", ")"];

const machineOf = (address) => (String(address ?? "").includes("/") ? String(address).split("/")[0] : null);

export function focusedTarget() {
  const f = focused();
  if (!f) throw new Error("Nothing is focused.");
  const pane = panes().find((one) => one.pane === f.pane);
  const space = spaces().find((one) => one.id === f.space);
  const folder = f.cwd ?? pane?.cwd ?? null;
  if (!folder) throw new Error("The focused pane has no folder: focus a terminal first.");
  return { folder, machine: machineOf(f.terminal ?? pane?.terminal) ?? space?.machine ?? null };
}

export function targetFrom(p) {
  if (typeof p?.folder === "string" && p.folder) return { folder: p.folder, machine: typeof p.machine === "string" && p.machine ? p.machine : null };
  return focusedTarget();
}

async function dotnetIn(dir) {
  const r = await exec("find", [dir, ...FIND_ARGS]);
  const files = dotnetFiles(r.stdout);
  return files.length ? { dir, files } : null;
}

async function gitRoot(folder) {
  const r = await exec("git", ["-C", folder, "rev-parse", "--show-toplevel"]).catch(() => null);
  const top = r?.code === 0 ? r.stdout.trim() : "";
  return top && top !== folder ? top : null;
}

async function sshTarget(machine) {
  const r = await hc(["machine", "ls", "--json"]);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `hc machine ls exited ${r.code}`);
  const found = (JSON.parse(r.stdout).machines ?? []).find((one) => one.name === machine);
  if (!found) throw new Error(`Machine ${machine} is not known to herdr-core`);
  return found.target || found.host || null;
}

export async function planFor(target) {
  if (target.machine) return remotePlan(target.folder, target.machine, await sshTarget(target.machine));
  const here = await exec("test", ["-d", target.folder]);
  if (here.code !== 0) throw new Error(`${target.folder} is not a folder`);
  const root = await gitRoot(target.folder);
  const found = (await dotnetIn(target.folder)) ?? (root ? await dotnetIn(root) : null);
  return localPlan(target.folder, found);
}

export async function openPlan(plan) {
  const r = await exec(plan.command, plan.args);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `${plan.ide} exited ${r.code}`);
  return plan;
}
