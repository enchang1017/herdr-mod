import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { loadDetail, fileDiff, worktreeDiffText, untrackedDiff } from "./ranges.js";
import { trimDiff, buildPrompt, cachedSummary, summarize, untrackedNote, DIFF_LIMIT } from "./summary.js";
import { hash } from "./store.js";
import { shortRef } from "./git.js";
import { KINDS, button, reviewChip, errorRow, note, spinner, summaryBox, fileRow, commitRow } from "./ui.js";
import { diffRows, diffView, diffWidth, diffText } from "./diff-view.js";
import { card, cardHeader, chip, tabs, targetField, icon, shade, ICONS } from "./kit.js";
import { targetHint } from "./target.js";
import { reviewingChips } from "./review.js";
import { walkRepo } from "./extras.js";
import { reviewCommand } from "./settings.js";

const UNTRACKED_FOR_MODEL = 10;

export class Detail {
  constructor(app) {
    this.app = app;
    this.reset(null);
  }

  reset(path) {
    this.path = path; this.token = (this.token ?? 0) + 1;
    this.data = null; this.error = null; this.loading = false; this.loadedScan = null;
    this.open = null; this.rows = []; this.diffError = null; this.diffLoading = false;
    this.summary = null; this.summaryKey = null; this.cursor = null;
  }

  show(path, cx) {
    this.reset(path);
    this.reload(cx, true);
  }

  info() {
    return this.app.radar.info[this.path] ?? null;
  }

  reload(cx, withSummary) {
    const info = this.info(), token = this.token, path = this.path, on = this.app.radar.on;
    if (!info) { this.error = this.app.radar.errors[path] ?? "This repo has not been scanned yet"; return; }
    this.loading = true; this.loadedScan = info.scannedAt;
    cx.spawn(async (cx) => {
      try {
        const data = await loadDetail(path, info, on);
        if (token !== this.token) return;
        this.data = data; this.error = null;
        if (this.open && !this.groupFiles(this.open.kind).some((f) => f.path === this.open.path)) this.closeFile();
        if (withSummary) this.summarize(cx, false);
      } catch (e) {
        if (token === this.token) this.error = `Could not load changes: ${e.message ?? e}`;
      } finally {
        if (token === this.token) this.loading = false;
        cx.notify();
      }
    });
  }

  groupFiles(kind) {
    if (!this.data) return [];
    return kind === "work" ? this.data.work : this.data[kind]?.files ?? [];
  }

  flat() {
    return ["work", "local", "pushed"].flatMap((kind) => this.groupFiles(kind).slice(0, 300).map((file) => ({ kind, file })));
  }

  move(step, cx) {
    const list = this.flat();
    if (!list.length) return;
    this.cursor = Math.min(list.length - 1, Math.max(0, (this.cursor ?? -1) + step));
    cx.notify();
  }

  openCursor(cx) {
    const item = this.flat()[this.cursor ?? 0];
    if (item) this.pick(item.kind, item.file, cx);
  }

  closeFile() {
    this.open = null; this.rows = []; this.diffError = null;
  }

  pick(kind, file, cx) {
    if (this.open?.kind === kind && this.open.path === file.path) { this.closeFile(); cx.notify(); return; }
    const group = this.data[kind], token = this.token;
    const spec = kind === "work" ? { path: file.path, untracked: file.untracked, head: Boolean(this.info()?.oid) } : { path: file.path, from: group.from, to: group.to };
    this.open = { kind, path: file.path }; this.rows = []; this.diffError = null; this.diffLoading = true;
    cx.spawn(async (cx) => {
      try {
        const lines = await fileDiff(this.path, spec, this.app.radar.on);
        if (token === this.token && this.open?.path === file.path) this.rows = diffRows(lines);
      } catch (e) {
        if (token === this.token) this.diffError = `Could not load diff: ${e.message ?? e}`;
      } finally {
        if (token === this.token) this.diffLoading = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  async untrackedSections(files, on) {
    const sections = [];
    for (const f of files.filter((x) => x.untracked).slice(0, UNTRACKED_FOR_MODEL)) {
      const lines = await untrackedDiff(this.path, f.path, on);
      sections.push(`diff --git a/${f.path} b/${f.path}\nnew file (untracked)\n${lines.slice(0, 200).join("\n")}\n`);
    }
    return sections.join("");
  }

  async summaryInput(info, data) {
    const on = this.app.radar.on;
    const full = (await worktreeDiffText(this.path, info, on)) + (await this.untrackedSections(data.work, on));
    const trimmed = trimDiff(full);
    const rest = data.work.filter((f) => f.untracked).slice(UNTRACKED_FOR_MODEL);
    const files = [...new Map([...data.work, ...(data.local?.files ?? []), ...(data.pushed?.files ?? [])].map((f) => [f.path, f])).values()];
    const subjects = [...(data.local?.commits ?? []), ...(data.pushed?.commits ?? [])].map((c) => c.subject);
    const scope = info.base ? `everything on this branch not in ${shortRef(info.base)}, plus uncommitted work` : "uncommitted work and unpushed commits";
    const prompt = buildPrompt({ name: this.app.radar.name(this.path), scope, subjects, files, diff: trimmed.text + untrackedNote(rest) });
    return { key: hash(`v1|repo|${full}`), prompt, trimmed };
  }

  summarize(cx, force) {
    const info = this.info(), data = this.data, token = this.token;
    if (!info || !data) return;
    this.summary = { loading: true };
    cx.spawn(async (cx) => {
      try {
        const input = await this.summaryInput(info, data);
        if (token !== this.token) return;
        const meta = { truncated: input.trimmed.truncated, size: input.trimmed.size, limit: DIFF_LIMIT };
        if (!input.trimmed.text.trim()) { this.summary = { error: "Nothing to summarize: the diff is empty or only lock/secret files" }; return; }
        this.summary = { loading: true, ...meta };
        cx.notify();
        const result = force ? { value: await summarize(input.prompt), cached: false } : await cachedSummary(this.app.cache, input.key, input.prompt);
        if (force) this.app.cache.put(input.key, result.value);
        if (token === this.token) { this.summary = { ...result, ...meta }; this.summaryKey = input.key; }
      } catch (e) {
        if (token === this.token) this.summary = { error: String(e.message ?? e) };
      } finally {
        cx.notify();
      }
    });
    cx.notify();
  }

  render(t, cx) {
    const info = this.info();
    if (info && !this.loading && this.loadedScan !== info.scannedAt && this.data) this.reload(cx, false);
    const open = Boolean(this.open);
    return v_flex().size_full().min_h(0)
      .child(this.header(t, info))
      .child(v_flex().id("detail-body").flex_1().min_h(0).overflow_y_scrollbar().p(8).gap(8)
        .when(this.loading && !this.data, (e) => e.child(spinner(t, "Loading changes…")))
        .when(Boolean(this.error), (e) => e.child(errorRow(t, this.error, "detail", (_ev, cx) => this.reload(cx, true))))
        .when(Boolean(this.summary), (e) => e.child(summaryBox(t, this.summary, (_ev, cx) => this.summarize(cx, true))))
        .when(Boolean(this.data), (e) => e.children(["work", "local", "pushed"].map((k) => this.group(k, t)).filter(Boolean))))
      .when(open, (e) => e.child(this.diffPane(t)));
  }

  titleRow(t, info) {
    const app = this.app, state = info ? app.reviewOf(this.path, info) : "todo";
    return h_flex().gap(8).items_center()
      .child(button("back", "Back", t, (_ev, cx) => app.go({ name: "overview" }, cx), { tooltip: "Back (esc)" }))
      .child(icon(ICONS.repo, 13, t.accent))
      .child(div().flex_shrink(1).min_w(0).truncate().font_bold().text_size(13).child(app.radar.name(this.path)))
      .when(Boolean(info?.branch), (e) => e.child(chip(t, info.branch, t.muted, "outline", ICONS.branch)))
      .child(div().flex_1())
      .children(reviewingChips(this.path, t))
      .child(reviewChip(state, t));
  }

  metaRow(t, info) {
    return h_flex().gap(8).items_center().text_size(10.5).text_color(t.dim)
      .when(Boolean(info?.base), (e) => e.child(div().child(`base ${shortRef(info.base)}`)))
      .when(Boolean(info?.upstream), (e) => e.child(div().child(`\u{2191}${info.ahead} \u{2193}${info.behind} ${info.upstream}`)))
      .child(div().flex_1())
      .when(Boolean(this.summary && !this.summary.loading && !this.summary.error), (e) => e.child(button("resummarize", "Regenerate summary", t, (_ev, cx) => this.summarize(cx, true), { small: true, ghost: true })));
  }

  toolbar(t, info) {
    const app = this.app, path = this.path, reviewed = info && app.reviewOf(path, info) === "reviewed";
    return h_flex().gap(6).items_center().flex_wrap()
      .child(button("review", app.sending ? "Starting…" : "Review", t, (_ev, cx) => app.sendReview(path, cx), { primary: true, disabled: app.sending, tooltip: reviewTip(app) }))
      .child(targetField(t, "review-target", app.targetInput, app.targetInput.value().trim() ? targetHint(app.targetInput.value()) : ""))
      .child(button("walk", app.walk.loading ? "Walking\u{2026}" : "Walkthrough", t, (_ev, cx) => walkRepo(app, path, this.data, cx), { disabled: !this.data || app.walk.loading, tooltip: "Step-by-step plan of this repo's diff in dependency order (claude sonnet, cached by the diff; runs only when you click)" }))
      .child(button("mark", reviewed ? "Unmark" : "Mark reviewed", t, (_ev, cx) => app.toggleReviewed(path, cx), { disabled: !info }))
      .child(button("fetch", app.fetching.has(path) ? "Fetching…" : "Fetch", t, (_ev, cx) => app.fetch(path, cx), { disabled: app.fetching.has(path) }));
  }

  header(t, info) {
    return v_flex().flex_none().gap(8).px(10).py(8).bg(t.surface).border_b(1).border_color(t.border)
      .child(this.titleRow(t, info))
      .child(this.metaRow(t, info))
      .when(Boolean(info?.fingerprintError), (e) => e.child(errorRow(t, `Review fingerprint failed: ${info.fingerprintError}`, "fp")))
      .child(viewTabs(this.app, this.path, "detail", t))
      .child(this.toolbar(t, info));
  }

  group(kind, t) {
    const files = this.groupFiles(kind), g = kind === "work" ? null : this.data[kind];
    if (!files.length && !g?.commits?.length) return null;
    const k = KINDS[kind];
    const count = kind === "work" ? `${files.length} files` : `${g.commits.length} commits · ${files.length} files`;
    return card(t, `group-${kind}`).border_color(shade(k.tone(t), "border"))
      .child(cardHeader(t, { icon: k.icon, color: k.tone(t), title: k.label, meta: count }))
      .child(v_flex().py(2)
        .when(Boolean(g), (e) => e.children(g.commits.slice(0, 8).map((c, i) => commitRow(`c-${kind}-${i}`, c, t))))
        .when(Boolean(g && g.commits.length > 8), (e) => e.child(note(t, `${g.commits.length - 8} more commits (open Compare for the full range)`)))
        .when(Boolean(g && g.commits.length && files.length), (e) => e.child(div().h(1).mx(10).my(2).bg(t.border)))
        .children(files.slice(0, 300).map((f, i) => fileRow(`f-${kind}-${i}`, f, t, this.isMarked(kind, f), (_ev, cx) => this.pick(kind, f, cx))))
        .when(files.length > 300, (e) => e.child(note(t, `${files.length - 300} more files not listed`))));
  }

  isMarked(kind, f) {
    const at = this.flat()[this.cursor ?? -1];
    return (this.open?.kind === kind && this.open.path === f.path) || (at?.kind === kind && at.file.path === f.path);
  }

  diffPane(t) {
    const k = KINDS[this.open.kind];
    return v_flex().flex_1().min_h(0).border_t(1).border_color(t.border)
      .child(h_flex().h(30).flex_none().px(10).gap(8).items_center().text_size(11).bg(t.surface).border_b(1).border_color(t.border)
        .child(icon(ICONS.diff, 13, k.tone(t)))
        .child(div().flex_1().min_w(0).truncate().font_semibold().child(this.open.path))
        .child(chip(t, k.label, k.tone(t)))
        .child(button("copy-diff", "Copy", t, (_ev, cx) => cx.write_to_clipboard(diffText(this.rows)), { small: true, disabled: this.diffLoading || !this.rows.length, tooltip: "Copy the diff" }))
        .child(button("close-diff", "", t, (_ev, cx) => { this.closeFile(); cx.notify(); }, { icon: ICONS.close, ghost: true, small: true, tooltip: "Close diff" })))
      .when(this.diffLoading, (e) => e.child(spinner(t, "Loading diff…")))
      .when(Boolean(this.diffError), (e) => e.child(errorRow(t, this.diffError, "diff")))
      .when(!this.diffLoading && !this.diffError, (e) => e.child(diffView("detail-diff", this.rows, t, diffWidth(this.rows))));
  }
}

function reviewTip(app) {
  return app.targetInput.value().trim() ? `Send ${reviewCommand()} to the named agent` : "Start a reviewer agent in this space's team tab (name an agent to send to it instead)";
}

export function viewTabs(app, path, current, t) {
  const items = [["detail", "Changes"], ["compare", "Compare"]];
  return tabs(t, "view-tabs", items, current, (key, _ev, cx) => app.go({ name: key, path }, cx));
}
