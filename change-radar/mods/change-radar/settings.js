import { appHome, home, readTextFile } from "herdr";

const WORKSPACE_DEFAULTS = Object.freeze({ workspaceRoot: "~" });
const MOD_DEFAULTS = Object.freeze({ gitHost: "", reviewCommand: "/review", dbRepoPrefixes: Object.freeze([]), testRepos: Object.freeze([]), frontendRepos: Object.freeze([]) });

let workspace = WORKSPACE_DEFAULTS;
let mod = MOD_DEFAULTS;

export const workspacePath = () => `${appHome()}/data/workspace.json`;
export const settingsPath = () => `${appHome()}/data/change-radar/settings.json`;

export function expandHome(path, base = home()) {
  if (path === "~") return base;
  return path.startsWith("~/") ? `${base}/${path.slice(2)}` : path;
}

const text = (value, fallback) => typeof value === "string" && value.trim() ? value.trim() : fallback;
const list = (value) => Object.freeze(Array.isArray(value) ? value.filter((one) => typeof one === "string" && one.trim()).map((one) => one.trim().toLowerCase()) : []);

function parseWorkspace(value) {
  return Object.freeze({ workspaceRoot: text(value?.workspaceRoot, WORKSPACE_DEFAULTS.workspaceRoot) });
}

function parseMod(value) {
  return Object.freeze({
    gitHost: text(value?.gitHost, MOD_DEFAULTS.gitHost).replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    reviewCommand: text(value?.reviewCommand, MOD_DEFAULTS.reviewCommand),
    dbRepoPrefixes: list(value?.dbRepoPrefixes),
    testRepos: list(value?.testRepos),
    frontendRepos: list(value?.frontendRepos),
  });
}

async function readJson(path, parse, defaults) {
  const raw = await readTextFile(path).catch(() => null);
  if (!raw) return defaults;
  try {
    return parse(JSON.parse(raw));
  } catch (e) {
    console.log(`change-radar: ${path} is not valid JSON, using defaults: ${e.message ?? e}`);
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

export const reviewCommand = () => mod.reviewCommand;

export const repoGroups = () => ({ dbRepoPrefixes: mod.dbRepoPrefixes, testRepos: mod.testRepos, frontendRepos: mod.frontendRepos });
