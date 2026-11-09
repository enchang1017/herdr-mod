import { props } from "herdr";
import { placeShown } from "./visibility.js";
import { claim, holds } from "./lease.js";
import { MOD } from "./shell.js";

const KEY = "change-radar.command-lease";
const TTL_MS = 3000;
const CONFIRM_MS = 150;
const DOCKED_DELAY_MS = 120;

export function exclusive(name) {
  return name === "summarize" || name === "review" || name === "walkthrough" || name.startsWith("session-summarize");
}

export async function wonCommand(name, owner, cx) {
  if (!placeShown(MOD)) return false;
  if (!props()?.overlay) await cx.sleep(DOCKED_DELAY_MS);
  if (!claim(KEY, name, owner, TTL_MS, Date.now())) return false;
  await cx.sleep(CONFIRM_MS);
  return holds(KEY, name, owner, Date.now());
}
