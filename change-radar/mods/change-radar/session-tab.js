import { InputState } from "gpui-base";
import { props, closeOverlay, shared, setShared } from "herdr";
import { listSessions, scanSession, focusedSession } from "./session-data.js";
import { loadRepo, fileSpec } from "./session-git.js";
import { summarizeRepo, sendSessionReview, reportError } from "./session-actions.js";
import { fileDiff } from "./ranges.js";
import { diffRows } from "./diff-view.js";
import { workspaceRootPath } from "./settings.js";
import { sessionView } from "./session-view.js";

export const GROUPS = ["DB", "SERVICE", "UI", "TESTS", "OTHER"];
const CONCURRENCY = 4;
const PICK_KEY = "change-radar.ship-ui";

function savedSessionId() {
  const value = shared(PICK_KEY);
  return value && typeof value === "object" && typeof value.sessionId === "string" ? value.sessionId : null;
}

function saveSessionId(sessionId) {
  if (sessionId && savedSessionId() !== sessionId) setShared(PICK_KEY, { sessionId });
}

export class SessionTab {
  constructor(app) {
    this.app = app;
    this.started = false; this.session = null; this.sessions = []; this.sessionsError = null; this.sessionsWarning = null; this.dismissedAt = 0;
    this.picking = false; this.filter = ""; this.pickCursor = 0;
    this.token = 0; this.clear();
    this.input = InputState.new({ placeholder: "filter sessions" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.pickCursor = 0; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.pickCursorSession(cx));
    this.input.on("focus", () => { app.typing = true; });
    this.input.on("blur", () => { app.typing = false; });
  }

  clear() {
    this.scan = null; this.repos = {}; this.repoErrors = {}; this.error = null; this.scanning = false;
    this.expanded = new Set(); this.summaries = {}; this.cursor = null; this.closeFile();
  }

  ensure(cx, wanted = null) {
    if (this.started && !wanted) return;
    this.started = true;
    cx.spawn(async (cx) => {
      const focusedOne = wanted ? null : await focusedSession().catch(() => null);
      const id = wanted ?? focusedOne?.sessionId ?? savedSessionId();
      await this.loadSessions(cx);
      const known = this.sessions.find((s) => s.sessionId === id) ?? this.app.ship.tracked().sessions?.[id ?? ""];
      if (id && id === this.session?.sessionId) this.app.shipPanel.picked(id, cx);
      else if (id) this.select(known ?? { sessionId: id, name: focusedOne?.name ?? null, cwd: focusedOne?.cwd ?? null }, cx);
      else if (!this.session) { this.picking = true; this.error = "The focused terminal is not running Claude: pick a session"; }
      cx.notify();
    });
  }

  show(sessionId, cx) {
    this.ensure(cx, sessionId || null);
    this.app.ship.tick(cx, true, !this.app.ship.tracked().at);
    cx.notify();
  }

  async loadSessions(cx) {
    try {
      const found = await listSessions();
      this.sessions = found.sessions;
      this.sessionsWarning = found.warning;
      this.session = this.sessions.find((s) => s.sessionId === this.session?.sessionId) ?? this.session;
      this.sessionsError = null;
    } catch (e) {
      this.sessionsError = `Could not list Claude sessions: ${e.message ?? e}`;
    }
    cx.notify();
  }

  select(session, cx) {
    this.session = session; this.picking = false;
    saveSessionId(session.sessionId);
    this.app.shipPanel.picked(session.sessionId, cx);
    this.app.handle.focus();
    this.refresh(cx);
  }

  refreshAll(cx) {
    this.refresh(cx);
    this.app.ship.refresh(cx);
  }

  refresh(cx) {
    if (!this.session) return;
    const token = ++this.token, keep = this.expanded;
    this.clear(); this.expanded = keep; this.scanning = true;
    cx.spawn(async (cx) => {
      try {
        const scan = await scanSession(this.session.sessionId);
        if (token !== this.token) return;
        this.scan = scan;
        cx.notify();
        await this.loadRepos(scan.repos, token, cx);
      } catch (e) {
        if (token === this.token) this.error = `Could not read the session: ${e.message ?? e}`;
      } finally {
        if (token === this.token) this.scanning = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  async loadRepos(list, token, cx) {
    const queue = [...list];
    const worker = async () => {
      for (let one = queue.shift(); one; one = queue.shift()) {
        try {
          const repo = await loadRepo(one);
          if (token === this.token) this.repos = { ...this.repos, [one.repo]: repo };
        } catch (e) {
          if (token === this.token) this.repoErrors = { ...this.repoErrors, [one.repo]: String(e.message ?? e) };
        }
        cx.notify();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }

  name(repo) {
    const root = workspaceRootPath();
    return repo.startsWith(`${root}/`) ? repo.slice(root.length + 1) : repo.split("/").pop();
  }

  grouped() {
    const list = (this.scan?.repos ?? []).map((one) => this.repos[one.repo] ?? { ...one, pending: !this.repoErrors[one.repo], loadError: this.repoErrors[one.repo] });
    return GROUPS.map((group) => ({ group, repos: list.filter((r) => r.group === group).sort((a, b) => this.name(a.repo).localeCompare(this.name(b.repo))) }))
      .filter((g) => g.repos.length);
  }

  loaded() {
    return this.grouped().flatMap((g) => g.repos).filter((r) => r.files);
  }

  totals() {
    const list = this.loaded();
    return { repos: (this.scan?.repos ?? []).length, files: list.reduce((n, r) => n + r.files.length, 0), add: list.reduce((n, r) => n + r.add, 0), del: list.reduce((n, r) => n + r.del, 0) };
  }

  flat() {
    return this.grouped().flatMap((g) => g.repos).flatMap((r) => [{ repo: r }, ...(this.expanded.has(r.repo) && r.files ? [...r.files, ...(r.others ?? [])].map((file) => ({ repo: r, file })) : [])]);
  }

  toggle(repo, cx) {
    const next = new Set(this.expanded);
    if (next.has(repo)) next.delete(repo); else next.add(repo);
    this.expanded = next;
    cx.notify();
  }

  closeFile() {
    this.open = null; this.rows = []; this.diffError = null; this.diffLoading = false; this.diffNote = null;
  }

  pick(repo, file, cx) {
    if (this.open?.repo === repo.repo && this.open.path === file.path) { this.closeFile(); cx.notify(); return; }
    const spec = fileSpec(repo, file), token = this.token;
    this.closeFile();
    this.open = { repo: repo.repo, path: file.path, state: file.state };
    if (!spec) { this.diffNote = "No diff now: the edits were reverted, or committed outside this session"; cx.notify(); return; }
    this.diffLoading = true;
    cx.spawn(async (cx) => {
      try {
        const lines = await fileDiff(repo.repo, spec, null);
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

  summarize(cx, only = null) {
    const targets = this.loaded().filter((r) => r.files.length && (!only || r.repo === only || this.name(r.repo) === only));
    const token = this.token;
    this.summaries = { ...this.summaries, ...Object.fromEntries(targets.map((r) => [r.repo, { loading: true }])) };
    cx.spawn(async (cx) => {
      for (const repo of targets) {
        const value = await summarizeRepo(repo, this.name(repo.repo), this.app.cache).catch((e) => ({ error: String(e.message ?? e) }));
        if (token === this.token) this.summaries = { ...this.summaries, [repo.repo]: value };
        cx.notify();
      }
    });
    cx.notify();
  }

  review(cx) {
    const repos = this.loaded().filter((r) => r.files.length || r.commitList.length);
    if (this.app.sending || !repos.length || !this.session) return;
    this.app.sending = true;
    cx.spawn(async (cx) => {
      try {
        await sendSessionReview(this.app, this.session, repos, cx);
      } catch (e) {
        reportError("Could not start the review", e);
      } finally {
        this.app.sending = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  dismissPicker(cx) {
    if (!this.picking) return;
    this.dismissedAt = Date.now();
    this.togglePicker(cx);
  }

  togglePicker(cx) {
    if (!this.picking && Date.now() - this.dismissedAt < 300) return;
    this.picking = !this.picking;
    if (this.picking) { this.pickCursor = 0; this.loadSessions(cx); this.input.focus(); } else this.app.handle.focus();
    cx.notify();
  }

  matches() {
    const words = this.filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.sessions.filter((s) => words.every((w) => [s.label, s.title, s.command, s.space, s.tab, s.cwd, s.sessionId].join(" ").toLowerCase().includes(w)));
  }

  pickCursorSession(cx) {
    const one = this.matches()[this.pickCursor];
    if (one) this.select(one, cx);
  }

  move(step, cx) {
    const count = this.picking ? this.matches().length : this.flat().length;
    if (!count) return;
    const at = this.picking ? this.pickCursor : this.cursor ?? -1;
    const next = Math.min(count - 1, Math.max(0, at + step));
    if (this.picking) this.pickCursor = next; else this.cursor = next;
    cx.notify();
  }

  openCursor(cx) {
    if (this.picking) { this.pickCursorSession(cx); return; }
    const row = this.flat()[this.cursor ?? 0];
    if (row?.file) this.pick(row.repo, row.file, cx);
    else if (row) this.toggle(row.repo.repo, cx);
  }

  escape(cx) {
    if (this.picking) this.togglePicker(cx);
    else if (this.open) { this.closeFile(); cx.notify(); }
    else if (this.app.shipPanel.escape(cx)) return true;
    else if (props()?.overlay) closeOverlay(props().overlay);
    else return false;
    return true;
  }

  key(key, typing, cx) {
    if (typing && !this.picking) return false;
    if (key === "escape") return this.escape(cx);
    if (key === "down" || (!typing && key === "j")) this.move(1, cx);
    else if (key === "up" || (!typing && key === "k")) this.move(-1, cx);
    else if (typing) return false;
    else if (key === "enter") this.openCursor(cx);
    else if (key === "r") this.refreshAll(cx);
    else if (key === "s") this.summarize(cx);
    else if (key === "p") this.togglePicker(cx);
    else return false;
    return true;
  }

  command(name, cx) {
    const arg = name.replace(/^session-?/, "");
    if (!arg) this.ensure(cx);
    else if (arg === "refresh") this.refreshAll(cx);
    else if (arg === "summarize") this.summarize(cx);
    else if (arg.startsWith("summarize-")) this.summarize(cx, arg.slice(10));
    else if (arg === "pick") this.togglePicker(cx);
    else if (arg.startsWith("open-")) this.toggle(this.loaded().find((r) => this.name(r.repo) === arg.slice(5))?.repo ?? "", cx);
    else this.ensure(cx, arg);
  }

  render(t, width, cx) {
    if (!this.started) this.ensure(cx);
    return sessionView(this, t, width);
  }
}
