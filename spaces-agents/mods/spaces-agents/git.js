import { exec, machines, watchFolder, window } from "herdr";
import { base, where } from "./util.js";

const FALLBACK = 60000;
const MAX_KEYS = 100;
const STATUS_ARGS = ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"];

const placeOf = (key) => JSON.parse(key);

function parseStatus(stdout, info) {
  return stdout.split("\n").reduce((acc, line) => {
    if (line.startsWith("# branch.head ")) return { ...acc, branch: line.slice(14) };
    if (!line.startsWith("# branch.ab ")) return acc;
    const [a, b] = line.slice(12).split(" ");
    return { ...acc, ahead: Math.abs(parseInt(a, 10)) || 0, behind: Math.abs(parseInt(b, 10)) || 0 };
  }, info);
}

export class GitTracker {
  constructor() {
    this.git = {};
    this.checked = {};
    this.unsure = new Set();
    this.pending = new Set();
    this.busy = {};
    this.ready = {};
    this.at = {};
    this.watching = new Set();
    this.refreshing = false;
  }

  info(key) {
    return this.git[key] ?? null;
  }

  known(key) {
    return key in this.git;
  }

  moved(sp, ps) {
    const at = Object.fromEntries(sp.map((s) => [s.id, where(s, ps)]));
    const keys = new Set(Object.values(at).filter((k) => placeOf(k)[1]));
    const fresh = [...keys].filter((k) => !(k in this.git));
    const shifted = Object.entries(at).filter(([id, k]) => this.at[id] && this.at[id] !== k && keys.has(k)).map(([, k]) => k);
    this.at = at;
    this.prune(keys);
    return { at, keys, due: [...fresh, ...shifted] };
  }

  prune(keys) {
    if (Object.keys(this.git).length <= MAX_KEYS) return;
    const keep = (map) => Object.fromEntries(Object.entries(map).filter(([k]) => keys.has(k)));
    this.git = keep(this.git);
    this.checked = keep(this.checked);
  }

  finished(sp, ps, at, keys) {
    const spaceOf = Object.fromEntries(sp.flatMap((s) => (s.tabs ?? []).map((t) => [t.id, s])));
    const live = ps.filter((p) => p.terminal && spaceOf[p.tab]);
    const busy = Object.fromEntries(live.map((p) => [p.pane, p.status === "working" || !(p.program?.shell || p.program?.agent)]));
    const ended = live.filter((p) => this.busy[p.pane] && !busy[p.pane]).flatMap((p) => this.sameRepo(at[spaceOf[p.tab].id], keys));
    this.busy = busy;
    return ended;
  }

  returned(keys) {
    const back = machines().filter((m) => m.layout === "ready" && this.ready[m.name] === false).map((m) => m.name);
    this.ready = { ...this.ready, ...Object.fromEntries(machines().map((m) => [m.name, m.layout === "ready"])) };
    return [...keys].filter((k) => back.includes(placeOf(k)[0]));
  }

  stale(now, keys, folded) {
    if (!window().active) return [];
    return [...keys].filter((k) => (this.git[k] || this.unsure.has(k)) && !folded.has(placeOf(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK);
  }

  due(now, sp, ps, folded) {
    const { at, keys, due } = this.moved(sp, ps);
    return new Set([...due, ...this.finished(sp, ps, at, keys), ...this.returned(keys), ...this.stale(now, keys, folded)]);
  }

  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refresh(keys, cx) {
    this.pending = new Set([...this.pending, ...keys]);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const batch = [...this.pending];
        this.pending = new Set();
        for (const key of batch) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      this.watching = new Set([...this.watching].filter((repo) => used.has(repo)));
      this.refreshing = false;
      cx.notify();
    });
  }

  remember(key, value) {
    this.git = { ...this.git, [key]: value };
  }

  async check(key, cx) {
    const [on, cwd] = placeOf(key);
    this.checked = { ...this.checked, [key]: Date.now() };
    this.unsure = new Set([...this.unsure].filter((k) => k !== key));
    try {
      const r = await exec("git", STATUS_ARGS, { cwd, on });
      if (r.code !== 0) {
        if (!/not a git repository/i.test(r.stderr)) this.unsure = new Set([...this.unsure, key]);
        this.remember(key, null);
        return;
      }
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const repo = common.stdout.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const start = { name, branch: null, ahead: 0, behind: 0, repo: JSON.stringify([on, repo]), linked: repo !== `${top.stdout.trim()}/.git` };
      this.remember(key, parseStatus(r.stdout, start));
      if (!on) this.watch(repo, cx);
    } catch {
      if (!(key in this.git)) this.remember(key, null);
      this.unsure = new Set([...this.unsure, key]);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching = new Set([...this.watching, repo]);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refresh(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch {
        this.watching = new Set([...this.watching].filter((r) => r !== repo));
      }
    });
  }
}
