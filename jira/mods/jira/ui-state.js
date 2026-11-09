import { shared, setShared } from "herdr";
import { VIEWS, DEFAULT_JQL } from "./queries.js";
import { errorText } from "./acli.js";

const SHARED_KEY = "jira.ui";
const NO_BOARD_FILTER = Object.freeze({ labels: Object.freeze([]), assignees: Object.freeze([]), onlyMine: false });
const EMPTY = Object.freeze({ view: "mine", jql: DEFAULT_JQL, drawerWidth: null, selected: null, boardFilter: NO_BOARD_FILTER, collapsed: Object.freeze([]) });

const strings = (value) => Object.freeze(Array.isArray(value) ? value.filter((one) => typeof one === "string") : []);

function validBoardFilter(value) {
  if (!value || typeof value !== "object") return NO_BOARD_FILTER;
  return Object.freeze({ labels: strings(value.labels), assignees: strings(value.assignees), onlyMine: value.onlyMine === true });
}

function validUi(saved) {
  return Object.freeze({
    view: VIEWS.some((one) => one.key === saved.view) ? saved.view : EMPTY.view,
    jql: typeof saved.jql === "string" && saved.jql.trim() ? saved.jql : EMPTY.jql,
    drawerWidth: Number.isFinite(saved.drawerWidth) && saved.drawerWidth > 0 ? Math.round(saved.drawerWidth) : null,
    selected: typeof saved.selected === "string" ? saved.selected : null,
    boardFilter: validBoardFilter(saved.boardFilter),
    collapsed: strings(saved.collapsed),
  });
}

export function loadUiState() {
  try {
    const value = shared(SHARED_KEY);
    return { value: value && typeof value === "object" ? validUi(value) : EMPTY, error: "" };
  } catch (error) {
    return { value: EMPTY, error: `Saved view unreadable: ${errorText(error)}` };
  }
}

export function saveUiState(value) {
  try {
    if (JSON.stringify(shared(SHARED_KEY)) !== JSON.stringify(value)) setShared(SHARED_KEY, value);
    return "";
  } catch (error) {
    return `View not saved: ${errorText(error)}`;
  }
}
