import { div } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";
import { rankTargets, targetId, freshness } from "../finder.js";
import { shortContext, isProdContext } from "../kubectl.js";
import { button, placeButton, note, mono, glyph, chip, card, cardHeader, PROD_GLYPH, ICONS } from "./widgets.js";

const MAX_ROWS = 200;
const NAMESPACE_WIDTH = 16;
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function targetGlyph(t, target, isStale) {
  if (isStale) return { glyph: "?", color: t.dim };
  if (target.desired === 0) return { glyph: "·", color: t.dim };
  if (target.ready === 0) return { glyph: "✕", color: t.ansi1 };
  if (target.ready < target.desired) return { glyph: "◐", color: t.ansi3 };
  return { glyph: "●", color: t.ansi2 };
}

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function contextChip(t, context) {
  return isProdContext(context) ? chip(t, `${PROD_GLYPH} ${shortContext(context)}`, t.ansi1, "solid") : chip(t, shortContext(context), t.ansi4);
}

function targetRow(app, t, target, index, flags) {
  const look = targetGlyph(t, target, flags.isStale);
  return h_flex().id(`target-${index}`).h(30).flex_none().px(10).gap(8).items_center()
    .font_family(mono()).text_size(12).cursor_pointer()
    .when(index === 0, (el) => el.bg(t.selected))
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => app.followTarget(target, cx))
    .child(div().w(12).flex_none().text_color(look.color).child(look.glyph))
    .child(contextChip(t, target.context))
    .child(div().min_w(0).truncate().font_semibold().text_color(t.foreground).child(target.name))
    .when(!target.isDefaultNamespace, (el) => el.child(div().flex_none().text_color(t.dim).child(clip(target.namespace, NAMESPACE_WIDTH))))
    .when(target.kind === "statefulset", (el) => el.child(chip(t, "sts", t.muted, "outline")))
    .child(div().flex_1())
    .when(flags.isRecent, (el) => el.child(div().flex_none().text_color(t.dim).child("\u{f1da}")))
    .child(div().flex_none().text_color(look.color).child(`${target.ready}/${target.desired}`));
}

function freshnessLine(t, state) {
  const parts = freshness(state.index, Date.now());
  return h_flex().flex_wrap().px(10).py(2).gap(8).text_size(11)
    .children(parts.map((part, index) => div().id(`fresh-${index}`)
      .text_color(part.error ? t.ansi3 : t.dim)
      .when(Boolean(part.error), (el) => el.tooltip(part.error))
      .child(`${clip(shortContext(part.context), 24)}${part.error ? " ✕" : ""} ${part.age}`)))
    .when(state.indexing, (el) => el.child(div().text_color(t.accent).frames(SPIN.map((s) => `${s} refreshing`), 90).child("refreshing")));
}

function emptyText(state, ranked) {
  if (state.index.targets.length === 0) return state.indexing ? "Indexing every context..." : "No deployments cached yet. Press Reload.";
  if (ranked.length === 0) return "No deployment matches. Fewer words, or Reload.";
  return null;
}

function headerActions(app, t) {
  return [
    button(t, "go-browse", "Browse", (_e, cx) => app.openBrowse(cx, {}), { hotkey: "tab" }),
    button(t, "reindex", "Reload", (_e, cx) => app.refreshIndex(cx, { isForced: true })),
    placeButton(t, app),
  ];
}

function searchBox(app, t) {
  return h_flex().mx(10).my(8).h(32).flex_none().px(10).gap(8).items_center().rounded(8)
    .border_1().border_color(t.accent).bg(t.surface)
    .child(glyph(t.accent, ICONS.find))
    .child(Input.new(app.queryInput).flex_1().h_full().text_size(12.5).text_color(t.foreground));
}

function legend(t) {
  const items = [["\u{25cf}", "up", t.ansi2], ["\u{25d0}", "partial", t.ansi3], ["\u{2715}", "down", t.ansi1], ["?", "unreachable", t.dim], ["\u{f1da}", "recent", t.dim]];
  return h_flex().flex_none().px(12).py(6).gap(10).border_t(1).border_color(t.border).text_size(10.5).text_color(t.dim)
    .children(items.map(([mark, word, color], index) => h_flex().id(`legend-${index}`).gap(4).child(div().text_color(color).child(mark)).child(div().child(word))));
}

export function finderView(app, t) {
  const state = app.state;
  const ranked = rankTargets(state.index.targets, state.recent, state.query);
  const shown = ranked.slice(0, MAX_ROWS);
  const recent = new Set(state.recent);
  const empty = emptyText(state, ranked);
  return card(t, "find-card").flex_1().min_h(0).mt(8)
    .child(cardHeader(t, { icon: ICONS.find, title: "Find", meta: `${ranked.length} targets`, actions: headerActions(app, t) }))
    .child(searchBox(app, t))
    .child(freshnessLine(t, state))
    .when(Boolean(state.message), (el) => el.child(note(t, state.message, "warning")))
    .child(v_flex().id("targets").flex_1().min_h(0).mt(4).border_t(1).border_color(t.border).overflow_y_scrollbar()
      .children(shown.map((target, index) => targetRow(app, t, target, index, {
        isRecent: recent.has(targetId(target)),
        isStale: state.index.errors[target.context] !== undefined,
      })))
      .when(ranked.length > shown.length, (el) => el.child(note(t, `+${ranked.length - shown.length} more, keep typing`)))
      .when(Boolean(empty), (el) => el.child(note(t, empty ?? ""))))
    .child(legend(t));
}
