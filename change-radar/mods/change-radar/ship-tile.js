import { div } from "gpui-kit";
import { v_flex, h_flex, HoverCard } from "gpui-base";
import { button, icon, shade } from "./kit.js";
import { statusLook, mrLook } from "./ci-view.js";
import { ago } from "./ui.js";

export const SPIN = ["\u{280b}", "\u{2819}", "\u{2839}", "\u{2838}", "\u{283c}", "\u{2834}", "\u{2826}", "\u{2827}", "\u{2807}", "\u{280f}"];
const TILE_H = 90;
const TILE_W = 232;
const PULSE = { from: 0.35, to: 1, period: 1100 };
const BUCKET_ICONS = { failed: "circle-x", passed: "circle-check", idle: "circle-dashed" };

export function bucketColor(t, bucket) {
  return { failed: t.ansi1, running: t.working, passed: t.ansi2 }[bucket] ?? t.dim;
}

export function statusIcon(t, bucket, size) {
  const color = bucketColor(t, bucket);
  if (bucket === "running") return div().w(size).h(size).flex_none().flex().items_center().justify_center().text_size(Math.round(size * 0.8)).text_color(color).frames(SPIN, 90);
  return icon(BUCKET_ICONS[bucket] ?? BUCKET_ICONS.idle, size, color);
}

const since = (ms) => (ago(ms) === "now" ? "just now" : `${ago(ms)} ago`);
const lasted = (ms) => (ago(ms) === "now" ? "<1m" : ago(ms));

export function statusLine(t, x) {
  const p = x.pipeline;
  if (!p) return x.error ? "GitLab error" : x.checked ? "no pipeline" : "checking\u{2026}";
  if (x.bucket === "failed") return `failed \u{b7} ${p.failed?.[0]?.name ?? x.stages?.find((s) => s.status === "failed")?.name ?? `#${p.id}`}`;
  if (x.bucket === "running") return `${statusLook(t, p.status).label} ${lasted(p.createdAt ?? p.at)}`;
  return `${x.bucket === "passed" ? "passed" : statusLook(t, p.status).label} ${p.at ? since(p.at) : ""}`.trim();
}

function segment(t, status, id) {
  const color = statusLook(t, status).color;
  const done = status === "success" || status === "failed" || status === "running";
  return div().id(id).flex_1().min_w(4).h(6).rounded(3).bg(done ? color : shade(color, "border"))
    .when(status === "running", (e) => e.loop("opacity", PULSE));
}

export function stageRows(t, stages) {
  return stages.map((s, i) => {
    const look = statusLook(t, s.status);
    return h_flex().id(`stage-row-${i}`).h(20).gap(8).items_center().text_size(11)
      .child(icon(look.icon, 12, look.color))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(s.name))
      .child(div().flex_none().text_color(t.dim).child(`${s.done}/${s.total}`));
  });
}

function hoverContent(t, x) {
  return v_flex().w(240).px(10).py(8).gap(2).rounded(8).bg(t.popover).border_1().border_color(t.border).shadow_lg()
    .when(Boolean(x.stages), (e) => e.children(stageRows(t, x.stages ?? [])))
    .when(!x.stages, (e) => e.child(div().text_size(11).text_color(t.dim).child(x.pipeline ? `#${x.pipeline.id} ${statusLook(t, x.pipeline.status).label}: stage detail loads on failure or when Graph shows this repo` : "No pipeline yet")));
}

function stageBar(tab, t, x) {
  const list = x.stages ?? [{ status: x.pipeline?.status ?? "created" }];
  const bar = h_flex().id(`bar-${x.key}`).w_full().h(10).gap(3).items_center()
    .on_hover((on, cx) => tab.hover(x.key, on, cx))
    .children(list.map((s, i) => segment(t, s.status, `seg-${x.key}-${i}`)));
  const card = HoverCard.new(`hc-${x.key}`).anchor("top_left").open_delay(300).close_delay(120).trigger(bar);
  return tab.hovered === x.key ? card.content(hoverContent(t, x)) : card;
}

function mrPill(t, x) {
  const mr = x.mr, look = mr.state === "opened" && mr.approved ? { color: t.ansi2, label: "approved" } : mrLook(t, mr);
  const notes = mr.unresolved?.length ?? 0;
  return h_flex().id(`mr-${x.key}`).h(22).pl(8).pr(notes ? 3 : 8).gap(5).flex_none().items_center().rounded(11)
    .border_1().border_color(shade(look.color, "strong")).bg(t.background).text_size(11).font_semibold().text_color(look.color)
    .tooltip(`!${mr.iid} ${look.label} \u{b7} ${mr.title}${notes ? `\n${notes} unresolved` : ""}`)
    .cursor_pointer().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => cx.open_url(mr.url))
    .child(`!${mr.iid}`)
    .when(notes > 0, (e) => e.child(div().h(16).min_w(16).px(4).flex().items_center().justify_center().rounded(8).bg(t.ansi3).text_color(t.background).text_size(10).font_bold().child(String(notes))));
}

function corner(t, x) {
  return h_flex().flex_none().gap(4).items_center()
    .when(Boolean(x.mr), (e) => e.child(mrPill(t, x)))
    .when(Boolean(x.pipeline?.url), (e) => e.child(button(`open-${x.key}`, "", t, (_e, cx) => cx.open_url(x.pipeline.url), { small: true, ghost: true, icon: "external-link", tooltip: `Open pipeline #${x.pipeline?.id}` })));
}

export function tile(tab, t, x) {
  const color = bucketColor(t, x.bucket), loud = x.bucket === "failed", quiet = x.bucket === "passed" || x.bucket === "idle";
  const open = tab.opened === x.key;
  return v_flex().id(`tile-${x.key}`).flex_none().w(TILE_W).h(TILE_H).px(10).py(8).gap(4).rounded(10).border_1()
    .border_color(open ? color : quiet ? t.border : shade(color, loud ? "strong" : "border"))
    .bg(loud ? shade(color, "soft") : quiet ? t.background : shade(color, "subtle"))
    .cursor_pointer().hover((s) => s.border_color(color))
    .on_click((_e, cx) => tab.openTile(x.key, cx))
    .child(h_flex().gap(8).items_start()
      .child(statusIcon(t, x.bucket, 22))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().text_size(13).font_bold().text_color(quiet ? t.muted : t.foreground).child(x.name))
        .child(div().truncate().text_size(10.5).text_color(t.dim).child(x.branch)))
      .child(corner(t, x)))
    .child(div().flex_1())
    .child(stageBar(tab, t, x))
    .child(div().id(`line-${x.key}`).truncate().text_size(11).font_semibold().text_color(quiet ? t.dim : color)
      .when(Boolean(x.error), (e) => e.tooltip(x.error ?? ""))
      .child(statusLine(t, x)));
}
