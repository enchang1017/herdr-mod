import { setShared, shared } from "herdr";
import { claim, readShared } from "./lease.js";
import { discover, branchesOf } from "./ship-scan.js";
import { probeSessions } from "./ship-probe.js";
import { commitPipeline, branchMr, problemOf } from "./ship-glab.js";
import { isPipelineActive } from "./ci.js";
import { observePipeline, observeMr } from "./ship-observe.js";
import { queuedAuto, autoSendOne, saveFeedback } from "./ship-feedback.js";

const TRACKED_KEY = "change-radar.ship-tracked";
const REMOTE_KEY = "change-radar.ship-remote";
const SIDEBAR_KEY = "change-radar.ship";
const LEASE_KEY = "change-radar.ship-lease";
const LEASE_MS = 45_000;
const TICK_MS = 5000;
const RUNNING_MS = 30_000;
const OPEN_MR_MS = 120_000;
const NO_MR_MS = 600_000;
const NO_MR_WINDOW_MS = 6 * 3_600_000;
const PIPELINE_WAIT_MS = 900_000;
const ERROR_MS = 300_000;
const BLOCKED_MS = 600_000;
const DISCOVER_SHOWN_MS = 60_000;
const DISCOVER_HIDDEN_MS = 180_000;
const FULL_DISCOVER_MS = 600_000;
const AUTO_MS = 15_000;
const CONCURRENCY = 2;
const SHARE_MS = 600_000;

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const withoutAt = ({ at, ...rest }) => rest;

function pipelineDue(item, entry, now) {
  const age = now - entry.fetchedAt;
  if (entry.error) return age >= ERROR_MS;
  if (!entry.data) return now - item.commit.at < PIPELINE_WAIT_MS && age >= RUNNING_MS;
  return isPipelineActive(entry.data) && age >= RUNNING_MS;
}

function mrDue(item, entry, now) {
  const age = now - entry.fetchedAt;
  if (entry.error) return age >= ERROR_MS;
  if (!entry.data) return now - item.commit.at < NO_MR_WINDOW_MS && age >= NO_MR_MS;
  return entry.data.state === "opened" && age >= OPEN_MR_MS;
}

function repoItems(s, r) {
  const ctx = { sessionId: s.sessionId, label: s.label, path: r.repo, repo: r.name };
  const pipelines = r.commits.filter((c) => c.state === "pushed").map((c) => ({ key: `p|${r.repo}|${c.sha}`, kind: "p", ...ctx, branch: c.branch, commit: c }));
  const mrs = branchesOf(r).map((b) => ({ key: `m|${r.repo}|${b.branch}`, kind: "m", ...ctx, branch: b.branch, commit: b.head }));
  return [...pipelines, ...mrs];
}

export function shipItems(tracked) {
  const all = Object.values(tracked.sessions ?? {}).flatMap((s) => (s.repos ?? []).flatMap((r) => repoItems(s, r)));
  return [...new Map(all.reverse().map((item) => [item.key, item])).values()].reverse();
}

function sidebarValue(tracked, remote) {
  const entries = Object.values(tracked.sessions ?? {}).map((s) => {
    const heads = (s.repos ?? []).flatMap((r) => [...new Set(r.commits.filter((c) => c.state === "pushed").map((c) => c.branch))]
      .map((b) => r.commits.find((c) => c.state === "pushed" && c.branch === b)).map((c) => remote[`p|${r.repo}|${c.sha}`]?.data?.status));
    const failed = heads.filter((x) => x === "failed").length, running = heads.filter((x) => isPipelineActive({ status: x })).length;
    return [s.sessionId, failed ? { state: "failed", count: failed, running } : running ? { state: "running", count: running, failed: 0 } : null];
  });
  return Object.fromEntries(entries.filter(([, v]) => v));
}

export class ShipTracker {
  constructor(app) {
    this.app = app;
    this.lastTick = 0; this.lastAuto = 0; this.running = new Set(); this.discovering = false;
    this.blockedUntil = 0; this.blocked = null; this.forceAll = false; this.leader = false; this.error = null;
    this.discoveredAt = 0; this.checked = {};
    this.probedAt = 0; this.probeKey = null; this.scans = {};
  }

  tracked() {
    const stored = readShared(TRACKED_KEY);
    return this.discoveredAt > (stored.at ?? 0) ? { ...stored, at: this.discoveredAt } : stored;
  }

  remote(key) {
    const entry = readShared(REMOTE_KEY)[key] ?? null;
    const checked = this.checked[key] ?? 0;
    return entry && checked > entry.fetchedAt ? { ...entry, fetchedAt: checked } : entry;
  }

  remotes() {
    return readShared(REMOTE_KEY);
  }

  tick(cx, shown, force = false) {
    const now = Date.now();
    if (!force && now - this.lastTick < TICK_MS) return;
    this.lastTick = now;
    this.leader = claim(LEASE_KEY, "poll", this.app.owner, LEASE_MS, now);
    if (!this.leader) return;
    const tracked = this.tracked();
    const last = Math.max(tracked.at ?? 0, this.probedAt);
    if (!this.discovering && (force || now - last >= (shown ? DISCOVER_SHOWN_MS : DISCOVER_HIDDEN_MS))) this.discover(cx, force);
    if (force) { this.blockedUntil = 0; this.blocked = null; }
    if (now >= this.blockedUntil) this.poll(tracked, now, cx);
    if (now - this.lastAuto >= AUTO_MS) this.autoSend(cx);
  }

  refresh(cx) {
    this.forceAll = true;
    this.tick(cx, true, true);
    cx.notify();
  }

  extraSessions() {
    const current = this.app.sessionTab?.session;
    return current?.sessionId ? [{ sessionId: current.sessionId, cwd: current.cwd ?? "" }] : [];
  }

  async unchanged(extra, force) {
    const probe = await probeSessions(extra).catch(() => ({ key: null, sigs: {} }));
    this.probedAt = Date.now();
    const same = !force && probe.key !== null && probe.key === this.probeKey && this.probedAt - this.discoveredAt < FULL_DISCOVER_MS;
    return { same, probe };
  }

  discover(cx, force = false) {
    this.discovering = true;
    const extra = this.extraSessions();
    cx.spawn(async (cx) => {
      let skipped = false;
      try {
        const { same, probe } = await this.unchanged(extra, force);
        skipped = same;
        if (same) return;
        const { tracked: found, scans } = await discover(extra.map((e) => e.sessionId), { sigs: probe.sigs, scans: this.scans });
        this.probeKey = probe.key;
        this.scans = scans;
        this.discoveredAt = found.at;
        const stored = readShared(TRACKED_KEY);
        if (found.at - (stored.at ?? 0) >= SHARE_MS || !sameJson(withoutAt(stored), withoutAt(found))) setShared(TRACKED_KEY, found);
        this.pruneRemote(found);
        this.publishSidebar();
        this.error = null;
      } catch (e) {
        this.error = `Could not scan Claude sessions: ${e.message ?? e}`;
      } finally {
        this.discovering = false;
        if (!skipped) cx.notify();
      }
    });
  }

  pruneRemote(found) {
    const keys = new Set(shipItems(found).map((i) => i.key));
    const remote = readShared(REMOTE_KEY);
    const kept = Object.fromEntries(Object.entries(remote).filter(([k]) => keys.has(k)));
    this.checked = Object.fromEntries(Object.entries(this.checked).filter(([k]) => keys.has(k)));
    if (Object.keys(kept).length !== Object.keys(remote).length) setShared(REMOTE_KEY, kept);
  }

  due(item, now) {
    if (this.running.has(item.key)) return false;
    const entry = this.remote(item.key);
    if (!entry || this.forceAll) return true;
    return item.kind === "p" ? pipelineDue(item, entry, now) : mrDue(item, entry, now);
  }

  poll(tracked, now, cx) {
    const due = shipItems(tracked).filter((item) => this.due(item, now));
    this.forceAll = false;
    due.slice(0, Math.max(0, CONCURRENCY - this.running.size)).forEach((item) => this.fetch(item, cx));
  }

  fetch(item, cx) {
    this.running = new Set([...this.running, item.key]);
    cx.spawn(async (cx) => {
      try {
        await this.load(item);
      } finally {
        this.running = new Set([...this.running].filter((k) => k !== item.key));
        cx.notify();
      }
    });
  }

  async load(item) {
    const previous = this.remote(item.key);
    let entry;
    try {
      const data = item.kind === "p" ? await commitPipeline(item.path, item.commit.sha) : await branchMr(item.path, item.branch);
      entry = { data, fetchedAt: Date.now(), error: null };
    } catch (e) {
      const problem = problemOf(e);
      if (problem.blocking) { this.blocked = problem; this.blockedUntil = Date.now() + BLOCKED_MS; }
      entry = { data: previous?.data ?? null, fetchedAt: Date.now(), error: problem.text };
    }
    this.share(item.key, entry);
    if (entry.error) return;
    if (item.kind === "p") await observePipeline(item, entry.data);
    else await observeMr(item, entry.data);
  }

  share(key, entry) {
    const stored = readShared(REMOTE_KEY)[key];
    this.checked = { ...this.checked, [key]: entry.fetchedAt };
    if (stored && entry.fetchedAt - stored.fetchedAt < SHARE_MS && stored.error === entry.error && sameJson(stored.data, entry.data)) return;
    setShared(REMOTE_KEY, { ...readShared(REMOTE_KEY), [key]: entry });
    this.publishSidebar();
  }

  publishSidebar() {
    const value = sidebarValue(this.tracked(), readShared(REMOTE_KEY));
    if (JSON.stringify(shared(SIDEBAR_KEY) ?? {}) !== JSON.stringify(value)) setShared(SIDEBAR_KEY, value);
  }

  autoSend(cx) {
    this.lastAuto = Date.now();
    const queued = queuedAuto();
    if (!queued.length || this.sendingAuto) return;
    this.sendingAuto = true;
    cx.spawn(async (cx) => {
      try {
        for (const item of queued) await autoSendOne(item).catch((e) => saveFeedback({ ...item, sendError: String(e.message ?? e) }));
      } finally {
        this.sendingAuto = false;
        cx.notify();
      }
    });
  }
}
