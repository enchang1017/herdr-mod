import { watchFolder, window } from "herdr";
import { discover, resolveBase, scanRepo, worktreeHashes } from "./git.js";
import { fingerprint } from "./store.js";

const CONCURRENCY = 4;
const QUIET_MS = 700;
const MAX_WAIT_MS = 4000;
const SWEEP_MS = 300000;
const SWEEP_NO_WATCH_MS = 45000;
const REDISCOVER_MS = 600000;
const NOISE = new Set(["node_modules", "bin", "obj", ".vs", ".idea", "dist", ".nuxt", ".output", ".next", "TestResults"]);
const GIT_FILES = new Set(["HEAD", "index", "packed-refs", "FETCH_HEAD", "ORIG_HEAD", "MERGE_HEAD"]);

const base = (p) => p.replace(/\/+$/, "").split("/").pop();

export class Radar {
  constructor() {
    this.root = null; this.on = null; this.gen = 0;
    this.repos = []; this.info = {}; this.errors = {}; this.bases = {};
    this.queue = new Set(); this.scanning = new Set(); this.again = new Set(); this.dirty = new Map();
    this.reviewed = new Set(); this.discovering = false; this.discoverError = null; this.warning = null;
    this.watchError = null; this.watching = null; this.lastSweep = Date.now(); this.lastDiscover = 0;
  }

  setRoot(root, on, cx) {
    this.gen += 1;
    this.root = root; this.on = on;
    this.repos = []; this.info = {}; this.errors = {}; this.bases = {};
    this.queue = new Set(); this.again = new Set(); this.dirty = new Map();
    this.discoverError = null; this.warning = null; this.watchError = null; this.watching = null;
    this.discover(cx);
  }

  name(repo) {
    if (repo === this.root) return base(repo);
    return repo.startsWith(`${this.root}/`) ? repo.slice(this.root.length + 1) : base(repo);
  }

  discover(cx) {
    const gen = this.gen, root = this.root;
    this.discovering = true; this.lastDiscover = Date.now();
    cx.spawn(async (cx) => {
      try {
        const found = await discover(root, this.on);
        if (gen !== this.gen) return;
        const known = new Set(this.repos);
        this.repos = found.repos; this.warning = found.warning; this.discoverError = null;
        const kept = new Set(found.repos);
        this.info = Object.fromEntries(Object.entries(this.info).filter(([k]) => kept.has(k)));
        this.enqueue(found.repos.filter((r) => !known.has(r) || !this.info[r]), cx);
        this.watch(cx);
      } catch (e) {
        if (gen === this.gen) this.discoverError = String(e.message ?? e);
      } finally {
        if (gen === this.gen) this.discovering = false;
        cx.notify();
      }
    });
  }

  enqueue(paths, cx) {
    for (const p of paths) (this.scanning.has(p) ? this.again : this.queue).add(p);
    this.pump(cx);
  }

  pump(cx) {
    while (this.scanning.size < CONCURRENCY && this.queue.size) {
      const repo = this.queue.values().next().value;
      this.queue.delete(repo);
      this.scanning.add(repo);
      const gen = this.gen;
      cx.spawn(async (cx) => {
        try { await this.scanOne(repo, gen); }
        finally {
          this.scanning.delete(repo);
          if (this.again.delete(repo) && gen === this.gen) this.queue.add(repo);
          if (gen === this.gen) { this.pump(cx); cx.notify(); }
        }
      });
    }
  }

  async scanOne(repo, gen) {
    try {
      const on = this.on;
      const baseRef = repo in this.bases ? this.bases[repo] : await resolveBase(repo, on);
      const info = await scanRepo(repo, baseRef, on);
      const withPrint = this.reviewed.has(repo) ? await this.withFingerprint(repo, info) : info;
      if (gen !== this.gen) return;
      this.bases = { ...this.bases, [repo]: baseRef };
      this.info = { ...this.info, [repo]: { ...withPrint, path: repo, scannedAt: Date.now() } };
      this.errors = Object.fromEntries(Object.entries(this.errors).filter(([k]) => k !== repo));
    } catch (e) {
      if (gen === this.gen) this.errors = { ...this.errors, [repo]: String(e.message ?? e) };
    }
  }

  async withFingerprint(repo, info) {
    try {
      return { ...info, fingerprint: fingerprint(info, await worktreeHashes(repo, info.entries, this.on)), fingerprintError: null };
    } catch (e) {
      return { ...info, fingerprint: null, fingerprintError: String(e.message ?? e) };
    }
  }

  forgetBase(repo) {
    this.bases = Object.fromEntries(Object.entries(this.bases).filter(([k]) => k !== repo));
  }

  setReviewed(paths, cx) {
    const next = new Set(paths);
    const added = [...next].filter((p) => !this.reviewed.has(p) && this.info[p] && !this.info[p].fingerprint);
    this.reviewed = next;
    if (added.length) this.enqueue(added, cx);
  }

  watch(cx) {
    if (this.on || this.watching === this.root) return;
    const root = this.root, gen = this.gen;
    this.watching = root;
    cx.spawn(async (cx) => {
      try {
        while (gen === this.gen) {
          const paths = await watchFolder(root);
          if (gen === this.gen) this.onPaths(paths, cx);
        }
      } catch (e) {
        if (gen === this.gen) { this.watchError = `Live watch stopped (${e}); refreshing every ${SWEEP_NO_WATCH_MS / 1000}s instead`; this.watching = null; cx.notify(); }
      }
    });
  }

  owner(path) {
    let best = null;
    for (const r of this.repos) if ((path === r || path.startsWith(`${r}/`)) && (!best || r.length > best.length)) best = r;
    return best;
  }

  relevant(repo, path) {
    const rel = path.slice(repo.length + 1);
    if (rel.startsWith(".git/")) {
      const inner = rel.slice(5);
      return !inner.endsWith(".lock") && (GIT_FILES.has(inner) || inner.startsWith("refs/"));
    }
    return !rel.split("/").some((seg) => NOISE.has(seg));
  }

  onPaths(paths, cx) {
    const now = Date.now();
    let rediscover = false;
    for (const p of paths) {
      if (p === this.root || p === `${this.root}/`) { this.enqueue(this.repos, cx); rediscover = true; continue; }
      const repo = this.owner(p);
      if (!repo) { if (/\/\.git(\/|$)/.test(p)) rediscover = true; continue; }
      if (!this.relevant(repo, p)) continue;
      const seen = this.dirty.get(repo);
      this.dirty = new Map(this.dirty).set(repo, { first: seen?.first ?? now, last: now });
    }
    if (rediscover && now - this.lastDiscover > 5000) this.discover(cx);
  }

  tick(cx) {
    const now = Date.now();
    if (this.dirty.size) {
      const due = [...this.dirty].filter(([, d]) => now - d.last >= QUIET_MS || now - d.first >= MAX_WAIT_MS).map(([r]) => r);
      if (due.length) {
        this.dirty = new Map([...this.dirty].filter(([r]) => !due.includes(r)));
        this.enqueue(due, cx);
      }
    }
    if (!this.root || !window().active) return;
    const every = this.watching ? SWEEP_MS : SWEEP_NO_WATCH_MS;
    if (now - this.lastSweep > every) { this.lastSweep = now; this.enqueue(this.repos, cx); }
    if (now - this.lastDiscover > REDISCOVER_MS && !this.discovering) this.discover(cx);
  }

  refreshAll(cx) {
    this.lastSweep = Date.now();
    this.bases = {};
    this.discover(cx);
    this.enqueue(this.repos, cx);
  }

  listed() {
    return this.repos.map((r) => ({ path: r, info: this.info[r], error: this.errors[r] }))
      .filter((r) => r.error || (r.info && (r.info.fileCount > 0 || r.info.local > 0 || r.info.pushed > 0)))
      .sort((a, b) => (b.info?.changedAt ?? Number.MAX_SAFE_INTEGER) - (a.info?.changedAt ?? Number.MAX_SAFE_INTEGER));
  }

  progress() {
    return { total: this.repos.length, scanned: this.repos.filter((r) => this.info[r] || this.errors[r]).length, busy: this.scanning.size + this.queue.size };
  }
}
