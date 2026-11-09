import { notify } from "herdr";
import { feedbackList, sendFeedback, reviveAndSend, saveFeedback, setAuto, autoOn } from "./ship-feedback.js";
import { sessionTiles } from "./ship-model.js";

const SELECT_TRIES = 40;
const SELECT_WAIT_MS = 250;
const SHOW_SENT_MS = 3_600_000;

export class ShipPanel {
  constructor(app) {
    this.app = app;
    this.opened = null; this.hovered = null;
    this.busy = new Set();
  }

  tracker() {
    return this.app.ship;
  }

  selectedId() {
    return this.app.sessionTab.session?.sessionId ?? null;
  }

  trackedSession() {
    const id = this.selectedId();
    return id ? this.tracker().tracked().sessions?.[id] ?? null : null;
  }

  tiles() {
    return sessionTiles(this.trackedSession(), this.tracker().remotes(), (path) => this.app.ci.get(path));
  }

  live() {
    return Boolean(this.trackedSession()?.live ?? this.app.sessionTab.session?.live);
  }

  feedback() {
    const now = Date.now();
    return feedbackList().filter((f) => !f.dismissed && !f.stale && (!f.sent || now - (f.sentAt ?? 0) < SHOW_SENT_MS));
  }

  reviews() {
    const id = this.selectedId();
    return this.feedback().filter((f) => f.kind === "review" && f.sessionId === id).slice(0, 3);
  }

  picked(sessionId, cx) {
    this.opened = null;
    if (sessionId && !this.tracker().tracked().sessions?.[sessionId]) this.tracker().tick(cx, true, true);
  }

  openTile(key, cx) {
    this.opened = this.opened === key ? null : key;
    cx.notify();
  }

  hover(key, on, cx) {
    if (!on || this.hovered === key) return;
    this.hovered = key;
    cx.notify();
  }

  toggleAuto(sessionId, cx) {
    if (sessionId) setAuto(sessionId, !autoOn(sessionId));
    cx.notify();
  }

  openCommit(repo, sha, cx) {
    if (!this.app.radar.repos.includes(repo)) {
      notify({ title: "Commit not in the Graph", body: `${repo} is not under ${this.app.radar.root}`, level: "warning", timeout: 4000 });
      return;
    }
    this.app.openGraphTab(repo, cx);
    cx.spawn(async (cx) => {
      for (let i = 0; i < SELECT_TRIES; i += 1) {
        const graph = this.app.graph;
        if (graph.path === repo && graph.commits.length && !graph.loading) { graph.selectHash(sha, cx); cx.notify(); return; }
        await cx.sleep(SELECT_WAIT_MS);
      }
    });
  }

  run(item, cx, work) {
    if (this.busy.has(item.id)) return;
    this.busy = new Set([...this.busy, item.id]);
    cx.spawn(async (cx) => {
      try {
        await work();
      } catch (e) {
        notify({ title: "Could not send the feedback", body: String(e.message ?? e), level: "error" });
      } finally {
        this.busy = new Set([...this.busy].filter((id) => id !== item.id));
        cx.notify();
      }
    });
    cx.notify();
  }

  send(item, cx) {
    this.run(item, cx, async () => {
      const result = await sendFeedback(item);
      if (!result.live) {
        saveFeedback({ ...item, notLive: true });
        notify({ title: `${item.label} is not live`, body: "Use Revive to resume the session with this message", level: "warning", timeout: 5000 });
      }
    });
  }

  revive(item, cx) {
    const session = this.tracker().tracked().sessions?.[item.sessionId] ?? null;
    this.run(item, cx, async () => reviveAndSend(item, session));
  }

  dismiss(item, cx) {
    saveFeedback({ ...item, dismissed: true });
    cx.notify();
  }

  escape(cx) {
    if (!this.opened) return false;
    this.openTile(this.opened, cx);
    return true;
  }
}
