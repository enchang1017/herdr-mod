import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { terminals } from "herdr";
import { shortContext, isProdContext } from "../kubectl.js";
import { liveTerminals, liveOf, openLiveWindow } from "../live.js";
import { tint, button, chip, card, cardHeader, mono, PROD_GLYPH, LIVE_GLYPH, ICONS } from "./widgets.js";

const HELP_KEYS = [
  ["j / k", "move the selection (the drawer follows)"], ["enter", "open the detail drawer"], ["1-6", "pods, deploy, svc, nodes, events, ing"],
  ["tab / 1-5", "drawer tabs (while it is open)"], ["o / e / y / l / d", "overview, events, yaml, logs, describe"],
  ["w", "follow logs live"], ["c", "ask the agent"], ["f", "failing rows only"], ["/", "filter names"],
  ["a", "all namespaces (asks first on prod)"], ["n", "the selected row's namespace"], ["r", "refresh now"],
  ["\u{21e7}D / \u{21e7}R / \u{21e7}S", "delete pod, rollout restart, scale (write contexts only)"], ["s", "shell into the pod (write contexts only)"],
  ["g", "back to Find"], ["?", "this help"], ["esc", "close the innermost: confirm, drawer, picker, help"],
  ["cmd-enter", "dock beside the focused pane, or float again"], ["cmd-shift-t", "open in a new tab (from the window)"],
];

function liveState(t, address) {
  const terminal = terminals().find((one) => one.address === address);
  if (terminal?.state === "live") return { word: "live", color: t.ansi2 };
  return { word: terminal ? "ended" : "gone", color: t.ansi1 };
}

function liveContext(t, context) {
  return isProdContext(context)
    ? chip(t, `${PROD_GLYPH} ${shortContext(context)}`, t.ansi1, "solid")
    : chip(t, shortContext(context), t.ansi4);
}

export function liveBar(view, t, live) {
  const state = liveState(t, live.address);
  return h_flex().id("live-bar").size_full().px(10).gap(8).items_center().font_family(mono()).bg(t.surface)
    .border_b(1).border_color(isProdContext(live.context) ? t.ansi1 : t.border).text_size(12)
    .child(chip(t, `${LIVE_GLYPH} ${state.word}`, state.color))
    .child(liveContext(t, live.context))
    .child(div().min_w(0).truncate().font_semibold().text_color(t.foreground).child(`${live.namespace}/${live.name}`))
    .child(div().flex_none().text_size(11).text_color(t.dim).child(live.kind === "statefulset" ? "sts" : live.kind))
    .child(div().flex_1())
    .when(Boolean(view.message), (el) => el.child(div().min_w(0).truncate().text_color(t.ansi1).child(view.message)))
    .child(button(t, "live-ask", view.asking ? "Asking..." : "Ask", (_e, cx) => view.askLive(cx), { disabled: view.asking, primary: true }))
    .child(button(t, "live-restart", view.restarting ? "Restarting..." : "Restart", (_e, cx) => view.restart(cx), { disabled: view.restarting }))
    .child(button(t, "live-loki", "Loki", (_e, cx) => view.openLoki(cx), { disabled: !view.lokiUrl() }))
    .child(button(t, "live-close", "Stop", (_e, cx) => view.stopLive(cx), { tooltip: "Stop the stream and close" }));
}

function liveRow(app, t, live, index) {
  return h_flex().id(`live-${index}`).h(30).px(10).gap(8).items_center().hover((s) => s.bg(t.hover))
    .child(liveContext(t, live.context))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(`${live.namespace}/${live.name}`))
    .child(button(t, `live-show-${index}`, "Show", () => openLiveWindow(live)))
    .child(button(t, `live-stop-${index}`, "Stop", (_e, cx) => app.stopLive(live.address, cx)));
}

export function liveBanner(app, t) {
  const running = liveTerminals().map(liveOf);
  if (running.length === 0) return div();
  return card(t, "live-card").mt(8).border_color(tint(t.ansi2, "88"))
    .child(cardHeader(t, { icon: LIVE_GLYPH, color: t.ansi2, title: "Live", meta: `${running.length} stream${running.length === 1 ? "" : "s"}` }))
    .children(running.map((live, index) => liveRow(app, t, live, index)));
}

export function helpCard(app, t) {
  return card(t, "help-card").flex_1().min_h(0)
    .child(cardHeader(t, { icon: ICONS.help, title: "Keys", actions: [button(t, "help-close", "Close", (_e, cx) => app.toggleHelp(cx), { hotkey: "esc" })] }))
    .child(v_flex().id("help-list").flex_1().min_h(0).overflow_y_scrollbar().py(4)
      .children(HELP_KEYS.map(([keys, what], index) => h_flex().id(`help-${index}`).h(24).px(12).gap(10).items_center()
        .child(div().w(120).flex_none().text_color(t.accent).font_semibold().child(keys))
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(what)))));
}

export function confirmCard(app, t) {
  const confirm = app.state.confirm;
  return card(t, "confirm-card").border_color(t.ansi1)
    .child(cardHeader(t, { icon: PROD_GLYPH, color: t.ansi1, title: "All namespaces on production?" }))
    .child(v_flex().px(12).py(8).gap(8)
      .child(div().text_size(11.5).text_color(t.muted).child(`Lists every namespace in ${shortContext(confirm.context)}. It is read-only but heavier on the API server.`))
      .child(h_flex().gap(6)
        .child(button(t, "confirm-yes", "List all namespaces", (_e, cx) => app.confirmAll(true, cx), { primary: true }))
        .child(button(t, "confirm-no", "Cancel", (_e, cx) => app.confirmAll(false, cx), { hotkey: "esc" }))));
}
