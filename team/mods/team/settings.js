import { appHome, home, readTextFile } from "herdr";

const WORKSPACE_DEFAULTS = Object.freeze({ workspaceRoot: "~" });
const MOD_DEFAULTS = Object.freeze({ gitHost: "", planUrlPattern: "" });

let workspace = WORKSPACE_DEFAULTS;
let mod = MOD_DEFAULTS;

export const workspacePath = () => `${appHome()}/data/workspace.json`;
export const settingsPath = () => `${appHome()}/data/team/settings.json`;

export function expandHome(path, base = home()) {
  if (path === "~") return base;
  return path.startsWith("~/") ? `${base}/${path.slice(2)}` : path;
}

const text = (value, fallback) => typeof value === "string" && value.trim() ? value.trim() : fallback;

function parseWorkspace(value) {
  return Object.freeze({ workspaceRoot: text(value?.workspaceRoot, WORKSPACE_DEFAULTS.workspaceRoot) });
}

function validPattern(pattern) {
  if (!pattern) return "";
  try {
    new RegExp(pattern);
    return pattern;
  } catch (e) {
    console.log(`team: planUrlPattern is not a valid regex, ignoring it: ${e.message ?? e}`);
    return "";
  }
}

function parseMod(value) {
  return Object.freeze({
    gitHost: text(value?.gitHost, MOD_DEFAULTS.gitHost).replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    planUrlPattern: validPattern(text(value?.planUrlPattern, MOD_DEFAULTS.planUrlPattern)),
  });
}

async function readJson(path, parse, defaults) {
  const raw = await readTextFile(path).catch(() => null);
  if (!raw) return defaults;
  try {
    return parse(JSON.parse(raw));
  } catch (e) {
    console.log(`team: ${path} is not valid JSON, using defaults: ${e.message ?? e}`);
    return defaults;
  }
}

export async function loadSettings() {
  workspace = await readJson(workspacePath(), parseWorkspace, WORKSPACE_DEFAULTS);
  mod = await readJson(settingsPath(), parseMod, MOD_DEFAULTS);
  return { workspace, mod };
}

export const workspaceRoot = () => workspace.workspaceRoot;

export const workspaceRootPath = () => expandHome(workspace.workspaceRoot).replace(/\/+$/, "") || "/";

export const gitHost = () => mod.gitHost;

export const planUrlPattern = () => mod.planUrlPattern;
