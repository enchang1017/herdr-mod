import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { icon } from "./icons.js";
import { shade } from "./tokens.js";

export const ROW_PX = 26;

export function section(t, title, iconName, extra) {
  return h_flex().px(14).pt(14).pb(6).gap(6).items_center()
    .child(icon(iconName, 13, t.dim))
    .child(div().flex_none().text_size(10.5).font_bold().text_color(t.dim).child(title.toUpperCase()))
    .child(div().flex_1().h(1).bg(t.border))
    .when(Boolean(extra), (el) => el.child(extra));
}

function factCell(t, fact, id) {
  const [label, value, color] = fact;
  return v_flex().id(id).flex_1().min_w(0).gap(2).tooltip(String(value))
    .child(div().text_size(10.5).text_color(t.dim).child(label))
    .child(div().truncate().text_size(12).text_color(color ?? t.foreground).child(String(value)));
}

export function factGrid(t, id, facts) {
  const pairs = Array.from({ length: Math.ceil(facts.length / 2) }, (_unused, index) => facts.slice(index * 2, index * 2 + 2));
  return v_flex().mx(14).px(12).py(10).gap(10).rounded(10).bg(t.surface).border_1().border_color(t.border)
    .children(pairs.map((pair, index) => h_flex().gap(12)
      .child(factCell(t, pair[0], `${id}-${index}-a`))
      .child(pair[1] ? factCell(t, pair[1], `${id}-${index}-b`) : div().flex_1())));
}

export function pill(t, text, color, iconName) {
  return h_flex().flex_none().h(20).px(7).gap(4).items_center().rounded(10).bg(shade(color, "subtle")).border_1().border_color(shade(color, "border"))
    .when(Boolean(iconName), (el) => el.child(icon(iconName, 11, color)))
    .child(div().text_size(10.5).font_semibold().text_color(color).child(text));
}

export function emptyNote(t, iconName, title, body) {
  return v_flex().mx(14).mt(14).px(14).py(16).gap(6).items_center().rounded(10).border_1().border_dashed().border_color(t.border)
    .child(icon(iconName, 20, t.dim))
    .child(div().text_size(12).font_semibold().text_color(t.muted).child(title))
    .when(Boolean(body), (el) => el.child(div().text_size(11).text_color(t.dim).child(body ?? "")));
}

export function cell(width, child) {
  return div().w(width).flex_none().min_w(0).truncate().child(child);
}

export function columnHeader(t, columns, tail) {
  return h_flex().flex_none().h(24).pl(12).pr(10).gap(8).items_center().bg(t.surface).border_b(1).border_color(t.border)
    .text_size(10.5).font_bold().text_color(t.dim)
    .child(div().w(12).flex_none())
    .children(columns.map(([label, width]) => cell(width, label.toUpperCase())))
    .when(Boolean(tail), (el) => el.child(div().flex_1().min_w(0).truncate().child(tail ?? "")));
}

export function rowShell(t, id, spec) {
  return h_flex().id(id).flex_none().h(ROW_PX).px(10).gap(8).items_center().text_size(12).cursor_pointer()
    .border_l(2).border_color(spec.isSelected ? t.accent : t.background)
    .when(spec.isSelected, (el) => el.bg(spec.isOpen ? shade(t.accent, "subtle") : t.selected))
    .hover((s) => s.bg(t.hover));
}

export function tableRow(t, id, spec) {
  return rowShell(t, id, spec)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click(spec.onClick);
}

export function toolbar(t) {
  return h_flex().flex_none().px(10).py(6).gap(6).items_center().border_b(1).border_color(t.border);
}

export function metaText(t, text) {
  return div().flex_none().text_size(10.5).text_color(t.dim).child(text);
}
