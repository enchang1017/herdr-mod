import { div } from "gpui-kit";
import { v_flex, h_flex, HoverCard, v_virtual_list, Scrollbar } from "gpui-base";
import { cachedDetail } from "../data.js";
import { age } from "../text.js";
import { typeIcon, priorityIcon, statusPill, avatar, errorBox, emptyNote, button, icon, shade, mono } from "./widgets.js";

const ROW_HEIGHT = 30;
const OPEN_DELAY_MS = 650;
const CLOSE_DELAY_MS = 120;
const CARD_WIDTH = 320;
export const MAX_ROWS = 300;
const COLUMNS = [["", 18], ["KEY", 118], ["SUMMARY", 0], ["STATUS", 132], ["P", 22], ["WHO", 28], ["AGE", 40]];

function fact(t, label, value, color) {
  return h_flex().gap(8).items_center()
    .child(div().w(64).flex_none().text_color(t.dim).child(label))
    .child(div().flex_1().min_w(0).truncate().text_color(color ?? t.foreground).child(value));
}

function hoverFacts(t, row) {
  const detail = cachedDetail(row.key);
  if (!detail) return [div().text_color(t.dim).child("open it to load epic, sprint and dates")];
  return [
    ...(detail.epic ? [fact(t, "parent", `${detail.epic.key} ${detail.epic.summary}`.trim(), t.ansi5)] : []),
    ...(detail.sprint ? [fact(t, "sprint", detail.sprint)] : []),
    ...(detail.updated ? [fact(t, "updated", `${age(detail.updated)} ago`)] : []),
    ...(detail.comments.length ? [fact(t, "comments", String(detail.comments.length))] : []),
    ...(detail.plan.length ? [fact(t, "plan", `${detail.plan.length} plan link${detail.plan.length > 1 ? "s" : ""}`, t.ansi2)] : []),
  ];
}

function hoverContent(t, row) {
  return v_flex().w(CARD_WIDTH).px(12).py(10).gap(5).rounded(10).bg(t.popover).border_1().border_color(t.border).shadow_lg()
    .text_size(11).text_color(t.foreground)
    .child(h_flex().gap(6).items_center().child(typeIcon(t, row.type)).child(div().font_bold().text_size(12).child(row.key))
      .child(div().flex_1()).child(statusPill(t, row.status, row.category)))
    .child(div().text_size(12).text_color(t.foreground).child(row.summary))
    .child(fact(t, "type", row.type || "?"))
    .child(fact(t, "priority", row.priority || "none"))
    .child(fact(t, "assignee", row.assignee || "Unassigned", row.assignee ? t.foreground : t.dim))
    .children(hoverFacts(t, row))
    .child(div().pt(2).text_size(10).text_color(t.dim).child("click or \u{21b5} for the drawer"));
}

function withHover(t, element, row, index) {
  return HoverCard.new(`jira-hover-${index}`).anchor("top_left").open_delay(OPEN_DELAY_MS).close_delay(CLOSE_DELAY_MS)
    .trigger(element).content(hoverContent(t, row));
}

function cell(width, child) {
  return width ? div().flex_none().w(width).flex().items_center().child(child) : div().flex_1().min_w(0).flex().items_center().child(child);
}

function rowAge(t, row) {
  const updated = cachedDetail(row.key)?.updated;
  return div().text_size(10.5).text_color(t.dim).child(updated ? age(updated) : "\u{b7}");
}

function tableRow(app, t, row, index) {
  const isSelected = row.key === app.state.selected;
  const isOpen = isSelected && app.state.drawer?.key === row.key;
  const element = h_flex().id(`jira-row-${index}`).h(ROW_HEIGHT).w_full().flex_none().px(8).gap(6).items_center().cursor_pointer()
    .border_l(2).border_color(isSelected ? t.accent : shade(t.background, "clear"))
    .when(isSelected, (el) => el.bg(isOpen ? shade(t.accent, "soft") : t.selected))
    .hover((s) => s.bg(t.hover))
    .child(cell(COLUMNS[0][1], typeIcon(t, row.type)))
    .child(cell(COLUMNS[1][1], div().font_family(mono()).text_size(11.5).font_semibold().text_color(isSelected ? t.accent : t.foreground).child(row.key)))
    .child(cell(0, div().truncate().text_size(12).text_color(t.foreground).child(row.summary)))
    .child(cell(COLUMNS[3][1], statusPill(t, row.status, row.category, COLUMNS[3][1] - 4)))
    .child(cell(COLUMNS[4][1], priorityIcon(t, row.priority)))
    .child(cell(COLUMNS[5][1], avatar(t, row.assignee, 20)))
    .child(cell(COLUMNS[6][1], rowAge(t, row)));
  return withHover(t, element, row, index);
}

function headRow(t) {
  return h_flex().h(22).flex_none().px(8).gap(6).items_center().bg(t.raised).border_b(1).border_color(t.border).border_l(2)
    .text_size(9.5).font_bold().text_color(t.dim)
    .children(COLUMNS.map(([label, width]) => cell(width, div().child(label))));
}

function emptyBody(app, t) {
  if (app.loadState().loading) return emptyNote(t, "loader", "Loading work items\u{2026}", "");
  if (app.state.filter) return emptyNote(t, "search", "Nothing matches the filter", "esc clears it");
  return emptyNote(t, "inbox", "No work items here", "Try another view or JQL");
}

function rowList(app, t, drawn) {
  return div().id("jira-rows-box").relative().flex_1().min_h(0)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .child(v_virtual_list("jira-rows", drawn.length, ROW_HEIGHT, (index) => drawn[index].key,
      (range) => drawn.slice(range.start, range.end).map((row, offset) => tableRow(app, t, row, range.start + offset)))
      .on_item_click((key, cx) => app.clickRow(key, cx))
      .track_scroll(app.rowScroll).size_full())
    .child(Scrollbar.vertical("jira-rows").absolute().inset_0());
}

export function tableCard(app, t) {
  const rows = app.shownRows();
  const drawn = rows.slice(0, MAX_ROWS);
  return v_flex().id("jira-table").flex_1().min_h(0).mx(10).mb(4).rounded(10).border_1().border_color(t.border).bg(t.background).overflow_hidden()
    .when(Boolean(app.loadState().error), (el) => el.child(errorBox(t, "jira-list-error", app.loadState().error, (_e, cx) => app.refresh(cx))))
    .child(headRow(t))
    .when(rows.length > 0, (el) => el.child(rowList(app, t, drawn)))
    .when(rows.length === 0, (el) => el.child(v_flex().id("jira-rows").flex_1().min_h(0).child(emptyBody(app, t))))
    .when(rows.length > MAX_ROWS, (el) => el.child(div().flex_none().px(10).py(5).text_size(11).text_color(t.dim).child(`+${rows.length - MAX_ROWS} more not drawn`)));
}

export function loginCard(app, t, command) {
  return v_flex().m(14).p(16).gap(10).rounded(12).border_1().border_color(shade(t.ansi3, "border")).bg(shade(t.ansi3, "subtle"))
    .child(h_flex().gap(8).items_center().child(icon("lock", 16, t.ansi3)).child(div().text_size(13).font_bold().child("Jira is not signed in")))
    .child(div().text_size(11.5).text_color(t.muted).child("acli has no Jira login yet. Run this in a terminal, finish the browser sign-in, then Retry:"))
    .child(h_flex().gap(8).items_center()
      .child(div().flex_1().min_w(0).px(8).py(5).rounded(6).bg(t.background).border_1().border_color(t.border).font_family(mono()).text_size(12).child(command))
      .child(button(t, "jira-login-copy", "Copy", (_e, cx) => cx.write_to_clipboard(command), { icon: "copy" }))
      .child(button(t, "jira-login-retry", "Retry", (_e, cx) => app.retryAuth(cx), { primary: true, disabled: app.loadState().loading })));
}
