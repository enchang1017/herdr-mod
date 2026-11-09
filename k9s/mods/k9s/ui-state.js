import { shared, setShared } from "herdr";
import { DEFAULT_NAMESPACE, errorText } from "./kubectl.js";

const UI_KEY = "ui-state";
const SHARED_KEY = "k9s.ui";
const VIEWS = new Set(["finder", "browse"]);

const EMPTY = { view: "finder", scope: { context: "", namespace: DEFAULT_NAMESPACE, resource: "pods" }, selectedName: "", filter: "", failingOnly: false, drawerWidth: null };

function validScope(scope) {
  if (!scope || typeof scope !== "object") return EMPTY.scope;
  return {
    context: typeof scope.context === "string" ? scope.context : "",
    namespace: typeof scope.namespace === "string" && scope.namespace ? scope.namespace : DEFAULT_NAMESPACE,
    resource: typeof scope.resource === "string" && scope.resource ? scope.resource : "pods",
  };
}

function validUi(saved) {
  return {
    view: VIEWS.has(saved.view) ? saved.view : "finder",
    scope: validScope(saved.scope),
    selectedName: typeof saved.selectedName === "string" ? saved.selectedName : "",
    filter: typeof saved.filter === "string" ? saved.filter : "",
    failingOnly: saved.failingOnly === true,
    drawerWidth: Number.isFinite(saved.drawerWidth) && saved.drawerWidth > 0 ? Math.round(saved.drawerWidth) : null,
  };
}

function legacyUi() {
  const raw = localStorage.getItem(UI_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function loadUiState() {
  try {
    const value = shared(SHARED_KEY);
    const saved = value && typeof value === "object" ? value : legacyUi();
    return { value: saved ? validUi(saved) : EMPTY, error: "" };
  } catch (error) {
    return { value: EMPTY, error: `saved view unreadable: ${errorText(error)}` };
  }
}

export function saveUiState(state, selectedName) {
  const value = { view: state.view, scope: state.scope, selectedName, filter: state.filter, failingOnly: state.failingOnly, drawerWidth: state.drawerWidth ?? null };
  try {
    if (JSON.stringify(shared(SHARED_KEY)) !== JSON.stringify(value)) setShared(SHARED_KEY, value);
    return "";
  } catch (error) {
    return `view not saved: ${errorText(error)}`;
  }
}
