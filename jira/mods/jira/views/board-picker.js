import { div } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";
import { pickerRows, closePicker, choose } from "../board-picker.js";
import { boardId } from "../settings.js";
import { icon, kbd, spinner, errorBox, emptyNote, shade, mono } from "./widgets.js";

const PANEL_W = 560;
const VISIBLE = 12;
const BEFORE = 5;
const ROW_H = 40;
const TYPE_LOOK = Object.freeze({ scrum: ["zap", "ansi5"], kanban: ["square-kanban", "ansi4"], simple: ["layers", "ansi6"] });

function windowOf(rows, index) {
  const start = Math.max(0, Math.min(index - BEFORE, rows.length - VISIBLE));
  return { start, shown: rows.slice(start, start + VISIBLE) };
}

function typeBadge(t, type) {
  const [name, tone] = TYPE_LOOK[type] ?? ["layers", "muted"];
  const color = t[tone] ?? t.muted;
  return h_flex().flex_none().h(18).px(6).gap(4).items_center().rounded(4).bg(shade(color, "subtle")).border_1().border_color(shade(color, "border"))
    .child(icon(name, 10, color)).child(div().text_size(10).font_semibold().text_color(color).child(type || "board"));
}

function boardRow(app, t, board, isHighlighted) {
  const isCurrent = board.id === boardId();
  return h_flex().id(`jira-pick-${board.id}`).flex_none().h(ROW_H).px(10).gap(8).items_center().rounded(7).cursor_pointer()
    .bg(isHighlighted ? t.selected : t.background).border_1().border_color(isHighlighted ? t.accent : shade(t.border, "clear"))
    .hover((s) => s.bg(t.hover))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => choose(app, board, cx))
    .child(div().flex_none().w(16).child(isCurrent ? icon("check", 13, t.ansi2) : div()))
    .child(v_flex().flex_1().min_w(0)
      .child(div().truncate().text_size(12).font_semibold().text_color(t.foreground).child(board.name))
      .child(div().truncate().text_size(10).text_color(t.dim).child(board.location || `board ${board.id}`)))
    .when(Boolean(board.project), (el) => el.child(div().flex_none().font_family(mono()).text_size(10.5).font_bold().text_color(t.accent).child(board.project)))
    .child(typeBadge(t, board.type));
}

function listBody(app, t, picker) {
  if (picker.loading) return v_flex().py(18).items_center().child(spinner(t, "Reading boards\u{2026}"));
  const rows = pickerRows(app);
  if (!rows.length) return emptyNote(t, "search", picker.boards.length ? "No board matches" : "No boards found", picker.boards.length ? "Try a project key or part of the name" : "");
  const { start, shown } = windowOf(rows, picker.index);
  return v_flex().gap(3)
    .when(start > 0, (el) => el.child(div().text_size(10).text_color(t.dim).child(`\u{2191} ${start} more`)))
    .children(shown.map((board, offset) => boardRow(app, t, board, start + offset === picker.index)))
    .when(start + shown.length < rows.length, (el) => el.child(div().text_size(10).text_color(t.dim).child(`\u{2193} ${rows.length - start - shown.length} more`)));
}

function searchBox(app, t) {
  const isActive = app.typing.has("picker");
  return h_flex().h(30).px(8).gap(6).items_center().rounded(7).border_1().border_color(isActive ? t.accent : t.border).bg(t.background)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(icon("search", 13, isActive ? t.accent : t.dim))
    .child(Input.new(app.pickerInput).flex_1().h_full().text_size(11.5).text_color(t.foreground));
}

function hints(t, picker) {
  const pair = (key, word) => h_flex().flex_none().gap(4).items_center().child(kbd(t, key, false)).child(div().text_size(10).text_color(t.dim).child(word));
  return h_flex().gap(10).items_center()
    .child(pair("\u{2191}\u{2193}", "move")).child(pair("\u{21b5}", "use board")).child(pair("esc", "close"))
    .child(div().flex_1())
    .when(picker.saving, (el) => el.child(spinner(t, "switching\u{2026}")));
}

function panel(app, t, picker) {
  return v_flex().id("jira-picker").w(PANEL_W).p(12).gap(10).rounded(12).bg(t.popover).border_1().border_color(t.border).shadow_lg()
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(h_flex().gap(8).items_center()
      .child(icon("square-kanban", 15, t.accent))
      .child(div().flex_1().text_size(13).font_bold().text_color(t.foreground).child("Choose a board"))
      .when(!picker.loading, (el) => el.child(div().text_size(10.5).text_color(t.dim).child(`${picker.boards.length} boards`))))
    .child(div().text_size(11).text_color(t.muted).child("Saved as boardId in data/jira/settings.json; project and Scrum or Kanban are read from the board."))
    .child(searchBox(app, t))
    .when(Boolean(picker.error), (el) => el.child(errorBox(t, "jira-picker-error", picker.error, null)))
    .child(listBody(app, t, picker))
    .child(hints(t, picker));
}

export function boardPicker(app, t) {
  const picker = app.state.picker;
  if (!picker) return null;
  return div().id("jira-picker-layer").absolute().inset_0().flex().items_start().justify_center().pt(64).bg(shade(t.background, "strong"))
    .on_mouse_down("left", (_e, cx) => { if (!picker.saving) closePicker(app, cx); })
    .child(panel(app, t, picker));
}
