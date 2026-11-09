import { div } from "gpui-kit";
import { v_flex, h_flex, Input, NumberInput } from "gpui-base";
import { tint, mono } from "./widgets.js";
import { shortContext } from "../kubectl.js";
import { icon, kbd } from "./icons.js";
import { section } from "./parts.js";
import { writeReady, writeTargets } from "../write-actions.js";

const SPIN = ["\u{280b}", "\u{2819}", "\u{2839}", "\u{2838}", "\u{283c}", "\u{2834}", "\u{2826}", "\u{2827}", "\u{2807}", "\u{280f}"];
const ACTION_ICON = { delete: "trash", restart: "rotate-cw", scale: "arrow-up-down" };

function commandBox(t, argv) {
  return h_flex().id("write-cmd").px(10).py(7).gap(8).items_start().rounded(8).bg(t.background).border_1().border_color(t.border)
    .child(div().flex_none().text_color(t.ansi2).font_family(mono()).text_size(11.5).child("$"))
    .child(div().flex_1().min_w(0).whitespace_normal().font_family(mono()).text_size(11.5).text_color(t.foreground).child(argv.join(" ")));
}

function typedState(write) {
  const typed = write.typed.trim();
  if (!typed) return "empty";
  if (typed === write.expect) return "match";
  return write.expect.startsWith(typed) ? "partial" : "wrong";
}

function confirmField(t, app, write) {
  const state = typedState(write);
  const border = state === "match" ? t.ansi2 : state === "wrong" ? t.ansi1 : t.input;
  return v_flex().gap(5)
    .child(h_flex().gap(4).flex_wrap().text_size(11.5).text_color(t.muted)
      .child(div().child("Type"))
      .child(div().font_family(mono()).font_bold().text_color(t.foreground).child(write.expect))
      .child(div().child("to confirm")))
    .child(h_flex().id("write-input").h(30).px(9).gap(6).items_center().rounded(7).border_1().border_color(border).bg(t.surface)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(Input.new(app.confirmInput).flex_1().h_full().font_family(mono()).text_size(12).text_color(t.foreground))
      .when(state === "match", (el) => el.child(icon("check", 14, t.ansi2)))
      .when(state === "wrong", (el) => el.child(icon("x", 14, t.ansi1))));
}

function scaleField(t, app, write) {
  const next = write.replicas;
  const isSame = next === write.current;
  return h_flex().gap(10).items_center()
    .child(v_flex().items_center().child(div().text_size(22).font_bold().text_color(t.muted).child(String(write.current))).child(div().text_size(10).text_color(t.dim).child("now")))
    .child(icon("chevron-right", 18, t.dim))
    .child(h_flex().id("scale-input").w(110).h(34).px(6).items_center().rounded(7).border_1().border_color(next === null ? t.ansi1 : isSame ? t.input : t.ansi3).bg(t.surface)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(NumberInput.new(app.scaleInput).flex_1().h_full().text_size(14).text_color(t.foreground)))
    .child(div().flex_1().text_size(11).text_color(next === null ? t.ansi1 : t.dim).child(next === null ? "0 to 50 replicas" : isSame ? "pick a new count" : `${next > write.current ? "+" : ""}${next - write.current} replicas`));
}

function submitButton(t, app, write) {
  const isReady = writeReady(write);
  const color = write.action === "delete" ? t.ansi1 : t.ansi3;
  const isRunning = write.phase === "running";
  return h_flex().id("write-go").h(28).px(12).gap(6).items_center().rounded(7)
    .bg(isReady || isRunning ? color : t.raised).border_1().border_color(isReady ? color : t.border)
    .when(isReady, (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)).active((s) => s.opacity(0.7)))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => app.submitWrite(cx))
    .child(isRunning ? div().text_color(t.background).frames(SPIN, 90).child(SPIN[0]) : icon(ACTION_ICON[write.action], 13, isReady ? t.background : t.dim))
    .child(div().text_size(12).font_bold().text_color(isReady || isRunning ? t.background : t.dim).child(isRunning ? "Running..." : write.title))
    .when(isReady && !isRunning, (el) => el.child(kbd(t, "\u{21b5}", true)));
}

export function writePanel(t, app) {
  const write = app.state.write;
  if (!write) return null;
  const color = write.action === "delete" ? t.ansi1 : t.ansi3;
  return v_flex().id("write-panel").flex_none().mx(10).mt(10).px(12).py(10).gap(9).rounded(10).bg(tint(color, "10")).border_1().border_color(tint(color, "77"))
    .child(h_flex().gap(8).items_center()
      .child(icon(ACTION_ICON[write.action], 15, color))
      .child(div().flex_1().min_w(0).truncate().text_size(13).font_bold().text_color(color).child(`${write.title} ${write.subject}`))
      .child(div().flex_none().text_size(10.5).text_color(t.dim).child(shortContext(app.state.scope.context))))
    .child(commandBox(t, write.argv))
    .child(write.action === "scale" ? scaleField(t, app, write) : confirmField(t, app, write))
    .when(Boolean(write.error), (el) => el.child(h_flex().gap(6).items_start().child(icon("circle-x", 13, t.ansi1)).child(div().flex_1().text_size(11.5).text_color(t.ansi1).whitespace_normal().child(write.error))))
    .child(h_flex().gap(8).items_center()
      .child(submitButton(t, app, write))
      .child(h_flex().id("write-cancel").h(28).px(10).gap(6).items_center().rounded(7).cursor_pointer().hover((s) => s.bg(t.hover))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => app.cancelWrite(cx))
        .child(div().text_size(12).text_color(t.muted).child("Cancel")).child(kbd(t, "esc", false))));
}

function dangerRow(t, id, spec) {
  const color = spec.tone === "danger" ? t.ansi1 : t.ansi3;
  return h_flex().id(id).px(10).py(7).gap(10).items_center().rounded(8).cursor_pointer().hover((s) => s.bg(tint(color, "18"))).active((s) => s.opacity(0.75))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click(spec.onClick)
    .child(icon(spec.icon, 15, color))
    .child(v_flex().flex_1().min_w(0)
      .child(div().text_size(12).font_semibold().text_color(t.foreground).child(spec.title))
      .child(div().truncate().text_size(10.5).text_color(t.dim).child(spec.body)))
    .child(kbd(t, spec.hotkey, false));
}

export function dangerZone(t, app) {
  const { pod, workload } = writeTargets(app);
  const rows = [
    ...(pod ? [dangerRow(t, "dz-delete", { icon: "trash", tone: "danger", title: "Delete pod", body: `${pod.name}, its controller makes a new one`, hotkey: "\u{21e7}D", onClick: (_e, cx) => app.beginWrite("delete", cx) })] : []),
    ...(workload ? [dangerRow(t, "dz-restart", { icon: "rotate-cw", tone: "caution", title: `Rollout restart ${workload.kind}`, body: workload.name, hotkey: "\u{21e7}R", onClick: (_e, cx) => app.beginWrite("restart", cx) })] : []),
    ...(workload ? [dangerRow(t, "dz-scale", { icon: "arrow-up-down", tone: "caution", title: `Scale ${workload.kind}`, body: `${workload.name} \u{00b7} ${workload.replicas ?? "?"} replica${workload.replicas === 1 ? "" : "s"} now`, hotkey: "\u{21e7}S", onClick: (_e, cx) => app.beginWrite("scale", cx) })] : []),
    ...(pod?.container ? [dangerRow(t, "dz-shell", { icon: "square-terminal", tone: "caution", title: "Shell", body: `${pod.container} \u{00b7} /bin/sh in a new tab`, hotkey: "s", onClick: (_e, cx) => app.startShell(null, cx) })] : []),
  ];
  if (rows.length === 0) return null;
  return v_flex().pb(16)
    .child(section(t, `Danger zone \u{00b7} ${shortContext(app.state.scope.context)}`, "triangle-alert"))
    .child(v_flex().mx(14).p(4).gap(2).rounded(10).border_1().border_color(tint(t.ansi3, "66")).bg(tint(t.ansi3, "0c")).children(rows));
}
