import { errorText } from "./api.js";
import { loadDbOverview, runDiff } from "./db-api.js";
import { baseOf, isLive, runAsk } from "./actions.js";
import { dbPrompt } from "./ask.js";

export const EMPTY_DB = { meta: null, rows: [], error: "", loading: false, at: 0 };
export const EMPTY_DIFF = { db: "", loading: false, error: "", needsEngine: false, result: null };

export function reloadDb(panel, cx) {
  const { db, instance } = panel.state;
  if (db.loading || panel.state.status.source === "loading") return;
  if (!isLive(panel)) {
    panel.set({ db: { ...EMPTY_DB, error: "Needs the running Orbit daemon (start it with orbit up)." } });
    return;
  }
  panel.set({ db: { ...db, loading: true } });
  cx.spawn(async (cx) => {
    try {
      const overview = await loadDbOverview(baseOf(panel), instance);
      if (panel.state.instance === instance) panel.set({ db: { ...overview, error: "", loading: false, at: Date.now() } });
    } catch (error) {
      panel.set({ db: { ...panel.state.db, loading: false, error: `Databases: ${errorText(error)}` } });
    } finally {
      cx.notify();
    }
  });
}

export function selectedDb(panel) {
  return panel.state.db.rows.find((row) => row.db === panel.state.dbSelected) ?? null;
}

export function moveDbCursor(panel, step) {
  const { rows } = panel.state.db;
  if (rows.length === 0) return;
  const at = rows.findIndex((row) => row.db === panel.state.dbSelected);
  const next = at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + step));
  panel.set({ dbSelected: rows[next].db });
}

export function diffFor(panel, row) {
  const { dbDiff } = panel.state;
  return row && dbDiff.db === row.db ? dbDiff : null;
}

export function shownResult(panel, row) {
  const diff = diffFor(panel, row);
  return diff?.result ?? row?.drift?.result ?? null;
}

export function runDbDiff(panel, cx) {
  const row = selectedDb(panel);
  if (!row) return panel.set({ message: "Select a database first." });
  if (panel.state.dbDiff.loading) return;
  panel.set({ dbDiff: { ...EMPTY_DIFF, db: row.db, loading: true }, message: "" });
  cx.spawn(async (cx) => {
    try {
      const outcome = await runDiff(baseOf(panel), row.db);
      if (panel.state.dbDiff.db === row.db) panel.set({ dbDiff: { ...EMPTY_DIFF, db: row.db, ...outcome } });
    } catch (error) {
      if (panel.state.dbDiff.db === row.db) panel.set({ dbDiff: { ...EMPTY_DIFF, db: row.db, error: `Diff ${row.db}: ${errorText(error)}` } });
    } finally {
      cx.notify();
    }
  });
}

export function isDrifted(panel, row) {
  const result = shownResult(panel, row);
  return result ? !(result.inSync && result.changes === 0) : false;
}

export function askDb(panel, cx) {
  const row = selectedDb(panel);
  if (!row || !isDrifted(panel, row)) return panel.set({ message: "Select a drifted database first." });
  const result = shownResult(panel, row);
  runAsk(panel, cx, () => ({ title: `${row.db} drift`, text: dbPrompt(panel.state.status.env, row, result) }));
}
