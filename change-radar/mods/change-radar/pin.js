import { exec } from "herdr";
import { checkRef } from "./ranges.js";

const VIEWS = new Set(["radar", "detail", "graph", "compare"]);

function readRange(value) {
  if (value === undefined || value === null) return { range: null };
  if (typeof value !== "string") return { error: "range must be a string like main..HEAD" };
  const [from, to, extra] = value.trim().split(/\.\.\.?/);
  if (extra !== undefined || to === undefined) return { error: `range must look like a..b: ${value}` };
  const a = checkRef(from), b = checkRef(to || "HEAD");
  if (a.error || b.error) return { error: `Bad range ${value}: ${a.error ?? b.error}` };
  return { range: { from: a.ref, to: b.ref } };
}

export function readPin(p) {
  if (!p || p.repo === undefined || p.role === "graph") return null;
  const repo = typeof p.repo === "string" ? p.repo.trim().replace(/\/+$/, "") : "";
  const view = VIEWS.has(p.view) ? p.view : "radar";
  const range = readRange(p.range);
  const warnings = [
    p.view !== undefined && !VIEWS.has(p.view) && `Unknown view ${JSON.stringify(p.view)} ignored: use radar, detail, graph or compare`,
    range.error && `${range.error} (ignored)`,
  ].filter(Boolean);
  const error = repo.startsWith("/") ? null : `repo must be an absolute path, got ${JSON.stringify(p.repo)}`;
  return { repo, view: range.range && view === "radar" ? "compare" : view, range: range.range ?? null, error, warning: warnings.join(". ") || null, ready: false, applied: false };
}

export async function checkPin(pin) {
  if (pin.error) return pin;
  try {
    const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: pin.repo });
    if (r.code !== 0) return { ...pin, error: `${pin.repo} is not a git repository` };
    return { ...pin, repo: r.stdout.trim() || pin.repo, ready: true };
  } catch (e) {
    return { ...pin, error: `${pin.repo} is not a git repository (${e.message ?? e})` };
  }
}

export function pinnedRoot(pin) {
  if (!pin) return null;
  if (pin.error) return { root: null, on: null, source: "props: invalid repo" };
  if (!pin.ready) return { root: null, on: null, source: "props: checking repo" };
  return { root: pin.repo, on: null, source: "pinned by props" };
}

export function applyPin(app, cx) {
  const pin = app.pin;
  if (!pin?.ready || pin.applied || !app.radar.info[pin.repo]) return;
  app.pin = { ...pin, applied: true };
  if (pin.view === "graph") {
    app.graphTab.repo = pin.repo;
    app.graph.show(pin.repo, cx);
  } else if (pin.view === "detail") {
    app.go({ name: "detail", path: pin.repo }, cx);
  } else if (pin.view === "compare") {
    app.go({ name: "compare", path: pin.repo }, cx);
    if (pin.range) app.compare.preset(pin.range.from, pin.range.to, cx);
  }
  cx.notify();
}
