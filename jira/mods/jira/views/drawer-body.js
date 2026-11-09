import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { age, clock } from "../text.js";
import { section, icon, avatar, statusPill, typeIcon, errorBox, emptyNote, shade, mono } from "./widgets.js";

const SHIMMER = Object.freeze({ from: 0.35, to: 0.8, period: 1200 });
const FADE = Object.freeze({ duration: 170, easing: "ease-out" });
const DESCRIPTION_CHARS = 12000;

function skeleton(t, id, lines) {
  return v_flex().id(id).px(14).pt(14).gap(10)
    .children(Array.from({ length: lines }, (_unused, index) => div().id(`${id}-${index}`).h(index === 0 ? 24 : 12)
      .w(index === 0 ? 220 : 120 + ((index * 53) % 200)).rounded(6).bg(t.raised).loop("opacity", { ...SHIMMER, period: SHIMMER.period + index * 90 })));
}

function stamp(at) {
  return at ? `${new Date(at).toISOString().slice(0, 10)} ${clock(at)} \u{b7} ${age(at)} ago` : "";
}

function factCell(t, id, label, value) {
  return v_flex().id(id).flex_1().min_w(0).gap(2).tooltip(String(value || "-"))
    .child(div().text_size(10).text_color(t.dim).child(label))
    .child(div().truncate().text_size(11.5).text_color(t.foreground).child(String(value || "-")));
}

function facts(t, detail) {
  return v_flex().mx(14).mt(12).px(12).py(10).gap(10).rounded(10).bg(t.surface).border_1().border_color(t.border)
    .child(h_flex().gap(12).child(factCell(t, "jira-f-rep", "Reporter", detail.reporter)).child(factCell(t, "jira-f-lab", "Labels", detail.labels.join(", "))))
    .child(h_flex().gap(12).child(factCell(t, "jira-f-cre", "Created", stamp(detail.created))).child(factCell(t, "jira-f-upd", "Updated", stamp(detail.updated))));
}

function planButtons(t, app, urls) {
  return h_flex().mx(14).gap(6).flex_wrap()
    .children(urls.map((url, index) => h_flex().id(`jira-plan-${index}`).flex_none().max_w(300).h(28).px(10).gap(6).items_center().rounded(8).cursor_pointer()
      .bg(shade(t.ansi2, "subtle")).border_1().border_color(shade(t.ansi2, "border")).tooltip(url)
      .hover((s) => s.bg(shade(t.ansi2, "soft"))).active((s) => s.opacity(0.75))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => app.openUrl(url, cx))
      .child(icon("sparkles", 13, t.ansi2))
      .child(div().truncate().text_size(11.5).font_semibold().text_color(t.ansi2).child(url.replace(/^https:\/\//, "")))
      .child(icon("external-link", 11, t.ansi2))));
}

function description(t, text) {
  if (!text) return div().px(14).text_size(11.5).text_color(t.dim).child("No description.");
  const shown = text.length > DESCRIPTION_CHARS ? `${text.slice(0, DESCRIPTION_CHARS)}\u{2026}` : text;
  return v_flex().mx(14).gap(3).text_size(12).text_color(t.foreground)
    .children(shown.split("\n").map((line, index) => div().id(`jira-desc-${index}`).when(!line.trim(), (el) => el.h(6)).child(line)));
}

function refRow(t, app, ref, id, label) {
  return h_flex().id(id).px(10).py(6).gap(8).items_center().cursor_pointer().hover((s) => s.bg(t.hover))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => app.openKey(ref.key, cx))
    .when(Boolean(label), (el) => el.child(div().flex_none().w(84).truncate().text_size(10.5).text_color(t.dim).child(label ?? "")))
    .child(typeIcon(t, ref.type, 12))
    .child(div().flex_none().font_family(mono()).text_size(11).font_semibold().text_color(t.accent).child(ref.key))
    .child(div().flex_1().min_w(0).truncate().text_size(11.5).child(ref.summary))
    .child(statusPill(t, ref.status, ref.category, 120));
}

function refList(t, app, id, refs, labelled) {
  return v_flex().mx(14).rounded(10).border_1().border_color(t.border).overflow_hidden()
    .children(refs.map((ref, index) => refRow(t, app, ref, `${id}-${index}`, labelled ? ref.label : null).when(index > 0, (el) => el.border_t(1).border_color(t.border))));
}

function comment(t, one, index) {
  return h_flex().id(`jira-comment-${index}`).mx(14).gap(10).items_start()
    .child(avatar(t, one.author, 24))
    .child(v_flex().flex_1().min_w(0).gap(4).px(10).py(8).rounded(10).bg(t.surface).border_1().border_color(t.border)
      .child(h_flex().gap(6).items_center()
        .child(div().text_size(11.5).font_semibold().child(one.author))
        .child(div().text_size(10.5).text_color(t.dim).child(one.at ? `${age(one.at)} ago` : "")))
      .children(one.text.split("\n").map((line, at) => div().id(`jira-comment-${index}-${at}`).text_size(11.5).text_color(t.foreground).when(!line.trim(), (el) => el.h(4)).child(line))));
}

function sections(t, app, detail) {
  const count = (list) => div().text_size(10.5).text_color(t.dim).child(String(list.length));
  return v_flex().pb(16)
    .child(facts(t, detail))
    .when(detail.plan.length > 0, (el) => el.child(section(t, "Plan", "sparkles", count(detail.plan))).child(planButtons(t, app, detail.plan)))
    .child(section(t, "Description", "file"))
    .child(description(t, detail.description))
    .when(detail.subtasks.length > 0, (el) => el.child(section(t, "Subtasks", "list-todo", count(detail.subtasks))).child(refList(t, app, "jira-sub", detail.subtasks, false)))
    .when(detail.links.length > 0, (el) => el.child(section(t, "Links", "link", count(detail.links))).child(refList(t, app, "jira-link", detail.links, true)))
    .child(section(t, "Comments", "message-square", count(detail.comments)))
    .when(detail.comments.length === 0, (el) => el.child(div().px(14).text_size(11.5).text_color(t.dim).child("No comments yet.")))
    .child(v_flex().gap(8).children(detail.comments.map((one, index) => comment(t, one, index))));
}

function content(t, app, key) {
  const state = app.state.detail;
  const detail = app.detailFor(key);
  if (state.key === key && state.error) return errorBox(t, "jira-detail-error", state.error, (_e, cx) => app.refreshDetail(cx));
  if (!detail) return skeleton(t, "jira-detail-skeleton", 8);
  return sections(t, app, detail);
}

export function drawerBody(t, app, key) {
  const drawer = app.state.drawer;
  const token = drawer?.token ?? 0;
  if (!key) return emptyNote(t, "inbox", "Nothing selected", "Pick a row on the left.");
  return v_flex().id(`jira-drawer-body-${token}`).flex_1().min_h(0).opacity(drawer?.revealed === false ? 0 : 1).transition("opacity", FADE)
    .child(v_flex().id(`jira-drawer-scroll-${token}`).flex_1().min_h(0).overflow_y_scrollbar().child(content(t, app, key)));
}
