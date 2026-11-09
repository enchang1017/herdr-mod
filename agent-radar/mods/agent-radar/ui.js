import { div, image, svg } from "gpui-kit";
import { run } from "herdr";
import { icon, ICONS } from "./kit.js";
import { duration } from "./model.js";

const SPINNER = "mods/workspace-chrome/spinner.svg";
const PULSE = { from: 0.45, to: 1, period: 1100 };

export const STATUS = Object.freeze({
  blocked: { label: "needs you", title: "Needs you", tone: (t) => t.blocked },
  done: { label: "done", title: "Done", tone: (t) => t.done },
  working: { label: "working", title: "Working", tone: (t) => t.working },
  idle: { label: "idle", title: "Idle", tone: (t) => t.idle ?? t.dim },
});

export function programIcon(program, size, color) {
  if (!program?.icon) return icon(ICONS.agent, size, color);
  return program.tint
    ? svg(program.icon).size(size).flex_none().text_color(color)
    : image(program.icon).w(size).h(size).flex_none();
}

export function statusIcon(t, status, size = 15) {
  const tone = STATUS[status]?.tone(t) ?? t.dim;
  if (status === "working") return svg(SPINNER).size(size - 1).flex_none().text_color(tone).spin(900);
  if (status === "blocked") return icon(ICONS.blocked, size, tone).loop("opacity", PULSE);
  return icon(ICONS[status] ?? ICONS.idle, size, tone);
}

export function ago(item, now) {
  return item.since ? duration(now - item.since) : "";
}

export function jump(item) {
  if (item.pane) run("pane.focus", { pane: item.pane });
  else run("terminal.peek", { terminal: item.address });
}

export function hint(t, keys, text) {
  return div().flex_none().text_size(11.5).text_color(t.dim).child(`${keys} ${text}`);
}
