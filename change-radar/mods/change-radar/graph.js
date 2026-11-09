import { shared, setShared, openOverlay, notify } from "herdr";
import { loadPage, remoteNames, currentBranch, commitInfo, commitDiffLines, commitDiffText } from "./graph-data.js";
import { layoutLanes } from "./graph-lanes.js";
import { diffRows } from "./diff-view.js";
import { trimDiff, buildPrompt, cachedSummary, summarize, EXPLAIN_SYSTEM, DIFF_LIMIT } from "./summary.js";
import { hash } from "./store.js";
import { fetchRepo } from "./git.js";
import { RangeCompare } from "./compare-state.js";

const FILTERS_KEY = "change-radar.graphFilters";
const DEFAULT_FILTERS = { scope: "all", remotes: true };
const EXPLAIN_POINTS = 5;

function savedFilters(path) {
  const all = shared(FILTERS_KEY);
  const one = all && typeof all === "object" ? all[path] : null;
  return one ? { scope: one.scope === "current" ? "current" : "all", remotes: one.remotes !== false } : DEFAULT_FILTERS;
}

export class Graph {
  constructor(host) {
    this.host = host;
    this.path = null;
    this.compare = new RangeCompare({ on: host.on, name: host.name, cache: host.cache, path: () => this.path, review: host.review });
    this.reset(null);
  }

  reset(path) {
    this.path = path; this.token = (this.token ?? 0) + 1;
    this.filters = path ? savedFilters(path) : DEFAULT_FILTERS;
    this.commits = []; this.layout = { rows: [], width: 1 }; this.hasMore = false; this.loading = false; this.error = null;
    this.remotes = []; this.branch = ""; this.selected = null; this.cursor = null; this.detail = null; this.fetching = false;
    this.pressMods = null;
    this.compare.forget();
  }

  show(path, cx) {
    if (path === this.path && this.commits.length) return;
    this.reset(path);
    this.reload(cx);
  }

  setFilters(patch, cx) {
    this.filters = { ...this.filters, ...patch };
    const all = shared(FILTERS_KEY);
    const next = { ...(all && typeof all === "object" ? all : {}), [this.path]: this.filters };
    if (JSON.stringify(all) !== JSON.stringify(next)) setShared(FILTERS_KEY, next);
    this.reload(cx);
  }

  reload(cx) {
    this.token += 1;
    this.commits = []; this.layout = { rows: [], width: 1 }; this.selected = null; this.cursor = null; this.detail = null;
    this.loadMore(cx);
  }

  loadMore(cx) {
    if (this.loading) return;
    const token = this.token, path = this.path, on = this.host.on();
    this.loading = true; this.error = null;
    cx.spawn(async (cx) => {
      try {
        if (!this.remotes.length) this.remotes = await remoteNames(path, on);
        this.branch = await currentBranch(path, on);
        const page = await loadPage(path, this.filters, this.commits.length, this.remotes, on);
        if (token !== this.token) return;
        this.commits = [...this.commits, ...page.commits];
        this.layout = layoutLanes(this.commits);
        this.hasMore = page.hasMore;
      } catch (e) {
        if (token === this.token) this.error = `Could not read the history: ${e.message ?? e}`;
      } finally {
        if (token === this.token) this.loading = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  fetch(cx) {
    if (this.fetching) return;
    this.fetching = true;
    cx.spawn(async (cx) => {
      try {
        await fetchRepo(this.path, this.host.on());
        this.reload(cx);
      } catch (e) {
        notify({ title: "Fetch failed", body: String(e.message ?? e), level: "error" });
      } finally {
        this.fetching = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  expand() {
    this.windowId = openOverlay({ mod: "change-radar", kind: "window", key: "change-radar-graph", width: 0.85, height: 0.85, props: { role: "graph", path: this.path, on: this.host.on() } });
  }

  move(step, cx) {
    if (!this.commits.length) return;
    this.cursor = Math.min(this.commits.length - 1, Math.max(0, (this.cursor ?? this.selected ?? -1) + step));
    cx.notify();
  }

  openCursor(cx) {
    if (this.cursor !== null) this.select(this.cursor, cx);
  }

  selectHash(target, cx) {
    const at = this.commits.findIndex((c) => c.hash === target || c.hash.startsWith(target));
    if (at >= 0) this.select(at, cx);
    else notify({ title: "Commit not loaded", body: `${target.slice(0, 8)} is further down: press Load more`, level: "info", timeout: 3000 });
  }

  clickHash(key, cx) {
    const mods = this.pressMods;
    this.pressMods = null;
    const selected = this.commits[this.selected]?.hash ?? null;
    if (!this.compare.partner(key, mods, selected, cx)) this.selectHash(key, cx);
  }

  beginPick(cx) {
    if (this.detail) this.compare.beginPick(this.detail.commit.hash, cx);
  }

  compareWith(ref, cx) {
    if (this.detail) this.compare.start(this.path, this.detail.commit.hash, ref, cx);
  }

  compareKey(cx) {
    const selected = this.commits[this.selected], cursor = this.commits[this.cursor];
    if (selected && cursor && cursor.hash !== selected.hash) this.compare.start(this.path, selected.hash, cursor.hash, cx);
    else if (selected) this.compare.beginPick(selected.hash, cx);
    else if (cursor) { this.select(this.cursor, cx); this.compare.beginPick(cursor.hash, cx); }
  }

  escape(cx) {
    if (this.compare.escape(cx)) return true;
    if (!this.detail) return false;
    this.closeDetail(cx);
    return true;
  }

  select(index, cx) {
    const commit = this.commits[index];
    if (!commit) return;
    this.selected = index; this.cursor = index;
    this.detail = { commit, info: null, loading: true, error: null, file: null, rows: [], diffLoading: true, diffError: null, tab: "diff", explain: null, collapsed: new Set() };
    this.loadInfo(commit, cx);
    this.loadDiff(commit, null, cx);
    cx.notify();
  }

  closeDetail(cx) {
    this.detail = null;
    cx.notify();
  }

  loadInfo(commit, cx) {
    const path = this.path, on = this.host.on();
    cx.spawn(async (cx) => {
      try {
        const info = await commitInfo(path, commit, on);
        if (this.detail?.commit.hash === commit.hash) this.detail = { ...this.detail, info, loading: false };
      } catch (e) {
        if (this.detail?.commit.hash === commit.hash) this.detail = { ...this.detail, loading: false, error: `Could not read the commit: ${e.message ?? e}` };
      }
      cx.notify();
    });
  }

  loadDiff(commit, file, cx) {
    const path = this.path, on = this.host.on();
    this.detail = { ...this.detail, file, rows: [], diffLoading: true, diffError: null, tab: "diff" };
    cx.spawn(async (cx) => {
      try {
        const lines = await commitDiffLines(path, commit, file, on);
        if (this.detail?.commit.hash === commit.hash && this.detail.file === file) this.detail = { ...this.detail, rows: diffRows(lines), diffLoading: false };
      } catch (e) {
        if (this.detail?.commit.hash === commit.hash) this.detail = { ...this.detail, diffLoading: false, diffError: `Could not load the diff: ${e.message ?? e}` };
      }
      cx.notify();
    });
    cx.notify();
  }

  pickFile(file, cx) {
    if (!this.detail) return;
    this.loadDiff(this.detail.commit, this.detail.file === file ? null : file, cx);
  }

  toggleFolder(folder, cx) {
    const collapsed = new Set(this.detail.collapsed);
    if (collapsed.has(folder)) collapsed.delete(folder);
    else collapsed.add(folder);
    this.detail = { ...this.detail, collapsed };
    cx.notify();
  }

  setTab(tab, cx) {
    this.detail = { ...this.detail, tab };
    cx.notify();
  }

  explain(cx, force) {
    const detail = this.detail;
    if (!detail?.info || detail.explain?.loading) return;
    const commit = detail.commit, info = detail.info, path = this.path, on = this.host.on();
    this.detail = { ...detail, tab: "ai", explain: { loading: true } };
    cx.spawn(async (cx) => {
      const result = await this.runExplain(path, commit, info, on, force).catch((e) => ({ error: String(e.message ?? e) }));
      if (this.detail?.commit.hash === commit.hash) this.detail = { ...this.detail, explain: result };
      cx.notify();
    });
    cx.notify();
  }

  async runExplain(path, commit, info, on, force) {
    const trimmed = trimDiff(await commitDiffText(path, commit, on));
    if (!trimmed.text.trim() && !info.message) return { error: "Nothing to explain: empty commit" };
    const prompt = buildPrompt({ name: this.host.name(path), scope: `commit ${commit.hash}\nMessage:\n${info.message}`, subjects: [], files: info.files, diff: trimmed.text });
    const key = hash(`v1|commit|${commit.hash}`);
    const meta = { truncated: trimmed.truncated, size: trimmed.size, limit: DIFF_LIMIT };
    if (force) {
      const value = await summarize(prompt, EXPLAIN_SYSTEM, EXPLAIN_POINTS);
      this.host.cache.put(key, value);
      return { value, cached: false, ...meta };
    }
    return { ...(await cachedSummary(this.host.cache, key, prompt, EXPLAIN_SYSTEM, EXPLAIN_POINTS)), ...meta };
  }
}
