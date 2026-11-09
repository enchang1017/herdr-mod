import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { REVIEW, marker, errorRow, note, spinner, lines, ago } from "./ui.js";
import { button, chip, card, cardHeader, icon, iconText, ICONS } from "./kit.js";
import { ciChips } from "./ci-view.js";
import { reviewingChips } from "./review.js";

function kinds(info, t) {
  const work = info.entries.length;
  return h_flex().gap(4).flex_1().min_w(0)
    .when(work > 0, (e) => e.child(marker("work", t, `${work}`)))
    .when(info.local > 0, (e) => e.child(marker("local", t, `${info.local}`)))
    .when(info.pushed > 0, (e) => e.child(marker("pushed", t, `${info.pushed}`)));
}

function repoLine(app, row, t, r) {
  const { path, info } = row;
  return h_flex().gap(8).items_center()
    .child(div().w(14).flex_none().flex().items_center().child(icon(r.icon, 13, r.tone(t))))
    .child(div().flex_shrink(1).min_w(0).truncate().font_bold().text_size(12.5).child(app.radar.name(path)))
    .child(div().flex_1().min_w(0).text_size(10.5).text_color(t.dim).when(Boolean(info?.branch), (e) => e.child(iconText(ICONS.branch, t.dim, info?.branch ?? ""))))
    .children(reviewingChips(path, t))
    .children(info?.upstream ? ciChips(t, app.ci.get(path)) : [])
    .child(div().flex_none().text_size(10.5).text_color(t.dim).child(ago(info?.changedAt)))
    .child(button(`graph-${path}`, "Graph", t, (_ev, cx) => app.openGraphTab(path, cx), { small: true, ghost: true, tooltip: "Commit graph" }));
}

function repoRow(app, row, i, t, selected) {
  const { path, info, error } = row;
  const state = info ? app.reviewOf(path, info) : "todo", r = REVIEW[state];
  return v_flex().id(`repo-${i}`).px(10).py(7).gap(4).cursor_pointer().border_l(2).border_color(selected ? t.accent : t.background)
    .when(selected, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
    .on_click((_ev, cx) => app.go({ name: "detail", path }, cx))
    .child(repoLine(app, row, t, r))
    .child(error
      ? div().pl(22).text_size(11).text_color(t.ansi1).child(`Scan failed: ${error}`)
      : h_flex().pl(22).gap(8).items_center()
        .child(kinds(info, t))
        .when(state === "changed", (e) => e.child(chip(t, r.label, r.tone(t), "outline")))
        .child(div().flex_none().text_size(10.5).text_color(t.dim).child(`${info.fileCount} ${info.fileCount === 1 ? "file" : "files"}`))
        .child(lines(t, info.add, info.del)));
}

function legend(t) {
  return h_flex().gap(4).px(10).py(6).flex_wrap().border_t(1).border_color(t.border).bg(t.surface)
    .child(marker("work", t, "uncommitted")).child(marker("local", t, "unpushed")).child(marker("pushed", t, "unmerged"))
    .child(div().flex_1())
    .child(iconText(REVIEW.reviewed.icon, REVIEW.reviewed.tone(t), "reviewed").text_size(10).text_color(REVIEW.reviewed.tone(t)))
    .child(iconText(REVIEW.todo.icon, REVIEW.todo.tone(t), "to review").text_size(10).text_color(REVIEW.todo.tone(t)));
}

function header(app, rows, t) {
  const toReview = rows.filter((r) => r.info && app.reviewOf(r.path, r.info) !== "reviewed").length + rows.filter((r) => !r.info).length;
  const p = app.radar.progress();
  const status = p.busy ? `scanning ${p.scanned}/${p.total}` : `${p.total} repos`;
  return v_flex().flex_none().bg(t.surface).border_b(1).border_color(t.border)
    .child(h_flex().h(36).px(12).gap(8).items_center()
      .child(icon(ICONS.radar, 14, t.accent))
      .child(div().font_bold().text_size(13).child("Change radar"))
      .when(p.total > 0, (e) => e.child(chip(t, `${toReview} to review`, toReview ? t.blocked : t.ansi2, toReview ? "tint" : "outline"))
        .child(chip(t, `${rows.length} changed`, t.muted, "outline")))
      .child(div().flex_1())
      .child(div().text_size(10.5).text_color(p.busy ? t.accent : t.dim).child(status))
      .child(button("refresh", "Refresh", t, (_ev, cx) => app.refresh(cx))))
    .child(div().px(12).pb(6).truncate().text_size(10.5).text_color(t.dim).child(`${app.radar.root ?? ""}${app.rootSource ? ` · ${app.rootSource}` : ""}`));
}

function problems(app, t) {
  const radar = app.radar;
  return [app.pin?.error && `Props: ${app.pin.error}`, app.pin?.warning && `Props: ${app.pin.warning}`, radar.discoverError, radar.warning && `Some folders were unreadable: ${radar.warning}`, radar.watchError, app.storeError, app.cache.error]
    .filter(Boolean).map((text, i) => errorRow(t, text, `problem-${i}`));
}

function repoCard(app, rows, t) {
  return card(t, "repos")
    .child(cardHeader(t, { icon: ICONS.repo, title: "Repos with changes", meta: `${rows.length}` }))
    .children(rows.map((r, i) => repoRow(app, r, i, t, i === app.selected)));
}

export function overview(app, t) {
  const rows = app.radar.listed(), p = app.radar.progress();
  const empty = !rows.length && !app.radar.discovering && p.total > 0 && !p.busy;
  return v_flex().size_full().min_h(0)
    .child(header(app, rows, t))
    .child(v_flex().id("overview-list").flex_1().min_h(0).overflow_y_scrollbar().p(8).gap(8)
      .children(problems(app, t))
      .when(app.radar.discovering && !p.total, (e) => e.child(spinner(t, "Finding git repos…")))
      .when(!app.radar.discovering && !p.total && !app.radar.discoverError && !app.pin?.error, (e) => e.child(note(t, "No git repos under this folder (depth 3)")))
      .when(empty, (e) => e.child(note(t, `All ${p.total} repos are clean: nothing to review`)))
      .when(rows.length > 0, (e) => e.child(repoCard(app, rows, t))))
    .child(legend(t));
}
