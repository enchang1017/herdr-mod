import { shared, setShared } from "herdr";

const KEY = "change-radar.ui";
const TABS = new Set(["radar", "graph", "session"]);

export function loadUi() {
  const value = shared(KEY);
  const saved = value && typeof value === "object" ? value : {};
  return {
    tab: saved.tab === "ship" ? "session" : TABS.has(saved.tab) ? saved.tab : "radar",
    graphRepo: typeof saved.graphRepo === "string" ? saved.graphRepo : null,
  };
}

export function saveUi(patch) {
  const next = { ...loadUi(), ...patch };
  try {
    if (JSON.stringify(shared(KEY)) !== JSON.stringify(next)) setShared(KEY, next);
    return null;
  } catch (e) {
    return `Could not save the panel state: ${e.message ?? e}`;
  }
}
