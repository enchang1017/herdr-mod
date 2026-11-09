import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, focused, home, props } from "herdr";
import { button, tabs } from "./kit.js";
import { workspaceRootPath } from "./settings.js";

export const MOD = "change-radar";
const TOP_TABS = [["radar", "Change radar"], ["graph", "Graph"], ["session", "Session"]];

export function rootFor() {
  const f = focused(), list = spaces();
  const space = list.find((s) => s.id === f?.space) ?? list.find((s) => s.active);
  if (!space) return { root: workspaceRootPath(), on: null, source: "no space: default" };
  const tabIds = new Set(space.tabs.map((t) => t.id));
  const cwd = (panes().find((p) => tabIds.has(p.tab) && p.cwd)?.cwd || space.folder || "").replace(/\/+$/, "");
  const h = home();
  if (!cwd || cwd === h || h.startsWith(`${cwd}/`)) return { root: workspaceRootPath(), on: null, source: `space ${space.name} is at home: default` };
  return { root: cwd, on: space.machine ?? null, source: `space ${space.name}` };
}

export function placeKind(e) {
  const { platform, shift, control, alt } = e.modifiers ?? {};
  if (!platform || control || alt) return null;
  if (e.key === "enter" && !shift) return "toggle";
  if ((e.key === "t" || e.key === "T") && shift) return "tab";
  return null;
}

export function topBar(app, t) {
  const isWindow = Boolean(props()?.overlay);
  const tooltip = isWindow ? "Dock beside the focused pane (cmd-enter). New tab: cmd-shift-t" : "Back to a floating window (cmd-enter)";
  return h_flex().flex_none().h(36).px(10).gap(8).items_center().bg(t.chrome).border_b(1).border_color(t.border)
    .child(div().font_bold().text_size(13).child("Git"))
    .child(tabs(t, "top-tabs", TOP_TABS, app.tab, (key, _ev, cx) => app.setTab(key, cx)))
    .child(div().flex_1())
    .child(button("place", `${isWindow ? "Dock" : "Float"} \u{2318}\u{21b5}`, t, (_ev, cx) => app.togglePlace(cx), { small: true, tooltip }));
}
