import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { button, icon, shade, ICONS } from "./kit.js";
import { errorRow, ago } from "./ui.js";
import { autoOn, autoState } from "./ship-feedback.js";
import { tally } from "./ship-model.js";
import { tile, statusIcon, bucketColor, statusLine, SPIN } from "./ship-tile.js";
import { drawer, reviewStrip } from "./ship-drawer.js";

const POLL_NOTE = "GitLab is read only here. Running pipelines are checked every 30 s and open MRs every 2 min, also while this window is hidden; finished ones stop. Pipelines: one per repo and branch this session pushed in the last 3 days.";
const AUTO_TIP = "Auto-send: CI failures and new review comments go to this agent by itself, only while it is idle";
const COUNTERS = ["failed", "running", "passed"];
const IDLE_ICONS = { failed: "circle-x", running: "circle-dashed", passed: "circle-check" };

function counter(t, bucket, n) {
  const color = n ? bucketColor(t, bucket) : t.dim;
  return h_flex().id(`count-${bucket}`).flex_none().h(30).px(9).gap(6).items_center().rounded(8)
    .border_1().border_color(n ? shade(color, "border") : t.border).bg(n ? shade(color, "subtle") : t.background)
    .tooltip(`${n} pipeline${n === 1 ? "" : "s"} ${bucket}`)
    .child(n ? statusIcon(t, bucket, 16) : icon(IDLE_ICONS[bucket], 16, t.dim))
    .child(div().text_size(18).font_bold().text_color(color).child(String(n)));
}

function infoIcon(panel, t) {
  const ship = panel.tracker(), tracked = ship.tracked();
  const lines = [POLL_NOTE, ship.leader ? "This window polls." : "Another Git copy polls.", tracked.at ? `Sessions scanned ${ago(tracked.at)} ago.` : "", tracked.warning ?? ""].filter(Boolean);
  if (ship.discovering) return div().id("ship-info").w(16).flex_none().text_size(13).text_color(t.accent).tooltip(lines.join("\n")).frames(SPIN, 90);
  return div().id("ship-info").flex_none().cursor_pointer().tooltip(lines.join("\n")).child(icon("info", 14, t.dim));
}

function autoToggle(panel, t, sessionId) {
  const on = autoOn(sessionId), own = typeof autoState().sessions[sessionId] === "boolean";
  return button("ship-auto", "auto", t, (_e, cx) => panel.toggleAuto(sessionId, cx), { small: true, active: on, icon: on ? "send" : null, tooltip: `${AUTO_TIP}. ${on ? "On" : "Off"}${own ? "" : " (default)"}` });
}

export function shipHeader(panel, t, tiles) {
  const id = panel.selectedId(), counts = tally(tiles);
  return h_flex().flex_none().gap(6).items_center()
    .children(COUNTERS.map((bucket) => counter(t, bucket, counts[bucket])))
    .when(Boolean(id), (e) => e.child(autoToggle(panel, t, id ?? "")))
    .child(infoIcon(panel, t));
}

function sectionHead(t, tiles) {
  return h_flex().h(18).gap(6).items_center().text_size(10.5).font_semibold().text_color(t.dim)
    .child(icon(ICONS.ship, 12, t.dim))
    .child(div().child("PIPELINES"))
    .child(div().text_color(t.dim).child(`${tiles.length}`));
}

function problems(panel, t) {
  const ship = panel.tracker();
  return [
    ship.error && errorRow(t, ship.error, "ship-error", (_e, cx) => ship.refresh(cx)),
    ship.blocked && errorRow(t, `GitLab: ${ship.blocked.text} (paused 10 min)`, "ship-blocked", (_e, cx) => ship.refresh(cx)),
  ].filter(Boolean);
}

export function shipSection(panel, t, tiles) {
  const reviews = panel.reviews(), errors = problems(panel, t), live = panel.live();
  const open = tiles.find((x) => x.key === panel.opened);
  if (!tiles.length && !reviews.length && !errors.length) return null;
  return v_flex().id("ship-section").flex_none().gap(8)
    .children(errors)
    .children(reviews.map((item) => reviewStrip(panel, t, item, live)))
    .when(tiles.length > 0, (e) => e.child(sectionHead(t, tiles))
      .child(h_flex().id("ship-tiles").flex_none().gap(8).flex_wrap().children(tiles.map((x) => tile(panel, t, x)))))
    .when(Boolean(open), (e) => e.child(drawer(panel, t, open)));
}

export function tileFor(tiles, repo, branch) {
  const mine = tiles.filter((x) => x.path === repo);
  return mine.find((x) => x.branch === branch) ?? mine[0] ?? null;
}

export function ciDot(panel, t, x) {
  if (!x) return null;
  return div().id(`ci-dot-${x.key}`).flex_none().cursor_pointer()
    .tooltip(`${x.branch}: ${statusLine(t, x)} (click for the pipeline)`)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => panel.openTile(x.key, cx))
    .child(statusIcon(t, x.bucket, 13));
}
