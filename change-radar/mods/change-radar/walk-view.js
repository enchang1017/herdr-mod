import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { button, chip, icon, shade, ICONS } from "./kit.js";
import { errorRow, spinner, note, lines, monoFont, ago } from "./ui.js";
import { diffView, diffWidth, diffText } from "./diff-view.js";

const LIST_PX = 250;

const uniqueRepos = (files) => [...new Set(files.map((f) => f.file.repo))];

function progress(walk, t) {
  return h_flex().gap(3).items_center().children(walk.steps.map((_s, i) => div().w(14).h(4).rounded(2)
    .bg(i === walk.step ? t.accent : walk.done.has(i) ? shade(t.ansi2, "strong") : t.border)));
}

function headerBar(walk, t) {
  const total = walk.steps.length;
  return h_flex().h(36).flex_none().px(10).gap(8).items_center().bg(t.surface).border_b(1).border_color(t.border)
    .child(icon(ICONS.steps, 13, t.accent))
    .child(div().flex_none().font_bold().text_size(13).child("Walkthrough"))
    .child(div().flex_shrink(1).min_w(0).truncate().text_size(11).text_color(t.muted).child(walk.scope?.label ?? ""))
    .when(total > 0, (e) => e.child(chip(t, `step ${walk.step + 1}/${total}`, t.accent, "outline")).child(progress(walk, t)))
    .child(div().flex_1())
    .when(walk.cached && total > 0, (e) => e.child(div().flex_none().text_size(10).text_color(t.dim).child(`cached${walk.generatedAt ? ` ${ago(walk.generatedAt)}` : ""}`)))
    .child(button("walk-prev", "\u{2190} p", t, (_e, cx) => walk.goStep(walk.step - 1, cx), { small: true, disabled: walk.step <= 0 || !total }))
    .child(button("walk-next", "n \u{2192}", t, (_e, cx) => walk.goStep(walk.step + 1, cx), { small: true, disabled: walk.step >= total - 1 }))
    .child(button("walk-regen", walk.loading ? "Working\u{2026}" : "Regenerate", t, (_e, cx) => walk.regenerate(cx), { small: true, disabled: walk.loading, tooltip: "Ask claude sonnet again for a new plan (spends quota)" }))
    .child(button("walk-close", "", t, (_e, cx) => walk.close(cx), { icon: ICONS.close, small: true, ghost: true, tooltip: "Close the walkthrough (esc)" }));
}

function stepRow(walk, step, i, t) {
  const files = walk.stepFiles(step), on = i === walk.step, done = walk.done.has(i);
  return v_flex().id(`walk-step-${i}`).flex_none().px(8).py(6).gap(4).cursor_pointer().border_l(2)
    .border_color(on ? t.accent : t.background).when(on, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => walk.goStep(i, cx))
    .child(h_flex().gap(6).items_center()
      .child(div().w(18).flex_none().text_size(11).font_bold().text_color(done ? t.ansi2 : on ? t.accent : t.dim).child(done ? icon(ICONS.check, 12, t.ansi2) : String(i + 1)))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).font_semibold().text_color(on || !done ? t.foreground : t.muted).child(step.title)))
    .child(h_flex().pl(24).gap(4).flex_wrap()
      .children(uniqueRepos(files).slice(0, 3).map((repo) => chip(t, repo, t.muted, "outline")))
      .child(div().text_size(10).text_color(t.dim).child(`${files.length} file${files.length === 1 ? "" : "s"}`)));
}

function stepList(walk, t) {
  return v_flex().id("walk-steps").w(LIST_PX).h_full().flex_none().overflow_y_scrollbar().py(4).border_r(1).border_color(t.border)
    .children(walk.steps.map((step, i) => stepRow(walk, step, i, t)));
}

function explain(step, t) {
  return v_flex().flex_none().gap(6).px(12).py(10).border_b(1).border_color(t.border)
    .child(div().font_bold().text_size(13).child(step.title))
    .when(Boolean(step.why), (e) => e.child(div().text_size(11.5).text_color(t.foreground).child(step.why)))
    .children(step.risks.map((r, i) => h_flex().id(`walk-risk-${i}`).gap(6).items_start().text_size(11).text_color(t.ansi3)
      .child(icon(ICONS.warning, 13, t.ansi3)).child(div().flex_1().min_w(0).child(r))));
}

function fileLine(walk, one, i, t) {
  const on = i === walk.fileCursor, f = one.file;
  const scope = one.hunks.length ? `hunks ${one.hunks.join(", ")} of ${f.hunks}` : f.note ? f.note : "whole file";
  return h_flex().id(`walk-file-${i}`).h(24).flex_none().px(10).gap(8).items_center().cursor_pointer().text_size(11)
    .border_l(2).border_color(on ? t.accent : t.background).when(on, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => walk.pickFile(i, cx))
    .tooltip(on ? "Click or Enter: toggle the full file diff" : "Show this file")
    .child(icon(ICONS.file, 13, t.dim))
    .child(div().flex_none().text_color(t.dim).child(f.repo))
    .child(div().flex_1().min_w(0).truncate().font_family(monoFont()).child(f.path))
    .child(div().flex_none().text_size(10).text_color(t.dim).child(on && walk.full ? "full diff" : scope))
    .child(lines(t, f.add, f.del));
}

function diffArea(walk, t) {
  const rows = walk.rows();
  return v_flex().flex_1().min_h(0)
    .child(h_flex().h(26).flex_none().px(10).gap(8).items_center().bg(t.surface).border_y(1).border_color(t.border)
      .child(div().flex_1().min_w(0).text_size(10.5).text_color(t.dim).child(walk.full ? "Full file diff (enter: back to this step's hunks)" : "This step's hunks (enter: full file diff)"))
      .child(button("walk-copy", "Copy", t, (_e, cx) => cx.write_to_clipboard(diffText(rows)), { small: true, disabled: !rows.length })))
    .child(rows.length ? diffView("walk-diff", rows, t, diffWidth(rows)) : note(t, "No diff to show for this file"));
}

function stepPane(walk, t) {
  const step = walk.current(), files = walk.stepFiles();
  return v_flex().flex_1().min_w(0).h_full()
    .child(explain(step, t))
    .child(v_flex().id("walk-files").flex_none().max_h(150).overflow_y_scrollbar().py(2).children(files.map((one, i) => fileLine(walk, one, i, t))))
    .child(diffArea(walk, t));
}

function waiting(walk, t) {
  return v_flex().p(10).gap(8)
    .child(spinner(t, "Building the walkthrough with claude sonnet (runs in the background, usually 30 to 120 s)\u{2026}"))
    .child(note(t, "Keys: n/p or \u{2190}/\u{2192} steps, j/k files, enter full diff, esc close."));
}

export function walkView(walk, t) {
  const ready = !walk.loading && !walk.error && walk.steps.length > 0;
  return v_flex().flex_1().min_h(0)
    .child(headerBar(walk, t))
    .when(walk.loading, (e) => e.child(waiting(walk, t)))
    .when(Boolean(walk.error), (e) => e.child(div().p(10).child(errorRow(t, `Walkthrough failed: ${walk.error}`, "walk-error", (_e, cx) => walk.regenerate(cx)))))
    .when(!walk.loading && !walk.error && !walk.steps.length, (e) => e.child(note(t, "The plan has no steps")))
    .when(ready, (e) => e.child(h_flex().flex_1().min_h(0).items_start().child(stepList(walk, t)).child(stepPane(walk, t))));
}
