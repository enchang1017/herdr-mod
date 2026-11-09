import { theme, settings } from "herdr";
import { EditorState } from "gpui-base";
import {
  parseTable, hasNamespaceColumn, readContexts, defaultNamespace, currentScope,
  parseNamespaces, detailArgv, firstLine, errorText, shortContext, isProdContext, ALL_NAMESPACES,
} from "./kubectl.js";
import { listResources, listNamespaces, detailText } from "./source.js";
import { buildTriage, detailPrompt, askAgent as deliverAsk } from "./ask.js";
import { lokiExploreUrl } from "./grafana.js";
import { dockBeside } from "./dock.js";
import { MAX_ROWS } from "./table.js";

const NAMESPACE_TTL_MS = 5 * 60_000;
const DETAIL_LIMIT = 400_000;

const sameScope = (a, b) => a.context === b.context && a.namespace === b.namespace && a.resource === b.resource;

export async function ensureScope(panel) {
  if (panel.state.scope.context) return;
  const found = await currentScope();
  if (found.error) {
    panel.set({ listing: { header: "", rows: [], fetchedAt: Date.now(), error: `No current kube context: ${found.error}` } });
    return;
  }
  panel.set({ scope: { ...panel.state.scope, context: found.context, namespace: found.namespace } });
}

const POLL_MS = 15_000;
const BACKOFF_MS = [5_000, 15_000, 30_000];

export function pollDue(panel, now) {
  const { listing, failures } = panel.state;
  const wait = failures > 0 ? BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1] : POLL_MS;
  return now - (listing.attemptAt ?? 0) >= wait;
}

function nextListing(previous, ran, scope, now) {
  if (ran.ok) {
    return { ...parseTable(ran.stdout, hasNamespaceColumn(scope)), fetchedAt: now, attemptAt: now, error: null, stale: false, notice: firstLine(ran.stderr), via: ran.via };
  }
  const error = firstLine(ran.error) || ran.error;
  return previous.header ? { ...previous, attemptAt: now, error, stale: true, via: ran.via } : { header: "", rows: [], fetchedAt: 0, attemptAt: now, error, stale: false, via: ran.via };
}

export function reloadList(panel, cx, isUser = true) {
  const scope = panel.state.scope;
  if (!scope.context) return;
  const token = (panel.listToken ?? 0) + 1;
  panel.listToken = token;
  panel.set({ loadingList: true, listing: { ...panel.state.listing, attemptAt: Date.now() } });
  cx.notify();
  cx.spawn(async (cx) => {
    const ran = await listResources(panel.proxies, cx, scope, isUser);
    if (token !== panel.listToken || !sameScope(scope, panel.state.scope)) return;
    const listing = nextListing(panel.state.listing, ran, scope, Date.now());
    const keepSelection = listing.rows.some((row) => row.id === panel.state.selected);
    panel.set({ listing, loadingList: false, failures: ran.ok ? 0 : panel.state.failures + 1, selected: keepSelection ? panel.state.selected : null });
    panel.persist();
    panel.afterList?.(cx);
    cx.notify();
  });
}

export function changeScope(panel, patch, cx) {
  releaseCode(panel);
  panel.set({ scope: { ...panel.state.scope, ...patch }, picker: null, selected: null, detail: null, drawer: null, write: null, message: "", confirm: null, failures: 0,
    listing: { header: "", rows: [], fetchedAt: 0, attemptAt: 0, error: null, stale: false } });
  panel.persist();
  reloadList(panel, cx, true);
}

export function askAllNamespaces(panel, cx) {
  const { scope, confirm } = panel.state;
  if (confirm || scope.namespace === ALL_NAMESPACES) return;
  if (isProdContext(scope.context)) {
    panel.set({ confirm: { kind: "all-namespaces", context: scope.context } });
    cx.notify();
    return;
  }
  changeScope(panel, { namespace: ALL_NAMESPACES }, cx);
}

export function confirmAllNamespaces(panel, isYes, cx) {
  const confirm = panel.state.confirm;
  panel.set({ confirm: null });
  if (isYes && confirm?.context === panel.state.scope.context) changeScope(panel, { namespace: ALL_NAMESPACES }, cx);
  cx.notify();
}

export function rowNamespace(panel, cx) {
  const row = selectedRow(panel);
  if (row?.namespace && row.namespace !== panel.state.scope.namespace) changeScope(panel, { namespace: row.namespace }, cx);
}

export function loadContexts(panel, cx) {
  cx.spawn(async (cx) => {
    const listed = await readContexts();
    if (!listed.error) panel.proxies.setKnown(listed.contexts);
    panel.set({ contexts: { list: listed.contexts, error: listed.error ? `Cannot list contexts: ${listed.error}` : "" } });
    cx.notify();
  });
}

function namespacesResult(scope, ran) {
  if (ran.ok) return { context: scope.context, names: parseNamespaces(ran.stdout), error: "", loading: false, at: Date.now() };
  return { context: scope.context, names: [], error: `Cannot list namespaces in ${shortContext(scope.context)}: ${firstLine(ran.error)}`, loading: false, at: Date.now() };
}

export function loadNamespaces(panel, cx, isForced) {
  const { namespaces, scope, forbidden } = panel.state;
  const isFresh = namespaces.context === scope.context && !namespaces.error && Date.now() - namespaces.at < NAMESPACE_TTL_MS;
  if (isForced) panel.set({ forbidden: Object.fromEntries(Object.entries(forbidden).filter(([context]) => context !== scope.context)) });
  else if (isFresh || forbidden[scope.context] || namespaces.loading) return;
  panel.set({ namespaces: { ...namespaces, loading: true, error: "" } });
  cx.spawn(async (cx) => {
    const ran = await listNamespaces(panel.proxies, cx, scope.context);
    const result = namespacesResult(scope, ran);
    const isForbidden = !ran.ok && /forbidden/i.test(ran.error);
    panel.set({ namespaces: result, forbidden: isForbidden ? { ...panel.state.forbidden, [scope.context]: result.error } : panel.state.forbidden });
    cx.notify();
  });
}

export function pickContext(panel, context, cx) {
  panel.set({ picker: null });
  cx.notify();
  cx.spawn(async (cx) => {
    const namespace = await defaultNamespace(context);
    changeScope(panel, { context, namespace }, cx);
    cx.notify();
  });
}

export function selectedRow(panel) {
  return panel.state.listing.rows.find((row) => row.id === panel.state.selected) ?? null;
}

export function moveSelection(panel, step) {
  const rows = panel.shownRows();
  if (rows.length === 0) return;
  const at = rows.findIndex((row) => row.id === panel.state.selected);
  const next = at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + step));
  panel.set({ selected: rows[next].id });
  panel.rowScroll.scroll_to_item(Math.min(next, MAX_ROWS - 1));
}

function releaseCode(panel) {
  panel.code?.release();
  panel.code = null;
}

function codeFor(kind, text) {
  const t = theme();
  return EditorState.new({
    language: kind === "yaml" ? "yaml" : "text",
    value: text.length > DETAIL_LIMIT ? `${text.slice(0, DETAIL_LIMIT)}\n... (truncated)` : text,
    readonly: true, font_family: settings().font_family, font_size: 12, soft_wrap: kind === "logs",
    syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, number: t.ansi1, constant: t.ansi6, boolean: t.ansi3 },
  });
}

export function openDetail(panel, kind, cx) {
  const { scope } = panel.state;
  const row = selectedRow(panel);
  const argv = row ? detailArgv(scope, kind, row) : null;
  if (!argv) {
    panel.set({ message: row ? `No ${kind} for ${scope.resource}.` : "Select a row first." });
    cx.notify();
    return;
  }
  releaseCode(panel);
  const title = `${kind} ${scope.resource}/${row.name}`;
  panel.set({ detail: { kind, title, text: "", isError: false, loading: true, row, via: kind === "describe" ? "kubectl" : panel.proxies.mode(scope.context) }, message: "" });
  cx.notify();
  cx.spawn(async (cx) => {
    const ran = await detailText(panel.proxies, cx, scope, kind, row);
    if (panel.state.detail?.title !== title) return;
    const text = ran.ok ? ran.stdout || "(empty)" : ran.error;
    panel.code = ran.ok ? codeFor(kind, text) : null;
    panel.set({ detail: { kind, title, text, isError: !ran.ok, loading: false, row, via: ran.via, hidden: Math.max(0, text.length - DETAIL_LIMIT) } });
    cx.notify();
  });
}

export function closeDetail(panel) {
  releaseCode(panel);
  panel.set({ detail: null });
}

function askTitle(scope, row) {
  return `${scope.resource}/${row.name}`;
}

function runAsk(panel, cx, build) {
  panel.set({ asking: true, message: "" });
  cx.notify();
  cx.spawn(async (cx) => {
    try {
      const { title, text } = await build();
      const result = await deliverAsk(title, text, panel.state.scope.context);
      await dockBeside(result, cx, "k9s");
    } catch (error) {
      panel.set({ message: `Could not ask the agent: ${errorText(error)}` });
    } finally {
      panel.set({ asking: false });
      cx.notify();
    }
  });
}

export function askAgent(panel, cx) {
  const { scope, detail, listing } = panel.state;
  if (panel.state.asking) return;
  if (detail && !detail.loading && !detail.isError) {
    runAsk(panel, cx, async () => ({ title: askTitle(scope, detail.row), text: detailPrompt(scope, detail.row, detail) }));
    return;
  }
  const row = selectedRow(panel);
  if (!row) {
    panel.set({ message: "Select a row first." });
    cx.notify();
    return;
  }
  runAsk(panel, cx, async () => ({ title: askTitle(scope, row), text: await buildTriage(scope, row, listing.header) }));
}

export function openLoki(panel, cx) {
  const { scope } = panel.state;
  const row = selectedRow(panel);
  const url = row ? lokiExploreUrl(scope.context, row.namespace ?? scope.namespace, scope.resource, row.name) : null;
  if (url) cx.open_url(url);
}
