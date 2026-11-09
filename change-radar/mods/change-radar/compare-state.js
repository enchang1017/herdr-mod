import { notify } from "herdr";
import { checkRef, compareRange, compareWorktree, describeCommit, fileDiff, rangeDiffText } from "./ranges.js";
import { trimDiff, buildPrompt, cachedSummary, summarize, untrackedNote, DIFF_LIMIT } from "./summary.js";
import { diffRows } from "./diff-view.js";
import { reviewText, reviewTask } from "./review.js";
import { hash } from "./store.js";

export const WORKTREE = null;

const blank = (path, aRef, bRef, manual) => ({
  path, aRef, bRef, manual, a: null, b: null, loading: true, error: null, result: null,
  file: null, rows: [], diffLoading: false, diffError: null, tab: "diff", summary: null, collapsed: new Set(),
});

function checkSide(ref) {
  return ref === WORKTREE ? { ref: WORKTREE } : checkRef(String(ref));
}

export function isCompareClick(mods) {
  return Boolean(mods && (mods.platform || mods.shift));
}

export class RangeCompare {
  constructor(host) {
    this.host = host;
    this.state = null;
    this.picking = null;
    this.token = 0;
  }

  forget() {
    this.token += 1;
    this.state = null;
    this.picking = null;
  }

  clear(cx) {
    this.forget();
    cx.notify();
  }

  escape(cx) {
    if (this.picking) this.cancelPick(cx);
    else if (this.state) this.clear(cx);
    else return false;
    return true;
  }

  beginPick(base, cx) {
    this.picking = base;
    cx.notify();
  }

  cancelPick(cx) {
    this.picking = null;
    cx.notify();
  }

  partner(clicked, mods, selected, cx) {
    if (this.picking && clicked !== this.picking) {
      const base = this.picking;
      this.picking = null;
      this.start(this.host.path(), base, clicked, cx);
      return true;
    }
    if (isCompareClick(mods) && selected && clicked !== selected) {
      this.start(this.host.path(), selected, clicked, cx);
      return true;
    }
    return false;
  }

  start(path, aRef, bRef, cx, manual = false) {
    const a = checkSide(aRef), b = checkSide(bRef);
    if (a.error || b.error || a.ref === WORKTREE) {
      this.state = { ...blank(path, aRef, bRef, manual), loading: false, error: a.error ?? b.error ?? "A must be a commit: the working tree is always B" };
      cx.notify();
      return;
    }
    this.token += 1;
    this.picking = null;
    this.state = blank(path, a.ref, b.ref, manual);
    this.load(this.token, cx);
    cx.notify();
  }

  swap(cx) {
    const s = this.state;
    if (!s?.a || s.bRef === WORKTREE) return;
    this.start(s.path, s.b.hash, s.a.hash, cx, true);
  }

  rerun(cx) {
    const s = this.state;
    if (s) this.start(s.path, s.aRef, s.bRef, cx, s.manual);
  }

  async sides(s, on) {
    const a = await describeCommit(s.path, s.aRef, on);
    if (s.bRef === WORKTREE) return [a, null];
    const b = await describeCommit(s.path, s.bRef, on);
    return !s.manual && b.at < a.at ? [b, a] : [a, b];
  }

  load(token, cx) {
    const s = this.state, on = this.host.on();
    cx.spawn(async (cx) => {
      try {
        const [a, b] = await this.sides(s, on);
        const result = b ? await compareRange(s.path, a.hash, b.hash, on) : await compareWorktree(s.path, a.hash, on);
        if (token !== this.token) return;
        this.state = { ...this.state, a, b, result, loading: false };
        this.loadDiff(null, cx);
      } catch (e) {
        if (token === this.token) this.state = { ...this.state, loading: false, error: String(e.message ?? e) };
      }
      cx.notify();
    });
  }

  loadDiff(file, cx) {
    const s = this.state, token = this.token, on = this.host.on(), r = s.result;
    this.state = { ...s, file: file?.path ?? null, rows: [], diffLoading: true, diffError: null, tab: "diff" };
    const spec = file?.untracked ? { path: file.path, untracked: true } : { path: file?.path ?? null, from: r.fork, to: r.to };
    cx.spawn(async (cx) => {
      try {
        const lines = await fileDiff(s.path, spec, on);
        if (token === this.token && this.state.file === (file?.path ?? null)) this.state = { ...this.state, rows: diffRows(lines), diffLoading: false };
      } catch (e) {
        if (token === this.token) this.state = { ...this.state, diffLoading: false, diffError: `Could not load the diff: ${e.message ?? e}` };
      }
      cx.notify();
    });
    cx.notify();
  }

  pickFile(file, cx) {
    if (!this.state?.result) return;
    this.loadDiff(this.state.file === file.path ? null : file, cx);
  }

  toggleFolder(folder, cx) {
    const collapsed = new Set(this.state.collapsed);
    if (collapsed.has(folder)) collapsed.delete(folder);
    else collapsed.add(folder);
    this.state = { ...this.state, collapsed };
    cx.notify();
  }

  setTab(tab, cx) {
    this.state = { ...this.state, tab };
    cx.notify();
  }

  label() {
    const s = this.state;
    if (!s?.a) return "";
    return `${s.a.short}..${s.b ? s.b.short : "working tree"}`;
  }

  reviewRange() {
    const s = this.state;
    return s?.a && s.b ? `${s.a.short}..${s.b.short}` : null;
  }

  reviewTexts() {
    const range = this.reviewRange(), path = this.state?.path;
    return range ? { slash: reviewText(path, range), task: reviewTask(path, range) } : null;
  }

  review(cx) {
    const range = this.reviewRange();
    if (range && this.host.review) this.host.review(this.state.path, range, cx);
  }

  showReviewText() {
    const texts = this.reviewTexts();
    notify({ title: "Review range", body: texts ? `${texts.slash}\n${texts.task}` : "Review range needs two commits", level: "info", timeout: 8000 });
  }

  summarize(cx, force) {
    const s = this.state, token = this.token, on = this.host.on();
    if (!s?.result || s.summary?.loading) return;
    this.state = { ...s, tab: "ai", summary: { loading: true } };
    cx.spawn(async (cx) => {
      const summary = await this.runSummary(s, on, force).catch((e) => ({ error: String(e.message ?? e) }));
      if (token === this.token) this.state = { ...this.state, summary };
      cx.notify();
    });
    cx.notify();
  }

  async runSummary(s, on, force) {
    const r = s.result;
    const full = (await rangeDiffText(s.path, r.fork, r.to, on)) + (r.to ? "" : untrackedNote(r.files));
    const trimmed = trimDiff(full), key = hash(`v1|range|${full}`);
    if (!trimmed.text.trim()) throw new Error("Nothing to summarize: the range has no text diff");
    const meta = { truncated: trimmed.truncated, size: trimmed.size, limit: DIFF_LIMIT };
    const prompt = buildPrompt({ name: this.host.name(s.path), scope: `range ${this.label()}`, subjects: r.commits.map((c) => c.subject), files: r.files, diff: trimmed.text });
    if (!force) return { ...(await cachedSummary(this.host.cache, key, prompt)), ...meta };
    const value = await summarize(prompt);
    this.host.cache.put(key, value);
    return { value, cached: false, ...meta };
  }
}

export function compareCommand(cmp, path, arg, cx) {
  if (arg === "clear") cmp.clear(cx);
  else if (arg === "swap") cmp.swap(cx);
  else if (arg === "review-text") cmp.showReviewText();
  else if (arg === "summarize") cmp.summarize(cx, false);
  else {
    const at = arg.indexOf("-");
    if (at <= 0 || !path) { notify({ title: "Compare", body: `Use compare-<a>-<b> (b may be worktree), got ${arg}`, level: "warning" }); return; }
    const b = arg.slice(at + 1);
    cmp.start(path, arg.slice(0, at), b === "worktree" ? WORKTREE : b, cx);
  }
}
