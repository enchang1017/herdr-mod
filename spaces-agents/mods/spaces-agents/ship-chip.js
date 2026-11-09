import { div } from "gpui-kit";
import { shared, openOverlay, run, notify } from "herdr";
import { windowOpen } from "./agent-menu.js";

const KEY = "change-radar.ship";
const GIT_WINDOW = { mod: "change-radar", kind: "window", key: "change-radar-panel", width: 0.6, height: 0.85 };
const SPIN = ["\u{280b}", "\u{2819}", "\u{2839}", "\u{2838}", "\u{283c}", "\u{2834}", "\u{2826}", "\u{2827}", "\u{2807}", "\u{280f}"];
const SID = /^[\w-]+$/;

function openShip(sessionId, cx) {
  cx.spawn(async () => {
    let open = false;
    try {
      open = await windowOpen("change-radar");
    } catch (e) {
      notify({ title: "Ship", body: `Could not read herdr-app status, opening a new Git window: ${e?.message ?? e}`, level: "warning" });
    }
    if (open) run(`change-radar.ship-open-${sessionId}`);
    else openOverlay({ ...GIT_WINDOW, props: { tab: "ship", sessionId } });
  });
}

export function shipChip(sessionId, t) {
  const value = SID.test(sessionId ?? "") ? shared(KEY)?.[sessionId] : null;
  if (!value) return null;
  const failed = value.state === "failed";
  const color = failed ? t.ansi1 : t.working;
  const count = value.count > 1 ? ` ${value.count}` : "";
  return div().id(`ship-chip-${sessionId}`).flex_none().px(5).h(17).gap(3).rounded(5).bg(`${String(color).slice(0, 7)}26`).text_size(10.5).font_medium().text_color(color)
    .flex().items_center().cursor_pointer()
    .tooltip(failed ? `CI failed on ${value.count} branch${value.count === 1 ? "" : "es"}: click for Ship` : `CI running on ${value.count} branch${value.count === 1 ? "" : "es"}: click for Ship`)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => { cx.stop_propagation(); openShip(sessionId, cx); })
    .child(failed ? div().child("\u{2715}") : div().frames(SPIN, 90))
    .child(div().child(`CI${count}`));
}
