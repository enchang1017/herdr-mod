import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { toneColor, tint } from "./widgets.js";
import { icon } from "./icons.js";
import { age } from "../quantity.js";
import { meter, usageBase, usageRatio, ratioTone } from "./meter.js";

const SHIMMER = { from: 0.35, to: 0.8, period: 1200 };

export function section(t, title, iconName, extra) {
  return h_flex().px(14).pt(14).pb(6).gap(6).items_center()
    .child(icon(iconName, 13, t.dim))
    .child(div().flex_none().text_size(10.5).font_bold().text_color(t.dim).child(title.toUpperCase()))
    .child(div().flex_1().h(1).bg(t.border))
    .when(Boolean(extra), (el) => el.child(extra));
}

function factCell(t, fact, id) {
  const [label, value, tone] = fact;
  return v_flex().id(id).flex_1().min_w(0).gap(2).tooltip(String(value))
    .child(div().text_size(10.5).text_color(t.dim).child(label))
    .child(div().truncate().text_size(12).text_color(tone ? toneColor(t, tone) : t.foreground).child(String(value)));
}

export function factGrid(t, id, facts) {
  const pairs = Array.from({ length: Math.ceil(facts.length / 2) }, (_unused, index) => facts.slice(index * 2, index * 2 + 2));
  return v_flex().mx(14).px(12).py(10).gap(10).rounded(10).bg(t.surface).border_1().border_color(t.border)
    .children(pairs.map((pair, index) => h_flex().gap(12)
      .child(factCell(t, pair[0], `${id}-${index}-a`))
      .child(pair[1] ? factCell(t, pair[1], `${id}-${index}-b`) : div().flex_1())));
}

function usageCaption(spec, base, ratio) {
  if (ratio === null || !base) return "";
  const word = base.kind === "limit" ? spec.limitWord ?? "limit" : "request";
  return `${Math.round(ratio * 100)}% of ${word}`;
}

export function usageBar(t, id, spec) {
  const base = usageBase(spec);
  const ratio = usageRatio(spec);
  const tone = ratioTone(ratio);
  const markAt = base?.kind === "limit" && spec.request ? spec.request / base.value : null;
  const right = [...(spec.limitWord ? [] : [`req ${spec.format(spec.request)}`]), `${spec.limitWord ? "of" : "lim"} ${spec.format(spec.limit)}`].join("  ");
  return v_flex().gap(5)
    .child(h_flex().gap(6).items_center()
      .child(icon(spec.icon, 13, toneColor(t, tone)))
      .child(div().flex_none().text_size(11.5).font_semibold().text_color(t.foreground).child(spec.label))
      .child(div().flex_none().text_size(12).font_bold().text_color(toneColor(t, tone)).child(spec.usage === null ? spec.missing : spec.format(spec.usage)))
      .when(ratio !== null, (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child(usageCaption(spec, base, ratio))))
      .child(div().flex_1())
      .child(div().flex_none().text_size(10.5).text_color(t.dim).child(right)))
    .when(Boolean(base), (el) => el.child(meter(t, id, { ratio, width: spec.width, revealed: spec.revealed, markAt })));
}

export function skeleton(t, id, lines) {
  return v_flex().id(id).px(14).pt(14).gap(10)
    .children(Array.from({ length: lines }, (_unused, index) => div().id(`${id}-${index}`).h(index === 0 ? 28 : 14)
      .w(index === 0 ? 220 : 120 + ((index * 53) % 180)).rounded(6).bg(t.raised).loop("opacity", { ...SHIMMER, period: SHIMMER.period + index * 90 })));
}

export function conditionRows(t, id, conditions) {
  return v_flex().mx(14).rounded(10).border_1().border_color(t.border).overflow_hidden()
    .children(conditions.map((one, index) => h_flex().id(`${id}-${index}`).px(10).py(6).gap(8).items_center()
      .when(index > 0, (el) => el.border_t(1).border_color(t.border))
      .tooltip(one.message || one.reason || one.type)
      .child(icon(one.ok ? "check" : "x", 13, one.ok ? t.ansi2 : t.ansi1))
      .child(div().flex_none().text_size(12).text_color(t.foreground).child(one.type))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(one.ok ? t.dim : t.ansi3).child(one.ok ? "" : one.reason || one.message))
      .child(div().flex_none().text_size(10.5).text_color(t.dim).child(one.at ? age(one.at) : ""))));
}

export function textList(t, id, items) {
  if (items.length === 0) return div().px(14).text_size(11.5).text_color(t.dim).child("none");
  return v_flex().mx(14).gap(4)
    .children(items.map((item, index) => h_flex().id(`${id}-${index}`).gap(6).items_center().tooltip(item)
      .child(icon("chevron-right", 12, t.dim))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(item))));
}

export function emptyNote(t, iconName, title, body) {
  return v_flex().mx(14).mt(14).px(14).py(16).gap(6).items_center().rounded(10).border_1().border_dashed().border_color(t.border)
    .child(icon(iconName, 20, t.dim))
    .child(div().text_size(12).font_semibold().text_color(t.muted).child(title))
    .when(Boolean(body), (el) => el.child(div().text_size(11).text_color(t.dim).child(body ?? "")));
}

export function pill(t, text, tone, iconName) {
  const color = toneColor(t, tone);
  return h_flex().flex_none().h(20).px(7).gap(4).items_center().rounded(10).bg(tint(color, "1f")).border_1().border_color(tint(color, "44"))
    .when(Boolean(iconName), (el) => el.child(icon(iconName, 11, color)))
    .child(div().text_size(10.5).font_semibold().text_color(color).child(text));
}
