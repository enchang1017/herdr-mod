import { div } from "gpui-kit";
import { v_flex, h_flex, Input, v_virtual_list, Scrollbar } from "gpui-base";
import { RESOURCES, ALL_NAMESPACES, shortContext, isProdContext } from "../kubectl.js";
import { compactTable, layoutCompact, layoutFull, fullWidth, countHealth, MAX_ROWS } from "../table.js";
import { helpCard, confirmCard } from "./overlays.js";
import { drawerArea, drawerWidth } from "./drawer.js";
import { overviewKey } from "../overview-source.js";
import { icon, kindIcon } from "./icons.js";
import { isHoverable, withHover } from "./row-hover.js";
import {
  tint, button, placeButton, chip, card, cardHeader, prodBanner, note, errorRow, mono, glyph, toneColor, contextLabel, PROD_GLYPH, ICONS,
} from "./widgets.js";

const FONT_SIZE = 12;
const CHAR_WIDTH = FONT_SIZE * 0.6;
const TABLE_CHROME_PX = 64;
const MIN_COLUMNS = 24;
const ROW_PX = 24;
const HEALTH_GLYPH = { error: "\u{2715}", warning: "\u{25d0}", success: "\u{25cf}", none: " " };
const TINTED_COLUMNS = new Set(["STATUS"]);
const WIDE_PX = 900;
const TAB_LABELS = { pods: "PODS", deployments: "DEPLOYMENTS", services: "SERVICES", nodes: "NODES", events: "EVENTS", ingresses: "INGRESSES" };
const NARROW_PX = 560;

function tableColumns(app) {
  const area = app.drawerArea;
  const isOpen = Boolean(app.state.drawer && area);
  const covered = isOpen && area.width >= 760 ? drawerWidth(area, app.state.drawerWidth) + 8 : 0;
  const width = (area ? area.width : (app.size?.width ?? 420)) - covered;
  return Math.max(MIN_COLUMNS, Math.floor((width - TABLE_CHROME_PX) / CHAR_WIDTH));
}

function clock(ms) {
  return ms ? new Date(ms).toTimeString().slice(0, 8) : "never";
}

function scopeButton(t, id, label, value, onClick, options) {
  return button(t, id, h_flex().gap(5).items_center().min_w(0).child(div().text_color(t.dim).child(label)).child(value), onClick, options);
}

function scopeRow(app, t) {
  const { scope, picker } = app.state;
  const ns = scope.resource === "nodes" ? "cluster" : scope.namespace === ALL_NAMESPACES ? "all" : scope.namespace;
  return h_flex().px(10).pt(8).gap(6).items_center().flex_wrap()
    .child(scopeButton(t, "pick-ctx", "ctx", contextLabel(t, scope.context, shortContext(scope.context) || "?"),
      (_e, cx) => app.togglePicker("context", cx), { active: picker === "context", tooltip: scope.context || "no context" }))
    .child(scopeButton(t, "pick-ns", "ns", div().truncate().child(ns), (_e, cx) => app.togglePicker("namespace", cx), { active: picker === "namespace" }))
    .child(button(t, "all-ns", "All", (_e, cx) => app.allNamespaces(cx), { hotkey: "a", active: scope.namespace === ALL_NAMESPACES }))
    .when(Boolean(app.selectedRow()?.namespace), (el) => el.child(button(t, "row-ns", "Row ns", (_e, cx) => app.rowNamespace(cx), { hotkey: "n" })));
}

function resourceTab(app, t, resource, index) {
  const isCurrent = resource.key === app.state.scope.resource;
  const color = isCurrent ? t.solid_foreground : t.muted;
  return div().id(`res-${resource.key}`).flex_1().max_w(150).h(26).px(8).flex().items_center().justify_center().rounded(5)
    .text_size(11).cursor_pointer()
    .when(isCurrent, (el) => el.bg(t.solid).font_semibold())
    .when(!isCurrent, (el) => el.hover((s) => s.bg(t.hover)))
    .on_click((_e, cx) => app.switchResource(resource.key, cx))
    .child(h_flex().gap(6).items_center()
      .child(icon(kindIcon(resource.key), 13, isCurrent ? t.solid_foreground : t.dim))
      .child(div().text_color(color).child(TAB_LABELS[resource.key] ?? resource.label.toUpperCase()))
      .child(div().text_size(9.5).text_color(isCurrent ? t.solid_foreground : t.dim).child(String(index + 1))));
}

function resourceBar(app, t) {
  return h_flex().mx(10).mt(8).p(2).gap(2).rounded(7).bg(t.surface).border_1().border_color(t.border).flex_wrap()
    .children(RESOURCES.map((resource, index) => resourceTab(app, t, resource, index)));
}

function filterRow(app, t) {
  const failing = app.state.failingOnly;
  return h_flex().px(10).py(8).gap(6).items_center()
    .child(h_flex().id("filter-box").flex_1().min_w(0).h(26).px(8).gap(6).items_center().rounded(6).border_1()
      .border_color(app.state.filter ? t.accent : t.border).bg(t.surface)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(glyph(t.dim, ICONS.filter))
      .child(Input.new(app.filterInput).flex_1().h_full().text_size(11.5).text_color(t.foreground)))
    .child(button(t, "failing", failing ? "Failing only" : "All rows", (_e, cx) => app.toggleFailing(cx), { hotkey: "f", active: failing }));
}

function viaHint(app, t) {
  const via = app.state.listing.via ?? app.proxies.mode(app.state.scope.context);
  return div().id("via-hint").text_size(10.5).text_color(via === "proxy" ? t.ansi2 : t.dim).tooltip(via === "proxy" ? "Read-only kubectl proxy (GET only)" : "One kubectl process per call").child(via);
}

function headerMeta(app, t) {
  const listing = app.state.listing;
  if (app.state.loadingList) return div().text_color(t.accent).frames(["\u{280b}", "\u{2819}", "\u{2839}", "\u{2838}", "\u{283c}", "\u{2834}", "\u{2826}", "\u{2827}", "\u{2807}", "\u{280f}"].map((s) => `${s} loading`), 90).child("loading");
  if (listing.stale) return chip(t, `${ICONS.stale} stale since ${clock(listing.fetchedAt)}`, t.ansi3);
  return h_flex().gap(6).items_center().child(div().text_color(t.dim).child(`updated ${clock(listing.fetchedAt)}`)).child(viaHint(app, t));
}

function browseCard(app, t) {
  const actions = [
    ...((app.size?.width ?? WIDE_PX) >= NARROW_PX ? [headerMeta(app, t)] : []),
    button(t, "go-find", "Find", (_e, cx) => app.openFinder(cx), { hotkey: "g" }),
    button(t, "reload", "Refresh", (_e, cx) => app.reloadList(cx), { hotkey: "r" }),
    placeButton(t, app),
    button(t, "help", "?", (_e, cx) => app.toggleHelp(cx), { active: app.state.help }),
  ];
  return card(t, "browse-card").flex_none()
    .child(cardHeader(t, { icon: ICONS.browse, title: "Browse", actions }))
    .child(scopeRow(app, t))
    .child(resourceBar(app, t))
    .child(filterRow(app, t));
}

function option(t, id, label, isCurrent, onClick, color) {
  return h_flex().id(id).h(28).flex_none().px(10).gap(6).items_center().cursor_pointer()
    .when(isCurrent, (el) => el.bg(t.selected))
    .hover((s) => s.bg(t.hover))
    .on_click(onClick)
    .child(div().w(10).flex_none().text_color(t.accent).child(isCurrent ? "\u{25b8}" : ""))
    .child(div().flex_1().min_w(0).truncate().text_color(color ?? t.foreground).child(label));
}

function contextPicker(app, t) {
  const { scope, contexts } = app.state;
  return card(t, "picker").flex_1().min_h(0)
    .child(cardHeader(t, { icon: ICONS.context, title: "Contexts", meta: `${contexts.list.length}` }))
    .child(v_flex().id("picker-list").flex_1().min_h(0).overflow_y_scrollbar()
      .when(Boolean(contexts.error), (el) => el.child(errorRow(t, "ctx-error", contexts.error, (_e, cx) => app.loadContexts(cx))))
      .children(contexts.list.map((context, index) => option(t, `ctx-${index}`, isProdContext(context) ? `${PROD_GLYPH} ${shortContext(context)}` : shortContext(context),
        context === scope.context, (_e, cx) => app.pickContext(context, cx), isProdContext(context) ? t.ansi1 : undefined).tooltip(context))));
}

function namespacePicker(app, t) {
  const { scope, namespaces, forbidden } = app.state;
  const names = namespaces.context === scope.context ? namespaces.names : [];
  const denied = forbidden[scope.context];
  return card(t, "picker").flex_1().min_h(0)
    .child(cardHeader(t, { icon: ICONS.context, title: "Namespaces", meta: shortContext(scope.context) }))
    .child(v_flex().id("picker-list").flex_1().min_h(0).overflow_y_scrollbar()
      .when(Boolean(denied), (el) => el.child(errorRow(t, "ns-denied", `Namespace list forbidden here (remembered). ${denied}`, (_e, cx) => app.loadNamespaces(cx, true))))
      .when(Boolean(namespaces.error) && !denied, (el) => el.child(errorRow(t, "ns-error", namespaces.error, (_e, cx) => app.loadNamespaces(cx, true))))
      .when(namespaces.loading, (el) => el.child(note(t, "Loading namespaces...")))
      .children([ALL_NAMESPACES, ...names].map((name, index) => option(t, `ns-${index}`, name === ALL_NAMESPACES ? "all namespaces" : name,
        name === scope.namespace, (_e, cx) => (name === ALL_NAMESPACES ? app.allNamespaces(cx) : app.pickNamespace(name, cx))))));
}

function healthChips(t, layout, total) {
  const counts = countHealth(layout.rows.map((row) => row.health));
  return [
    ...(counts.error > 0 ? [chip(t, `${HEALTH_GLYPH.error} ${counts.error}`, t.ansi1)] : []),
    ...(counts.warning > 0 ? [chip(t, `${HEALTH_GLYPH.warning} ${counts.warning}`, t.ansi3)] : []),
    ...(counts.success > 0 ? [chip(t, `${HEALTH_GLYPH.success} ${counts.success}`, t.ansi2)] : []),
    div().text_size(11).text_color(t.dim).child(layout.rows.length === total ? `${total} rows` : `${layout.rows.length} of ${total}`),
  ];
}

function cellView(t, cell) {
  const color = toneColor(t, cell.tone);
  if (!TINTED_COLUMNS.has(cell.column) || cell.tone === "plain") return div().flex_none().text_color(color).child(cell.text);
  const value = cell.text.trimEnd();
  return h_flex().flex_none().child(div().rounded(3).bg(tint(color, "24")).text_color(color).child(value)).child(div().child(cell.text.slice(value.length)));
}

function tableRow(app, t, row, index) {
  const isSelected = row.id === app.state.selected;
  const isOpen = isSelected && Boolean(app.state.drawer);
  const element = h_flex().id(`row-${index}`).h(ROW_PX).w_full().flex_none().px(8).items_center().cursor_pointer()
    .whitespace_nowrap().overflow_hidden().border_l(2).border_color(isSelected ? t.accent : t.background)
    .when(isSelected, (el) => el.bg(isOpen ? tint(t.accent, "26") : t.selected))
    .hover((s) => s.bg(t.hover))
    .child(div().w(14).flex_none().text_color(toneColor(t, row.health)).child(HEALTH_GLYPH[row.health]))
    .children(row.cells.map((cell) => cellView(t, cell)));
  if (!isHoverable(app.state.scope.resource)) return element;
  return withHover(app, t, element, row.id, index);
}

function staleRow(app, t) {
  const listing = app.state.listing;
  if (!listing.stale) return null;
  return errorRow(t, "stale", `Showing rows from ${clock(listing.fetchedAt)}. Last refresh failed: ${listing.error}`, (_e, cx) => app.reloadList(cx));
}

function tableLayout(app) {
  const { listing } = app.state;
  const rows = app.shownRows();
  const drawn = rows.slice(0, MAX_ROWS);
  const columns = tableColumns(app);
  const layout = fullWidth(listing.header, drawn) <= columns ? layoutFull(listing.header, drawn) : layoutCompact(compactTable(listing.header, drawn), columns);
  return { rows, layout };
}

function rowList(app, t, drawn) {
  return div().id("rows-box").relative().flex_1().min_h(0).font_family(mono()).text_size(FONT_SIZE)
    .child(v_virtual_list("rows", drawn.length, ROW_PX, (index) => drawn[index].id,
      (range) => drawn.slice(range.start, range.end).map((row, offset) => tableRow(app, t, row, range.start + offset)))
      .on_item_click((key, cx) => app.clickRow(key, cx))
      .track_scroll(app.rowScroll).size_full())
    .child(Scrollbar.vertical("rows").absolute().inset_0());
}

function tableCard(app, t, shaped) {
  const { listing, scope } = app.state;
  if (listing.error && !listing.stale) return card(t, "table-card").child(errorRow(t, "list-error", listing.error, (_e, cx) => app.reloadList(cx)));
  if (!listing.header) return card(t, "table-card").child(note(t, app.state.loadingList || !scope.context ? "Loading..." : listing.notice || "No resources found."));
  const { rows, layout } = shaped;
  const resource = RESOURCES.find((one) => one.key === scope.resource)?.label ?? scope.resource;
  return card(t, "table-card").flex_1().min_h(0)
    .child(cardHeader(t, { icon: ICONS.browse, title: resource, chips: healthChips(t, layout, listing.rows.length) }))
    .child(h_flex().h(22).flex_none().px(8).items_center().bg(t.raised).border_b(1).border_color(t.border).border_l(2)
      .font_family(mono()).text_size(FONT_SIZE).text_color(t.muted).whitespace_nowrap().overflow_hidden()
      .child(div().w(14).flex_none()).child(div().child(layout.header)))
    .when(layout.rows.length > 0, (el) => el.child(rowList(app, t, layout.rows)))
    .when(layout.rows.length === 0, (el) => el.child(v_flex().id("rows").flex_1().min_h(0)
      .child(note(t, app.state.failingOnly || app.state.filter ? "Nothing matches the filter." : "No resources here."))))
    .when(rows.length > MAX_ROWS, (el) => el.child(note(t, `+${rows.length - MAX_ROWS} more rows not drawn`)));
}

const HEALTH_TONE = { error: "error", warning: "warning", success: "success", none: "subtle" };

function drawerSpec(app, shaped) {
  const { drawer, scope } = app.state;
  const row = app.selectedRow();
  const isOpen = Boolean(drawer && row);
  const shown = isOpen ? row : app.state.lastRow;
  const health = shaped?.layout.rows.find((one) => one.id === shown?.id)?.health ?? "none";
  return { open: isOpen, row: shown ?? null, tone: HEALTH_TONE[health], key: shown ? overviewKey(scope, shown) : "" };
}

function tableWithDrawer(app, t) {
  const shaped = app.state.listing.header ? tableLayout(app) : null;
  return drawerArea(app, t, { ...drawerSpec(app, shaped), table: tableCard(app, t, shaped) });
}

function mainArea(app, t) {
  const { picker, help, confirm } = app.state;
  if (help) return helpCard(app, t);
  if (picker === "context") return contextPicker(app, t);
  if (picker === "namespace") return namespacePicker(app, t);
  const body = v_flex().flex_1().min_h(0).child(tableWithDrawer(app, t));
  return v_flex().flex_1().min_h(0)
    .when(Boolean(confirm), (el) => el.child(confirmCard(app, t)))
    .when(Boolean(staleRow(app, t)), (el) => el.child(staleRow(app, t)))
    .child(body);
}

export function browseView(app, t) {
  const { message, scope } = app.state;
  return v_flex().flex_1().min_h(0).pb(4)
    .when(isProdContext(scope.context), (el) => el.child(prodBanner(t, scope.context)))
    .child(browseCard(app, t))
    .when(Boolean(message), (el) => el.child(note(t, message, "warning")))
    .child(mainArea(app, t));
}
