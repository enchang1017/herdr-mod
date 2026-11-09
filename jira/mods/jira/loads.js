import { queryOf } from "./queries.js";

const MAX_LOADS = 20;

export const IDLE = Object.freeze({ loading: false, error: "", triedAt: 0 });

export function queryFor(app) {
  return queryOf(app.state.view, app.state.ranJql ?? "");
}

export function loadIdOf(app) {
  return app.state.view === "board" ? "board" : queryFor(app).jql;
}

export function loadOf(app, id = loadIdOf(app)) {
  return app.state.loads[id] ?? IDLE;
}

const kept = (entries) => entries.length <= MAX_LOADS ? entries
  : [...entries].sort((a, b) => Number(b[1].loading) - Number(a[1].loading) || b[1].triedAt - a[1].triedAt).slice(0, MAX_LOADS);

export function patchLoad(app, id, patch) {
  const next = Object.freeze({ ...loadOf(app, id), ...patch });
  const others = Object.entries(app.state.loads).filter(([key]) => key !== id);
  app.set({ loads: Object.freeze(Object.fromEntries(kept([[id, next], ...others]))) });
}

export const isCurrentLoad = (app, id) => loadIdOf(app) === id;
