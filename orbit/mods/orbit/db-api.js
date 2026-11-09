import { readTextFile } from "herdr";
import { getJson, postJson, asArray, asObject, asText, asNumber } from "./api.js";
import { dbStatePath } from "./instances.js";

function parseOp(raw) {
  const r = asObject(raw);
  const type = asText(r.object_type);
  return { action: asText(r.action), type: type.startsWith("Sql") ? type.slice(3) : type, name: asText(r.name), dataLoss: r.data_loss === true };
}

export function parseResult(raw) {
  const r = asObject(raw);
  const changes = asNumber(r.created) + asNumber(r.altered) + asNumber(r.dropped);
  const files = asArray(r.file_changes).map(asObject).map((one) => ({ action: asText(one.action), path: asText(one.path) }));
  return {
    inSync: r.in_sync === true, changes: changes || files.length, dataLoss: r.data_loss === true, quick: r.quick === true,
    created: asNumber(r.created), altered: asNumber(r.altered), dropped: asNumber(r.dropped), ops: asArray(r.ops).map(parseOp), files,
  };
}

function parseDrift(raw) {
  const r = asObject(raw);
  const base = { at: asText(r.at), stale: r.stale === true };
  if (r.result) return { ...base, kind: "result", result: parseResult(r.result), error: "", code: "" };
  return { ...base, kind: "error", result: null, error: asText(r.error, "diff failed"), code: asText(r.code) };
}

function parseStamp(raw) {
  const r = asObject(raw);
  const at = asText(r.at);
  return at ? { at, source: asText(r.source), durationMs: asNumber(r.durationMs) } : null;
}

async function loadDbState(instance) {
  const text = await readTextFile(dbStatePath(instance)).catch(() => "");
  try {
    return asObject(asObject(JSON.parse(text)).dbs);
  } catch {
    return {};
  }
}

function projectRows(projects) {
  return asArray(projects).map(asObject).flatMap((project) => {
    const name = asText(project.name, "?");
    const databases = asArray(project.databases).map((one) => asText(one)).filter(Boolean);
    return (databases.length ? databases : [name]).map((db) => ({ db, project: name, path: asText(project.path) }));
  });
}

function withExtras(rows, driftEntries) {
  const known = new Set(rows.map((row) => row.db));
  const extra = driftEntries.map((one) => asText(one.db)).filter((db) => db && !known.has(db));
  return [...rows, ...extra.map((db) => ({ db, project: "", path: "" }))];
}

function buildRow(row, drift, resets, states) {
  const state = asObject(states[row.db]);
  const reset = asObject(resets[row.db]);
  return {
    ...row, drift: drift.get(row.db) ?? null, publish: parseStamp(state.lastPublish), reset: parseStamp(state.lastReset),
    exists: reset.exists !== false, hasBaseline: reset.hasBaseline === true,
  };
}

function parseMeta(raw) {
  const r = asObject(raw);
  return {
    env: asText(r.environment_name), service: asText(r.sql_server_service), port: asNumber(r.sql_server_port),
    target: asText(r.sql_server_target), configured: r.db_configured !== false,
  };
}

export async function loadDbOverview(base, instance) {
  const [meta, projects, drift, resets, states] = await Promise.all([
    getJson(base, "/api/devdb/meta"), getJson(base, "/api/devdb/projects"), getJson(base, "/api/db/drift"),
    getJson(base, "/api/db/reset-state").catch(() => ({})), loadDbState(instance),
  ]);
  const entries = asArray(asObject(drift).entries).map(asObject);
  const byDb = new Map(entries.map((one) => [asText(one.db), parseDrift(one)]));
  const rows = withExtras(projectRows(asObject(projects).projects), entries);
  const resetStates = asObject(asObject(resets).states);
  return { meta: parseMeta(meta), rows: rows.map((row) => buildRow(row, byDb, resetStates, states)) };
}

export async function runDiff(base, db) {
  const body = asObject(await postJson(base, "/api/db/diff", { db, script: false, fast_only: true }));
  if (body.needs_engine) return { needsEngine: true, result: null };
  if (!body.result) throw new Error(asText(body.error, "diff returned no result"));
  return { needsEngine: false, result: parseResult(body.result) };
}

export function driftTone(row) {
  const drift = row.drift;
  if (!drift) return "unchecked";
  if (drift.kind === "error") return "error";
  if (drift.result.inSync && drift.result.changes === 0) return "in-sync";
  return "drifted";
}
