import { appHome, readTextFile, writeTextFile } from "herdr";

const MODES = Object.freeze(["scrum", "kanban"]);
const DEFAULT_MODE = "scrum";
const DEFAULTS = Object.freeze({ project: "", boardId: "", planUrlPattern: "", mode: "", boardJql: "" });
const PROJECT_KEY = /^[A-Z][A-Z0-9_]*$/;
const BOARD_ID = /^\d+$/;
const BOARD_SCOPED = Object.freeze(["project", "mode", "boardJql"]);

let loaded = DEFAULTS;
let detected = null;

export const settingsPath = () => `${appHome()}/data/jira/settings.json`;

export const NEED_PROJECT = "Pick a board (B), or set \"boardId\" or \"project\" in data/jira/settings.json, to use the board and sprint views.";

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

function modeOf(value) {
  const mode = text(value).toLowerCase();
  if (!mode || MODES.includes(mode)) return mode;
  console.log(`jira: mode "${mode}" in ${settingsPath()} is not one of ${MODES.join(", ")}, detecting it from the board`);
  return "";
}

function parse(value) {
  return Object.freeze({
    project: checked(text(value?.project).toUpperCase(), PROJECT_KEY, "project"),
    boardId: checked(String(value?.boardId ?? "").trim(), BOARD_ID, "boardId"),
    planUrlPattern: planPattern(text(value?.planUrlPattern)),
    mode: modeOf(value?.mode),
    boardJql: text(value?.boardJql),
  });
}

function parsedObject(raw) {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (e) {
    console.log(`jira: ${settingsPath()} is not valid JSON, using defaults: ${e.message ?? e}`);
    return {};
  }
}

export async function loadSettings() {
  const raw = await readTextFile(settingsPath()).catch(() => null);
  loaded = parse(parsedObject(raw));
  return loaded;
}

export async function chooseBoard(id) {
  const raw = await readTextFile(settingsPath()).catch(() => null);
  const kept = Object.fromEntries(Object.entries(parsedObject(raw)).filter(([key]) => !BOARD_SCOPED.includes(key)));
  const next = `${JSON.stringify({ ...kept, boardId: String(id) }, null, 2)}\n`;
  await writeTextFile(settingsPath(), next, raw ?? null);
  loaded = parse(JSON.parse(next));
  detected = null;
  return loaded;
}

export function useDetected(info) {
  detected = info && info.id === loaded.boardId ? Object.freeze({ ...info }) : null;
}

export const project = () => loaded.project || detected?.project || "";

export const boardId = () => loaded.boardId;

export const planUrlPattern = () => loaded.planUrlPattern;

export const mode = () => loaded.mode || detected?.mode || DEFAULT_MODE;

export const isKanban = () => mode() === "kanban";

export const boardJql = () => loaded.boardJql;

export const boardName = () => detected?.name ?? "";
