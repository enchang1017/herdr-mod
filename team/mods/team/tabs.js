import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { shared, setShared } from "herdr";
import { shade } from "./kit.js";

export const TABS = ["dev", "mr", "agents", "running"];
const LABELS = { dev: "Start dev", mr: "Review MR", agents: "Agents", running: "Running" };
const UI_KEY = "team.ui";

function savedUi() {
  const ui = shared(UI_KEY);
  return ui && typeof ui === "object" ? ui : {};
}

export function initialTab(section, hasTemplate) {
  if (TABS.includes(section)) return section;
  if (hasTemplate) return "agents";
  const saved = savedUi().tab;
  return TABS.includes(saved) ? saved : "dev";
}

export function saveTab(tab) {
  if (savedUi().tab !== tab) setShared(UI_KEY, { ...savedUi(), tab });
}

function badge(t, counts) {
  const color = counts.waiting ? t.blocked : t.dim;
  return div().flex_none().h(16).min_w(16).px(5).flex().items_center().justify_center().rounded(8).text_size(10).font_bold()
    .bg(shade(color, "soft")).text_color(color).child(String(counts.live));
}

function tabItem(app, t, key, index, counts) {
  const on = app.tab === key;
  return h_flex().id(`tab-${key}`).h(24).px(10).gap(6).items_center().rounded(5).text_size(11.5).cursor_pointer()
    .tooltip(`${LABELS[key]} (${index + 1})`)
    .when(on, (e) => e.bg(t.solid).text_color(t.solid_foreground).font_semibold())
    .when(!on, (e) => e.text_color(t.muted).hover((s) => s.bg(t.hover)))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => app.setTab(key, cx))
    .child(LABELS[key])
    .when(key === "running", (e) => e.child(badge(t, counts)));
}

export function tabBar(app, t) {
  const counts = app.running.counts();
  return h_flex().flex_none().px(8).py(5).bg(t.chrome).border_b(1).border_color(t.border)
    .child(h_flex().id("team-tabs").p(2).gap(2).rounded(7).bg(t.surface).border_1().border_color(t.border)
      .children(TABS.map((key, index) => tabItem(app, t, key, index, counts))));
}

export function statusStrip(app, t) {
  const counts = app.running.counts();
  return h_flex().id("team-status").flex_none().h(22).px(10).gap(6).items_center().bg(t.surface).border_t(1).border_color(t.border)
    .text_size(10.5).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover))
    .tooltip("Show running agents (4)")
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => app.setTab("running", cx))
    .child(`${counts.live} running`)
    .child("\u{b7}")
    .child(div().when(counts.waiting > 0, (e) => e.text_color(t.blocked).font_semibold()).child(`${counts.waiting} waiting`));
}
