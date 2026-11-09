import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { SECTIONS, counts } from "./model.js";

const MAX_LIST_H = 620;
import { ICONS, icon, button, chip, pill, card, cardHeader, monoFont } from "./kit.js";
import { STATUS, programIcon, statusIcon, ago, hint } from "./ui.js";

function nameLine(t, view, item, index, now) {
  const key = index < 9 ? ` ${index + 1}` : "";
  return h_flex().gap(10).items_center()
    .child(div().w(16).flex_none().flex().items_center().justify_center().child(statusIcon(t, item.status)))
    .child(programIcon(item.program, 17, t.foreground))
    .child(div().flex_shrink(1).min_w(0).truncate().font_bold().text_size(14).child(item.name))
    .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(item.program?.name ?? ""))
    .when(Boolean(item.since), (e) => e.child(pill(t, ICONS.clock, ago(item, now), t.foreground)))
    .child(button(`go-${item.address}`, `Go${key}`, t, (_e, cx) => view.open(item, cx), { small: true, ghost: true, tooltip: "Switch to this agent" }));
}

function placeLine(t, item) {
  const [space, ...rest] = item.where.split(" · ");
  return h_flex().pl(52).gap(6).items_center()
    .child(pill(t, ICONS.space, space || "?", t.accent))
    .children(rest.map((part) => pill(t, ICONS.tab, part, t.ansi5)))
    .when(Boolean(item.machine), (e) => e.child(pill(t, ICONS.agent, item.machine ?? "", t.ansi4)))
    .when(item.pinned, (e) => e.child(chip(t, "pinned", t.accent, "tint")))
    .child(div().flex_1())
    .child(pill(t, ICONS.agent, item.address, t.muted));
}

function agentRow(t, view, item, index, now) {
  const selected = index === view.selected;
  return v_flex().id(`row-${item.address}`).px(12).py(10).gap(7).cursor_pointer()
    .border_l(2).border_color(selected ? t.accent : t.background)
    .when(selected, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => view.open(item, cx))
    .child(nameLine(t, view, item, index, now))
    .child(placeLine(t, item));
}

function sectionCard(t, view, items, section, now) {
  const members = items.filter((item) => item.status === section.status);
  if (!members.length) return null;
  const tone = STATUS[section.status].tone(t);
  return card(t, `card-${section.status}`)
    .child(cardHeader(t, { lead: statusIcon(t, section.status), title: STATUS[section.status].title, color: tone, meta: String(members.length) }))
    .children(members.map((item) => agentRow(t, view, item, items.indexOf(item), now)));
}

function header(t, view, items) {
  const n = counts(items);
  return h_flex().h(44).flex_none().px(14).gap(10).items_center().bg(t.surface).border_b(1).border_color(t.border)
    .child(icon(ICONS.radar, 17, t.accent))
    .child(div().font_bold().text_size(15).child("Agent radar"))
    .when(n.blocked > 0, (e) => e.child(chip(t, `${n.blocked} need you`, t.blocked, "tint", ICONS.blocked)))
    .when(n.done > 0, (e) => e.child(chip(t, `${n.done} done`, t.done, "tint", ICONS.done)))
    .when(n.working > 0, (e) => e.child(chip(t, `${n.working} working`, t.working, "outline")))
    .child(div().flex_1())
    .child(pill(t, ICONS.agent, `${items.length} agents`))
    .when(view.closable(), (e) => e.child(button("close", "", t, (_e, cx) => view.close(cx), { small: true, ghost: true, icon: ICONS.close, tooltip: "Close (esc)" })));
}

function legend(t, error) {
  return h_flex().gap(12).px(14).py(8).flex_wrap().items_center().border_t(1).border_color(t.border).bg(t.surface)
    .children(SECTIONS.map((s) => h_flex().gap(5).items_center()
      .child(statusIcon(t, s.status, 13))
      .child(div().text_size(12).text_color(STATUS[s.status].tone(t)).child(STATUS[s.status].label))))
    .when(Boolean(error), (e) => e.child(div().min_w(0).truncate().text_size(12).text_color(t.ansi1).child(error ?? "")))
    .child(div().flex_1())
    .child(hint(t, "↑↓", "select"))
    .child(hint(t, "⏎", "go"))
    .child(hint(t, "1-9", "quick go"))
    .child(hint(t, "esc", "close"));
}

function body(t, view, items, now) {
  const list = v_flex().id("radar-list").max_h(MAX_LIST_H).overflow_y_scrollbar().p(10).gap(10);
  if (!items.length) return list.child(div().p(10).text_size(13).text_color(t.dim).child("No agents yet. Start Claude or another agent in a tab."));
  return list.children(SECTIONS.map((s) => sectionCard(t, view, items, s, now)).filter(Boolean));
}

export function panel(t, view, items, now) {
  return v_flex().id("agent-radar").w_full().bg(t.chrome).text_color(t.foreground).text_size(13).font_family(monoFont())
    .track_focus(view.handle)
    .on_key_down((e, cx) => view.key(e, cx))
    .child(header(t, view, items))
    .child(body(t, view, items, now))
    .child(legend(t, view.claude?.error));
}
