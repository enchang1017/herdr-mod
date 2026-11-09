import { appHome, readTextFile } from "herdr";

const DEFAULTS = Object.freeze({ project: "", boardId: "", planUrlPattern: "" });
const PROJECT_KEY = /^[A-Z][A-Z0-9_]*$/;
const BOARD_ID = /^\d+$/;

let loaded = DEFAULTS;

export const settingsPath = () => `${appHome()}/data/jira/settings.json`;

export const NEED_PROJECT = "Set \"project\" in data/jira/settings.json (for example {\"project\": \"PROJ\"}) to use the board and sprint views.";

const text = (value) => typeof value === "string" ? value.trim() : "";

function planPattern(pattern) {
  if (!pattern) return "";
  try {
    new RegExp(pattern, "g");
    return pattern;
  } catch (e) {
    console.log(`jira: planUrlPattern is not a valid regex, ignoring it: ${e.message ?? e}`);
    return "";
  }
}

function checked(value, shape, name) {
  if (!value || shape.test(value)) return value;
  console.log(`jira: ${name} "${value}" in ${settingsPath()} is not valid, ignoring it`);
  return "";
}

function parse(value) {
  return Object.freeze({
    project: checked(text(value?.project).toUpperCase(), PROJECT_KEY, "project"),
    boardId: checked(String(value?.boardId ?? "").trim(), BOARD_ID, "boardId"),
    planUrlPattern: planPattern(text(value?.planUrlPattern)),
  });
}

export async function loadSettings() {
  const raw = await readTextFile(settingsPath()).catch(() => null);
  if (!raw) return loaded;
  try {
    loaded = parse(JSON.parse(raw));
  } catch (e) {
    console.log(`jira: ${settingsPath()} is not valid JSON, using defaults: ${e.message ?? e}`);
    loaded = DEFAULTS;
  }
  return loaded;
}

export const project = () => loaded.project;

export const boardId = () => loaded.boardId;

export const planUrlPattern = () => loaded.planUrlPattern;
