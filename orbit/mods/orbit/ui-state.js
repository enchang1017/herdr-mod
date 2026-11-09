import { shared, setShared } from "herdr";
import { errorText } from "./api.js";

const SHARED_KEY = "orbit.ui";
export const TABS = ["resources", "logs", "traces", "db"];
const EMPTY = { tab: "resources", selected: "", logResource: "", follow: true, errorsOnly: false, includeHealth: false, instance: "", dbSelected: "", drawerWidth: null };

function validUi(saved) {
  return {
    tab: TABS.includes(saved.tab) ? saved.tab : EMPTY.tab,
    selected: typeof saved.selected === "string" ? saved.selected : "",
    logResource: typeof saved.logResource === "string" ? saved.logResource : "",
    follow: saved.follow !== false,
    errorsOnly: saved.errorsOnly === true,
    includeHealth: saved.includeHealth === true,
    instance: typeof saved.instance === "string" ? saved.instance : "",
    dbSelected: typeof saved.dbSelected === "string" ? saved.dbSelected : "",
    drawerWidth: Number.isFinite(saved.drawerWidth) && saved.drawerWidth > 0 ? Math.round(saved.drawerWidth) : null,
  };
}

export function loadUiState() {
  try {
    const value = shared(SHARED_KEY);
    return { value: value && typeof value === "object" ? validUi(value) : EMPTY, error: "" };
  } catch (error) {
    return { value: EMPTY, error: `saved view unreadable: ${errorText(error)}` };
  }
}

export function saveUiState(state) {
  const value = {
    tab: state.tab, selected: state.selected ?? "", logResource: state.logResource ?? "",
    follow: state.follow, errorsOnly: state.errorsOnly, includeHealth: state.includeHealth,
    instance: state.instance ?? "", dbSelected: state.dbSelected ?? "", drawerWidth: state.drawerWidth ?? null,
  };
  try {
    if (JSON.stringify(shared(SHARED_KEY)) !== JSON.stringify(value)) setShared(SHARED_KEY, value);
    return "";
  } catch (error) {
    return `view not saved: ${errorText(error)}`;
  }
}
