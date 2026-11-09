import { div } from "gpui-kit";
import { v_flex, h_flex, Input, Popup } from "gpui-base";
import { errorRow, note, spinner, lines, ago, fileRow, commitRow, monoFont } from "./ui.js";
import { button, chip, card, cardHeader, icon, iconText, caret, targetField, ICONS } from "./kit.js";
import { diffView, diffWidth, diffText } from "./diff-view.js";
import { targetHint } from "./target.js";
import { sessionLabel } from "./session-data.js";
import { placeText } from "./session-herdr.js";
import { walkSession } from "./extras.js";
import { shipHeader, shipSection, tileFor, ciDot } from "./ship-view.js";
import { sessionBuckets } from "./ship-model.js";
import { statusIcon } from "./ship-tile.js";

const GROUP_ICONS = { DB: ICONS.db, SERVICE: ICONS.service, UI: ICONS.ui, TESTS: ICONS.tests, OTHER: ICONS.repo };
const STATES = {
  uncommitted: { label: "uncommitted", tone: (t) => t.ansi3 },
  local: { label: "local", tone: (t) => t.ansi4 },
  pushed: { label: "pushed", tone: (t) => t.ansi2 },
  orphan: { label: "not on a branch", tone: (t) => t.ansi1 },
  clean: { label: "no diff", tone: (t) => t.dim },
};
const PICKER_ROWS = 60;
const PICKER_WIDTH = 560;
const PICKER_HEIGHT = 340;
const BASH_NOTE = "Bash edits are matched by the file paths in the command; anything else git sees is listed under Not attributed.";
const OTHERS_NOTE = "Uncommitted in this repo but not traced to this session: another session, or a Bash edit whose path the scan could not read";

const stateChip = (t, state) => chip(t, STATES[state]?.label ?? state, STATES[state]?.tone(t) ?? t.dim, state === "pushed" ? "tint" : "outline");

function sessionButton(tab, t) {
  const s = tab.session;
  const label = s ? `${sessionLabel(s)} \u{b7} ${placeText(s)}` : "Pick a session";
  return div().id("session-pick").h(24).px(8).flex().flex_shrink(1).min_w(0).items_center().gap(6).rounded(6).cursor_pointer()
    .border_1().border_color(tab.picking ? t.accent : t.border).bg(tab.picking ? t.selected : t.raised).hover((x) => x.bg(t.hover))
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((_e, cx) => tab.togglePicker(cx))
    .tooltip(s ? `${s.sessionId}${s.cwd ? ` \u{b7} ${s.cwd}` : ""} (p to change)` : "Pick a Claude session (p)")
    .child(icon(ICONS.agent, 13, t.accent))
    .child(div().min_w(0).truncate().text_size(11.5).font_semibold().child(label))
    .child(caret(true, t.dim));
}

export function sessionPicker(tab, t, width) {
  return Popup.new("session-popup", sessionButton(tab, t)).anchor("top_left").flex_shrink(1).min_w(0)
    .when(tab.picking, (el) => el.content(picker(tab, t, width)));
}

function counts(tab, t) {
  const n = tab.totals();
  return h_flex().gap(6).items_center().flex_none()
    .child(chip(t, `${n.repos} repos`, t.muted, "outline"))
    .child(chip(t, `${n.files} files`, t.muted, "outline"))
    .child(lines(t, n.add, n.del));
}

function actions(tab, t) {
  const app = tab.app, busy = Object.values(tab.summaries).some((s) => s.loading);
  const ready = tab.loaded().length > 0;
  return h_flex().flex_1().gap(6).items_center().flex_wrap()
    .child(button("session-refresh", tab.scanning ? "Scanning…" : "Refresh r", t, (_e, cx) => tab.refreshAll(cx), { disabled: !tab.session || tab.scanning, tooltip: "Rescan the session and ask GitLab again" }))
    .child(button("session-summarize", busy ? "Summarizing…" : "Summarize s", t, (_e, cx) => tab.summarize(cx), { disabled: !ready || busy, tooltip: "One-line AI summary per repo (claude haiku), cached by the session diff" }))
    .child(button("session-walk", app.walk.loading ? "Walking\u{2026}" : "Walkthrough w", t, (_e, cx) => walkSession(app, cx), { disabled: !ready || app.walk.loading, tooltip: "Step-by-step plan of this session's changes in dependency order (claude sonnet, cached by the diff; runs only when you click)" }))
    .child(button("session-review", app.sending ? "Starting…" : "Review", t, (_e, cx) => tab.review(cx), { primary: true, disabled: !ready || app.sending, tooltip: "Send this session's repos, commits and files to a reviewer agent" }))
    .child(targetField(t, "session-review-target", app.targetInput, app.targetInput.value().trim() ? targetHint(app.targetInput.value()) : ""))
    .child(div().flex_1())
    .child(counts(tab, t));
}

function metaLine(tab, t) {
  const scan = tab.scan;
  const agents = scan ? scan.transcripts.filter((x) => x.agent).length : 0;
  const parts = [
    scan && `${scan.transcripts.length ? 1 : 0} transcript + ${agents} subagent${agents === 1 ? "" : "s"}`,
    scan?.outsideCount && `outside git: ${scan.outsideCount} file${scan.outsideCount === 1 ? "" : "s"}`,
    tab.session?.at && `active ${ago(tab.session.at)} ago`,
  ].filter(Boolean);
  return div().id("session-meta").px(12).pb(6).truncate().text_size(10.5).text_color(t.dim)
    .tooltip(scan?.outside?.length ? `Outside git:\n${scan.outside.slice(0, 20).join("\n")}` : BASH_NOTE)
    .child(`${parts.join(" \u{b7} ")}${parts.length ? " \u{b7} " : ""}${BASH_NOTE}`);
}

function header(tab, t, width, tiles) {
  return v_flex().flex_none().bg(t.surface).border_b(1).border_color(t.border)
    .child(h_flex().min_h(40).px(12).py(5).gap(8).items_center().flex_wrap()
      .child(icon(ICONS.history, 13, t.accent))
      .child(div().flex_none().font_bold().text_size(13).child("Session"))
      .child(sessionPicker(tab, t, width))
      .child(div().flex_1())
      .child(shipHeader(tab.app.shipPanel, t, tiles)))
    .child(h_flex().px(12).pb(6).child(actions(tab, t)))
    .child(metaLine(tab, t));
}

function rowDetail(s) {
  const text = s.title || s.command;
  const prompt = text && !s.label.startsWith(text.slice(0, 20)) ? text : null;
  const folder = (s.cwd ?? "").split("/").slice(-2).join("/");
  return [prompt, folder].filter(Boolean).join(" \u{b7} ");
}

function pickerRow(tab, t, s, i, buckets) {
  const current = s.sessionId === tab.session?.sessionId;
  return h_flex().id(`session-row-${i}`).h(28).flex_none().pl(18).pr(12).gap(8).items_center().cursor_pointer().text_size(11.5)
    .when(current, (e) => e.bg(t.selected)).when(i === tab.pickCursor && !current, (e) => e.bg(t.hover))
    .when(i === tab.pickCursor, (e) => e.border_l(2).border_color(t.accent)).hover((x) => x.bg(t.hover))
    .on_click((_e, cx) => tab.select(s, cx))
    .tooltip(`${s.title ?? s.command ?? s.label}\n${s.cwd ?? ""}\n${s.sessionId}`)
    .child(div().w(10).flex_none().text_color(s.live ? t.working : t.dim).child(s.live ? "\u{25cf}" : "\u{25cb}"))
    .child(div().flex_none().max_w(240).truncate().font_semibold().child(s.label))
    .when(Boolean(buckets[s.sessionId]), (e) => e.child(div().flex_none().tooltip(`Pipeline ${buckets[s.sessionId]}`).child(statusIcon(t, buckets[s.sessionId] ?? "idle", 12))))
    .when(s.focused, (e) => e.child(chip(t, "this terminal", t.accent, "outline")))
    .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(rowDetail(s)))
    .child(div().flex_none().text_size(10.5).text_color(t.dim).child(ago(s.at)));
}

function groupHead(t, name, i) {
  return h_flex().id(`session-group-${i}`).h(22).flex_none().px(10).mt(4).gap(6).items_center().text_size(10.5).font_semibold().text_color(t.dim)
    .child(icon(name === "Recent" ? ICONS.history : ICONS.folder, 12, t.dim))
    .child(div().min_w(0).truncate().child(name));
}

function pickerRows(tab, t, list) {
  const ship = tab.app.ship, buckets = sessionBuckets(ship.tracked(), ship.remotes());
  return list.slice(0, PICKER_ROWS).flatMap((s, i) => {
    const row = pickerRow(tab, t, s, i, buckets);
    return i === 0 || list[i - 1].group !== s.group ? [groupHead(t, s.group, i), row] : [row];
  });
}

function picker(tab, t, width) {
  const list = tab.matches();
  const w = Math.max(320, Math.min(PICKER_WIDTH, (width ?? PICKER_WIDTH) - 24));
  return v_flex().w(w).mt(4).rounded(8).border_1().border_color(t.border).bg(t.background).shadow_lg().overflow_hidden()
    .on_mouse_down_out((_e, cx) => tab.dismissPicker(cx))
    .child(h_flex().mx(8).my(8).h(28).flex_none().px(8).gap(6).items_center().rounded(6).border_1().border_color(t.accent).bg(t.background)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(Input.new(tab.input).flex_1().h_full().text_size(11.5).text_color(t.foreground)))
    .when(Boolean(tab.sessionsError), (e) => e.child(div().px(10).pb(6).child(errorRow(t, tab.sessionsError, "sessions-error"))))
    .when(Boolean(tab.sessionsWarning), (e) => e.child(div().px(10).pb(4).truncate().text_size(10.5).text_color(t.ansi3).child(tab.sessionsWarning ?? "")))
    .child(v_flex().id("session-list").max_h(PICKER_HEIGHT - 48).overflow_y_scrollbar().pb(6)
      .when(!list.length, (e) => e.child(note(t, tab.sessions.length ? "No session matches" : "Loading sessions\u{2026}")))
      .children(pickerRows(tab, t, list)));
}

function repoLine(tab, r, t, selected, ci) {
  return h_flex().id(`srepo-${r.repo}`).px(10).py(7).gap(8).items_center().cursor_pointer()
    .border_l(2).border_color(selected ? t.accent : t.background).when(selected, (e) => e.bg(t.selected)).hover((x) => x.bg(t.hover))
    .on_click((_e, cx) => tab.toggle(r.repo, cx))
    .child(caret(tab.expanded.has(r.repo), t.dim))
    .child(div().flex_shrink(1).min_w(0).truncate().font_bold().text_size(12.5).child(tab.name(r.repo)))
    .child(div().flex_1().min_w(0).text_size(10.5).text_color(t.dim).when(Boolean(r.branch), (e) => e.child(iconText(ICONS.branch, t.dim, r.branch ?? ""))))
    .when(Boolean(r.pending), (e) => e.child(div().text_size(10.5).text_color(t.accent).frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 90)))
    .when(Boolean(ci), (e) => e.child(ciDot(tab.app.shipPanel, t, ci)))
    .when(Boolean(r.state), (e) => e.child(stateChip(t, r.state)))
    .when(Boolean(r.others?.length), (e) => e.child(div().flex_none().tooltip(OTHERS_NOTE).child(chip(t, `+${r.othersCount} not attributed`, t.ansi3, "outline"))))
    .when(Boolean(r.files), (e) => e.child(div().flex_none().text_size(10.5).text_color(t.dim).child(`${r.files.length} ${r.files.length === 1 ? "file" : "files"}`)).child(lines(t, r.add, r.del)));
}

function summaryLine(repo, state, t) {
  if (!state) return null;
  if (state.loading) return div().pl(32).pb(6).child(spinner(t, "Summarizing…"));
  if (state.error) return div().pl(32).pr(10).pb(6).text_size(11).text_color(t.ansi1).child(`AI summary failed: ${state.error}`);
  const s = state.value;
  return h_flex().id(`sum-${repo}`).pl(32).pr(10).pb(6).gap(6).items_start().text_size(11.5)
    .when(Boolean(s.points.length), (e) => e.tooltip(s.points.join("\n")))
    .child(icon(ICONS.summary, 13, t.accent))
    .child(div().flex_1().min_w(0).child(s.headline))
    .when(Boolean(state.cached), (e) => e.child(div().flex_none().text_size(10).text_color(t.dim).child("cached")));
}

function commitLine(r, c, i, t) {
  return h_flex().pl(22).gap(6).items_center()
    .child(div().flex_1().min_w(0).child(commitRow(`sc-${r.repo}-${i}`, c, t)))
    .child(div().pr(10).child(stateChip(t, c.state)));
}

function fileLine(tab, r, f, i, t, marked) {
  const open = tab.open?.repo === r.repo && tab.open.path === f.path;
  return h_flex().pl(22).gap(6).items_center()
    .child(div().flex_1().min_w(0).child(fileRow(`sf-${r.repo}-${i}`, f, t, open || marked, (_e, cx) => tab.pick(r, f, cx))))
    .when(f.via === "bash", (e) => e.child(div().flex_none().tooltip("Seen in a Bash command of this session (script, sed, redirect), not an Edit/Write call").child(chip(t, "via Bash", t.dim, "outline"))))
    .child(div().pr(10).child(stateChip(t, f.state)));
}

function othersBlock(tab, r, t, cursorRow) {
  return v_flex()
    .child(h_flex().id(`sothers-${r.repo}`).pl(32).pr(10).pt(4).pb(2).gap(6).items_center().text_size(10.5).text_color(t.ansi3).tooltip(OTHERS_NOTE)
      .child(icon(ICONS.warning, 13, t.ansi3))
      .child(div().flex_1().min_w(0).truncate().child(`Not attributed: ${r.othersCount} more uncommitted file${r.othersCount === 1 ? "" : "s"} in this repo${r.othersCount > r.others.length ? ` (first ${r.others.length} shown)` : ""}`)))
    .children(r.others.map((f, i) => fileLine(tab, r, f, `o${i}`, t, cursorRow?.repo === r && cursorRow.file === f)));
}

function expandedBody(tab, r, t, cursorRow) {
  return v_flex().pb(6)
    .when(Boolean(r.loadError), (e) => e.child(div().px(10).child(errorRow(t, `Could not read ${tab.name(r.repo)}: ${r.loadError}`, `serr-${r.repo}`))))
    .when(Boolean(r.unresolved?.length), (e) => e.child(note(t, `Commits seen in the transcript but not found in git: ${r.unresolved.join(", ")}`).pl(32)))
    .children((r.commitList ?? []).map((c, i) => commitLine(r, c, i, t)))
    .when(Boolean(r.commitList?.length && r.files?.length), (e) => e.child(div().h(1).ml(32).mr(10).my(2).bg(t.border)))
    .children((r.files ?? []).map((f, i) => fileLine(tab, r, f, i, t, cursorRow?.repo === r && cursorRow.file === f)))
    .when(Boolean(r.others?.length), (e) => e.child(othersBlock(tab, r, t, cursorRow)))
    .when(Boolean(r.files && !r.files.length && !r.commitList?.length && !r.others?.length), (e) => e.child(note(t, "Nothing left to show: edits were reverted").pl(32)));
}

function groupCard(tab, g, t, cursorRow, tiles) {
  return card(t, `sgroup-${g.group}`)
    .child(cardHeader(t, { icon: GROUP_ICONS[g.group], title: g.group, meta: `${g.repos.length} repo${g.repos.length === 1 ? "" : "s"}` }))
    .children(g.repos.map((r) => v_flex()
      .child(repoLine(tab, r, t, cursorRow?.repo === r && !cursorRow.file, tileFor(tiles, r.repo, r.branch)))
      .when(Boolean(tab.summaries[r.repo]), (e) => e.child(summaryLine(r.repo, tab.summaries[r.repo], t)))
      .when(tab.expanded.has(r.repo), (e) => e.child(expandedBody(tab, r, t, cursorRow)))));
}

function diffPane(tab, t) {
  const o = tab.open, tone = STATES[o.state]?.tone(t) ?? t.dim;
  return v_flex().flex_1().min_h(0).border_t(1).border_color(t.border)
    .child(h_flex().h(30).flex_none().px(10).gap(8).items_center().text_size(11).bg(t.surface).border_b(1).border_color(t.border)
      .child(icon(ICONS.diff, 13, tone))
      .child(div().flex_none().text_color(t.dim).child(tab.name(o.repo)))
      .child(div().flex_1().min_w(0).truncate().font_semibold().font_family(monoFont()).child(o.path))
      .child(stateChip(t, o.state))
      .child(button("session-copy-diff", "Copy", t, (_e, cx) => cx.write_to_clipboard(diffText(tab.rows)), { small: true, disabled: tab.diffLoading || !tab.rows.length }))
      .child(button("session-close-diff", "", t, (_e, cx) => { tab.closeFile(); cx.notify(); }, { icon: ICONS.close, ghost: true, small: true, tooltip: "Close diff (esc)" })))
    .when(tab.diffLoading, (e) => e.child(spinner(t, "Loading diff…")))
    .when(Boolean(tab.diffError), (e) => e.child(div().p(8).child(errorRow(t, tab.diffError, "session-diff"))))
    .when(Boolean(tab.diffNote), (e) => e.child(note(t, tab.diffNote)))
    .when(!tab.diffLoading && !tab.diffError && !tab.diffNote, (e) => e.child(diffView("session-diff", tab.rows, t, diffWidth(tab.rows))));
}

function list(tab, t, tiles) {
  const groups = tab.grouped(), cursorRow = tab.flat()[tab.cursor ?? -1];
  const empty = tab.scan && !tab.scan.repos.length;
  return v_flex().id("session-body").flex_1().min_h(0).overflow_y_scrollbar().p(8).gap(8)
    .when(Boolean(tab.error), (e) => e.child(errorRow(t, tab.error, "session-error", tab.session ? (_e, cx) => tab.refresh(cx) : null)))
    .when(tab.scanning && !tab.scan, (e) => e.child(spinner(t, "Reading the transcript and its subagents…")))
    .children([shipSection(tab.app.shipPanel, t, tiles)].filter(Boolean))
    .when(Boolean(empty), (e) => e.child(note(t, "This session changed no file inside a git repo")))
    .children(groups.map((g) => groupCard(tab, g, t, cursorRow, tiles)));
}

export function sessionView(tab, t, width) {
  const tiles = tab.app.shipPanel.tiles();
  return v_flex().flex_1().min_h(0)
    .child(header(tab, t, width, tiles))
    .child(list(tab, t, tiles))
    .when(Boolean(tab.open), (e) => e.child(diffPane(tab, t)));
}

