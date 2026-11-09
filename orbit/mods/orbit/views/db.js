import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { driftTone } from "../db-api.js";
import { clock } from "../model.js";
import { chip, errorRow, stateDot, ICONS } from "./widgets.js";
import { drawerArea, coveredWidth } from "./drawer.js";
import { cell, columnHeader, tableRow, toolbar, metaText, emptyNote } from "./parts.js";
import { dbDrawerSpec, stampText, driftColor, statusText } from "./db-drawer.js";

const MID = "\u{b7}";
const COLUMNS = [["database", 170], ["project", 150], ["status", 130], ["last publish", 120], ["checked", 110]];

function dbRow(app, t, row) {
  const isSelected = row.db === app.state.dbSelected;
  const color = driftColor(t, driftTone(row));
  return tableRow(t, `db-${row.db}`, { isSelected, isOpen: isSelected && app.state.drawerOpen, onClick: (_e, cx) => app.clickDbRow(row.db, cx) })
    .child(div().w(12).flex_none().child(stateDot(color, false)))
    .child(cell(170, div().font_semibold().child(row.db)))
    .child(cell(150, div().text_color(t.muted).child(row.project || "-")))
    .child(cell(130, div().text_color(color).child(statusText(row))))
    .child(cell(120, div().text_color(t.muted).child(row.publish ? stampText(row.publish.at) : "never")))
    .child(cell(110, div().text_color(t.dim).child(row.drift ? `${stampText(row.drift.at)}${row.drift.stale ? " stale" : ""}` : "-")));
}

function summaryChips(t, rows) {
  const tones = rows.map(driftTone);
  const count = (tone) => tones.filter((one) => one === tone).length;
  return [
    chip(t, `${count("in-sync")}/${rows.length} in sync`, t.ansi2),
    ...(count("drifted") ? [chip(t, `${count("drifted")} drifted`, t.ansi3)] : []),
    ...(count("error") ? [chip(t, `${count("error")} check failed`, t.ansi1)] : []),
  ];
}

function tools(app, t) {
  const { db } = app.state;
  const target = db.meta?.service ? `${db.meta.service}:${db.meta.port || "?"}` : "";
  const when = db.loading ? "loading" : `updated ${clock(db.at)}`;
  return toolbar(t)
    .children(db.rows.length ? summaryChips(t, db.rows) : [])
    .child(div().flex_1())
    .child(metaText(t, [target, when].filter(Boolean).join(` ${MID} `)));
}

function table(app, t) {
  const { db } = app.state;
  return v_flex().flex_1().min_h(0).min_w(0).pr(app.state.drawerOpen ? coveredWidth(app) : 0)
    .child(columnHeader(t, COLUMNS, ""))
    .when(Boolean(db.error), (el) => el.child(errorRow(t, "db-error", db.error, (_e, cx) => app.refresh(cx))))
    .child(v_flex().id("db-rows").flex_1().min_h(0).overflow_y_scrollbar()
      .children(db.rows.map((row) => dbRow(app, t, row)))
      .when(db.rows.length === 0 && !db.error, (el) => el.child(emptyNote(t, ICONS.db, db.loading ? "Reading database projects..." : "No SQL Server database projects", ""))));
}

export function dbView(app, t) {
  return v_flex().flex_1().min_h(0)
    .child(tools(app, t))
    .child(drawerArea(app, t, { ...dbDrawerSpec(app, t), table: table(app, t) }));
}
