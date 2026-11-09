import { walkInput } from "./walk-input.js";
import { cachedPlan, generatePlan } from "./walk-run.js";
import { diffRows } from "./diff-view.js";

function hunkGroups(rows) {
  return rows.reduce((groups, row) => (row.kind === "@" ? [...groups, [row]] : groups.length ? [...groups.slice(0, -1), [...groups[groups.length - 1], row]] : [[row]]), []);
}

export function stepRows(file, hunks, full) {
  const rows = diffRows((file.raw ?? file.note ?? "").split("\n"));
  if (full || !hunks.length) return rows;
  const wanted = new Set(hunks);
  const groups = hunkGroups(rows);
  const offset = groups.length && groups[0][0].kind !== "@" ? 1 : 0;
  return groups.filter((_g, i) => wanted.has(i + 1 - offset)).flat();
}

export class Walkthrough {
  constructor(app) {
    this.app = app;
    this.token = 0;
    this.reset();
  }

  reset() {
    this.active = false; this.scope = null; this.loading = false; this.error = null; this.steps = []; this.files = new Map();
    this.step = 0; this.done = new Set(); this.fileCursor = 0; this.full = false; this.cached = false; this.makeSources = null;
  }

  start(scope, makeSources, cx, force = false) {
    if (this.loading) return;
    const token = ++this.token;
    this.reset();
    this.active = true; this.scope = scope; this.makeSources = makeSources; this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const input = await walkInput(await makeSources(), scope.on ?? null);
        if (token !== this.token) return;
        const hit = force ? null : await cachedPlan(input.key);
        const plan = hit ?? (await generatePlan(input, this.app.owner, cx));
        if (token !== this.token) return;
        this.files = new Map(input.files.map((f) => [`${f.repo}\0${f.path}`, f]));
        this.steps = plan.steps; this.cached = Boolean(hit || plan.cached); this.generatedAt = plan.at ?? null;
      } catch (e) {
        if (token === this.token) this.error = String(e.message ?? e);
      } finally {
        if (token === this.token) this.loading = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  regenerate(cx) {
    if (this.scope && this.makeSources) this.start(this.scope, this.makeSources, cx, true);
  }

  close(cx) {
    this.token += 1;
    this.reset();
    this.app.handle.focus();
    cx.notify();
  }

  current() {
    return this.steps[this.step] ?? null;
  }

  stepFiles(step = this.current()) {
    return (step?.files ?? []).map((f) => ({ ...f, file: this.files.get(f.key) })).filter((f) => f.file);
  }

  goStep(index, cx) {
    if (index < 0 || index >= this.steps.length || index === this.step) return;
    this.done = new Set([...this.done, this.step]);
    this.step = index; this.fileCursor = 0; this.full = false;
    cx.notify();
  }

  moveFile(delta, cx) {
    const count = this.stepFiles().length;
    if (!count) return;
    this.fileCursor = Math.min(count - 1, Math.max(0, this.fileCursor + delta));
    this.full = false;
    cx.notify();
  }

  pickFile(index, cx) {
    if (index === this.fileCursor) this.full = !this.full;
    else { this.fileCursor = index; this.full = false; }
    cx.notify();
  }

  rows() {
    const one = this.stepFiles()[this.fileCursor];
    return one ? stepRows(one.file, one.hunks, this.full) : [];
  }

  key(key, cx) {
    if (!this.active) return false;
    if (key === "escape") this.close(cx);
    else if (key === "n" || key === "right") this.goStep(this.step + 1, cx);
    else if (key === "p" || key === "left") this.goStep(this.step - 1, cx);
    else if (key === "j" || key === "down") this.moveFile(1, cx);
    else if (key === "k" || key === "up") this.moveFile(-1, cx);
    else if (key === "enter") { this.full = !this.full; cx.notify(); }
    else return false;
    return true;
  }
}
