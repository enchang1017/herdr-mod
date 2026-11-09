import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { button, chip, icon, shade, ICONS } from "./kit.js";
import { ago, monoFont } from "./ui.js";
import { failedJob } from "./ci-view.js";
import { feedbackList } from "./ship-feedback.js";
import { bucketColor, statusIcon, statusLine, stageRows } from "./ship-tile.js";

const REVIVE_TIP = "claude --resume this session in a new tab with the message";

function primary(tab, t, item, live, id) {
  const busy = tab.busy.has(item.id), revive = Boolean(item.notLive) || !live;
  return revive
    ? button(`${id}-revive`, "Revive", t, (_e, cx) => tab.revive(item, cx), { primary: true, icon: ICONS.agent, disabled: busy, tooltip: REVIVE_TIP })
    : button(`${id}-send`, busy ? "Sending\u{2026}" : "Send to agent", t, (_e, cx) => tab.send(item, cx), { primary: true, icon: "send", disabled: busy });
}

function actions(tab, t, x, item) {
  const open = !item?.sent;
  return h_flex().gap(8).items_center().flex_wrap()
    .when(Boolean(item && open), (e) => e.child(primary(tab, t, item, x.live, `dr-${x.key}`)))
    .when(Boolean(item?.sent), (e) => e.child(chip(t, item?.auto ? "auto-sent" : "sent", t.ansi2, "tint", ICONS.check)))
    .when(Boolean(x.pipeline?.url), (e) => e.child(button(`dr-open-${x.key}`, "Open", t, (_e, cx) => cx.open_url(x.pipeline.url), { icon: "external-link" })))
    .when(Boolean(item), (e) => e.child(button(`dr-copy-${x.key}`, "Copy", t, (_e, cx) => cx.write_to_clipboard(item.text), { icon: "copy", tooltip: "Copy the message for the agent" })))
    .when(Boolean(item && open), (e) => e.child(button(`dr-dismiss-${x.key}`, "Dismiss", t, (_e, cx) => tab.dismiss(item, cx), { ghost: true })))
    .when(Boolean(item?.sendError), (e) => e.child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.ansi1).child(`Send failed: ${item?.sendError}`)));
}

function head(tab, t, x) {
  const c = x.head;
  return h_flex().gap(10).items_center()
    .child(statusIcon(t, x.bucket, 22))
    .child(div().flex_none().text_size(14).font_bold().child(x.name))
    .child(div().flex_shrink(1).min_w(0).truncate().text_size(11.5).font_semibold().text_color(bucketColor(t, x.bucket)).child(statusLine(t, x)))
    .child(div().flex_1())
    .child(h_flex().id(`dr-commit-${x.key}`).flex_shrink(1).min_w(0).max_w(320).gap(6).items_center().text_size(11).text_color(t.muted).cursor_pointer().hover((s) => s.underline())
      .tooltip(`${c.subject}\nOpen the commit in Graph`).on_click((_e, cx) => tab.openCommit(x.path, c.sha, cx))
      .child(icon(ICONS.commit, 12, t.dim)).child(div().flex_none().font_family(monoFont()).child(c.short)).child(div().min_w(0).truncate().child(c.subject)))
    .child(button(`dr-close-${x.key}`, "", t, (_e, cx) => tab.openTile(x.key, cx), { small: true, ghost: true, icon: ICONS.close, tooltip: "Close (esc)" }));
}

function notes(t, x) {
  return (x.mr?.unresolved ?? []).map((n, i) => h_flex().id(`dr-note-${x.key}-${i}`).h(22).gap(8).items_center().text_size(11)
    .tooltip(`@${n.author}: ${n.body}`)
    .child(icon(ICONS.comment, 12, t.ansi3))
    .child(div().flex_none().max_w(220).truncate().text_color(t.dim).child(n.path ? `${n.path}${n.line ? `:${n.line}` : ""}` : "general"))
    .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(n.body.replace(/\s+/g, " "))));
}

export function drawer(tab, t, x) {
  const item = x.pipeline ? feedbackList().find((f) => f.id === `ci:${x.pipeline.id}`) ?? null : null;
  const failed = x.pipeline?.failed ?? [];
  return v_flex().id(`drawer-${x.key}`).flex_none().gap(10).p(14).rounded(12).border_1().border_color(shade(bucketColor(t, x.bucket), "border")).bg(t.surface)
    .child(head(tab, t, x))
    .when(failed.length > 0, (e) => e.child(v_flex().gap(2).children(failed.map((job) => failedJob(tab.app.ci, x.path, job, t)))))
    .when(!failed.length && Boolean(x.stages), (e) => e.child(v_flex().max_w(360).children(stageRows(t, x.stages ?? []))))
    .when(Boolean(x.mr?.unresolved?.length), (e) => e.child(v_flex().children(notes(t, x))))
    .child(actions(tab, t, x, item));
}

export function reviewStrip(tab, t, item, live) {
  const id = `rv-${item.id}`;
  return h_flex().id(id).flex_none().h(36).px(12).gap(10).items_center().rounded(10).border_1().border_color(shade(t.ansi3, "border")).bg(shade(t.ansi3, "subtle"))
    .tooltip(item.text.split("\n").slice(0, 8).join("\n"))
    .child(icon(ICONS.comment, 16, t.ansi3))
    .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().child(item.title))
    .child(div().flex_none().text_size(10.5).text_color(t.dim).child(ago(item.at)))
    .when(Boolean(item.sent), (e) => e.child(chip(t, item.auto ? "auto-sent" : "sent", t.ansi2, "tint", ICONS.check)))
    .when(!item.sent, (e) => e.child(primary(tab, t, item, live, id)))
    .when(Boolean(item.url), (e) => e.child(button(`${id}-open`, "", t, (_e, cx) => cx.open_url(item.url), { small: true, ghost: true, icon: "external-link", tooltip: "Open the MR" })))
    .child(button(`${id}-copy`, "", t, (_e, cx) => cx.write_to_clipboard(item.text), { small: true, ghost: true, icon: "copy", tooltip: "Copy the message" }))
    .child(button(`${id}-dismiss`, "", t, (_e, cx) => tab.dismiss(item, cx), { small: true, ghost: true, icon: ICONS.close, tooltip: "Dismiss" }));
}
