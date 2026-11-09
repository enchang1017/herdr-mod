import { div } from "gpui-kit";
import { h_flex, v_virtual_list, Scrollbar } from "gpui-base";
import { monoFont } from "./ui.js";
import { shade } from "./kit.js";

const ROW = 20;
const GUTTER = 36;

export function diffRows(raw) {
  let old = 0, next = 0;
  return raw.map((line) => {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (m) { old = +m[1]; next = +m[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, old: old++, text: line.slice(1) || " " };
    if (kind === "+") return { kind, next: next++, text: line.slice(1) || " " };
    if (kind === " ") return { kind, old: old++, next: next++, text: line.slice(1) || " " };
    return { kind: "", text: line };
  });
}

function gutterCell(t, value, color) {
  return div().w(GUTTER).flex_none().pr(6).text_right().text_color(color).child(value === undefined ? "" : String(value));
}

function diffRow(row, t) {
  if (row.kind === "@") {
    return div().w_full().h(ROW).flex_none().px(10).flex().items_center().truncate().bg(shade(t.accent, "subtle")).text_color(t.accent).child(row.text);
  }
  const color = row.kind === "+" ? t.ansi2 : row.kind === "-" ? t.ansi1 : null;
  const number = color ? shade(color, "strong") : t.dim;
  return h_flex().w_full().h(ROW).flex_none().items_center()
    .when(Boolean(color), (e) => e.bg(shade(color, "subtle")))
    .child(h_flex().h_full().flex_none().items_center().bg(color ? shade(color, "soft") : t.surface).border_r(1).border_color(t.border)
      .child(gutterCell(t, row.old, number)).child(gutterCell(t, row.next, number)))
    .child(div().w(16).flex_none().text_center().text_color(color ?? t.dim).child(color ? row.kind : ""))
    .child(div().flex_1().min_w(0).whitespace_nowrap().text_color(color ? t.foreground : t.muted).child(row.text));
}

export function diffText(rows) {
  return rows.map((row) => (row.kind === "@" || row.kind === "" ? row.text : `${row.kind}${row.text}`)).join("\n");
}

export function diffView(id, rows, t, width) {
  return div().id(`${id}-box`).flex_1().min_h(0).relative().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).font_family(monoFont()).text_size(11).bg(t.background)
    .child(div().id(`${id}-x`).size_full().overflow_x_scrollbar()
      .child(div().w_full().min_w(width).h_full()
        .child(v_virtual_list(id, rows.length, ROW, (i) => String(i), (range) => rows.slice(range.start, range.end).map((r) => diffRow(r, t))).size_full())))
    .child(Scrollbar.vertical(id).viewport_from_layout().absolute().inset_0());
}

export function diffWidth(rows) {
  return Math.max(300, ...rows.slice(0, 2000).map((r) => r.text.length * 7 + GUTTER * 2 + 40));
}
