import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { selectedDb, shownResult, diffFor, isDrifted } from "../db-actions.js";
import { driftTone } from "../db-api.js";
import { chip, note, iconButton, ICONS } from "./widgets.js";
import { section, factGrid, pill } from "./parts.js";

const MID = "\u{b7}";
const OP_GROUPS = ["Create", "Alter", "Drop"];

function pad(number) {
  return String(number).padStart(2, "0");
}

export function stampText(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "-";
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function driftColor(t, tone) {
  if (tone === "in-sync") return t.ansi2;
  if (tone === "drifted") return t.ansi3;
  if (tone === "error") return t.ansi1;
  return t.dim;
}

export function statusText(row) {
  const tone = driftTone(row);
  if (tone === "in-sync") return "in sync";
  if (tone === "error") return "check failed";
  if (tone === "unchecked") return "not checked";
  const { result } = row.drift;
  return `drifted ${MID} ${result.changes}${result.dataLoss ? " !" : ""}`;
}

function stampFact(stamp) {
  if (!stamp) return "never";
  const took = stamp.durationMs ? ` ${MID} ${(stamp.durationMs / 1000).toFixed(1)}s` : "";
  return `${stampText(stamp.at)} ${MID} ${stamp.source || "?"}${took}`;
}

function facts(t, row) {
  return factGrid(t, "db-facts", [
    ["project", row.project || "-"], ["baseline", row.exists ? (row.hasBaseline ? "saved" : "none yet") : "database missing", row.exists ? undefined : t.ansi1],
    ["last publish", stampFact(row.publish)], ["checked", row.drift ? `${stampText(row.drift.at)}${row.drift.stale ? " (stale)" : ""}` : "not yet"],
    ...(row.reset ? [["last reset", stampFact(row.reset)]] : []), ...(row.path ? [["path", row.path]] : []),
  ]);
}

function opRows(t, result, group) {
  return result.ops.filter((op) => op.action === group).map((op, index) => h_flex().id(`op-${group}-${index}`).mx(14).gap(6).text_size(11)
    .child(div().w(90).flex_none().truncate().text_color(t.dim).child(op.type))
    .child(div().flex_1().min_w(0).truncate().text_color(op.dataLoss ? t.ansi1 : t.foreground).child(op.name))
    .when(op.dataLoss, (el) => el.child(div().flex_none().text_color(t.ansi1).child("data loss"))));
}

function opsList(t, result) {
  const groups = OP_GROUPS.filter((group) => result.ops.some((op) => op.action === group));
  return groups.flatMap((group) => [section(t, `${group} ${result.ops.filter((op) => op.action === group).length}`, "list"), ...opRows(t, result, group)]);
}

function filesList(t, result) {
  if (result.files.length === 0) return [];
  return [
    section(t, `Changed source files ${result.files.length}`, ICONS.logs),
    ...result.files.map((one, index) => h_flex().id(`file-${index}`).mx(14).gap(6).text_size(11)
      .child(div().w(60).flex_none().text_color(t.dim).child(one.action))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(one.path))),
  ];
}

function resultView(t, result) {
  if (result.inSync && result.changes === 0) return [note(t, result.quick ? "Nothing changed since the last publish." : "A publish would make no changes.", "success")];
  const counts = h_flex().mx(14).gap(4).flex_wrap()
    .child(chip(t, `create ${result.created}`, t.ansi2)).child(chip(t, `alter ${result.altered}`, t.ansi3)).child(chip(t, `drop ${result.dropped}`, t.ansi1))
    .when(result.dataLoss, (el) => el.child(chip(t, "possible data loss", t.ansi1, "solid")));
  return [counts, ...opsList(t, result), ...filesList(t, result)];
}

function driftView(app, t, row) {
  const diff = diffFor(app, row);
  const result = shownResult(app, row);
  if (diff?.loading) return [note(t, "Running a read-only diff...")];
  const parts = [
    ...(diff?.error ? [note(t, diff.error, "error")] : []),
    ...(diff?.needsEngine ? [note(t, "The fast check cannot tell; the full diff needs the SQL engine (orbit sqlserver diff --analyze).", "warning")] : []),
    ...(!diff && row.drift?.kind === "error" ? [note(t, `${row.drift.code ? `${row.drift.code}: ` : ""}${row.drift.error}`, "error")] : []),
  ];
  if (result) return [...parts, ...resultView(t, result)];
  return parts.length ? parts : [note(t, "No drift result yet. Run diff to check.")];
}

function actions(app, t, row) {
  const { asking, dbDiff } = app.state;
  const drifted = isDrifted(app, row);
  return [
    iconButton(t, "db-diff", "rotate-cw", (_e, cx) => app.runDbDiff(cx),
      { disabled: dbDiff.loading, label: dbDiff.loading && dbDiff.db === row.db ? "Diffing" : "Run diff", tooltip: "Read-only: compares the database with its SQL project (POST /api/db/diff, fast check)" }),
    iconButton(t, "db-ask", "sparkles", (_e, cx) => app.askDb(cx),
      { hotkey: "c", tone: drifted ? "primary" : undefined, disabled: asking || !drifted, label: asking ? "Asking" : "Ask agent", tooltip: drifted ? "Send the drift to the agent" : "Only for a drifted database" }),
  ];
}

export function dbDrawerSpec(app, t) {
  const row = selectedDb(app);
  if (!row) return { id: "db", open: false };
  const tone = driftTone(row);
  const color = driftColor(t, tone);
  return {
    id: "db", open: Boolean(app.state.drawerOpen), icon: ICONS.db, tone: color, alert: tone === "error",
    title: row.db, subtitle: row.project ? `project ${row.project}` : "database",
    chips: [pill(t, statusText(row), color)], actions: actions(app, t, row),
    body: v_flex().child(section(t, "Overview", "gauge")).child(facts(t, row)).child(section(t, "Drift", "layers")).children(driftView(app, t, row)),
  };
}
