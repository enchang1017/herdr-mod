import { div } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";
import { loadPage } from "./graph-data.js";
import { shortRef } from "./git.js";
import { RangeCompare, WORKTREE, compareCommand } from "./compare-state.js";
import { compareView, pickBanner } from "./compare-view.js";
import { button, errorRow, note, spinner, monoFont, ago } from "./ui.js";
import { card, cardHeader, chip, tabs, shade, ICONS } from "./kit.js";
import { viewTabs } from "./detail.js";

const RECENT = 80;

export class Compare {
  constructor(app, refsInput) {
    this.app = app; this.refsInput = refsInput;
    this.cmp = new RangeCompare({ on: () => app.radar.on, name: (path) => app.radar.name(path), cache: app.cache, path: () => this.path, review: (path, range, cx) => app.sendReview(path, cx, range) });
    this.scope = "current";
    refsInput.on("submit", (_e, cx) => this.submitRefs(cx));
    refsInput.on("focus", () => { app.typing = true; });
    refsInput.on("blur", () => { app.typing = false; });
    this.reset(null);
  }

  reset(path) {
    this.path = path; this.cmp.forget();
    this.recent = []; this.recentError = null; this.recentLoading = false; this.recentToken = (this.recentToken ?? 0) + 1;
    this.selected = null; this.cursor = null; this.refsError = null;
  }

  show(path, cx) {
    this.reset(path);
    const info = this.app.radar.info[path];
    this.loadRecent(cx);
    if (info?.base && info.local + info.pushed > 0) this.preset(info.base, "HEAD", cx);
  }

  loadRecent(cx) {
    const path = this.path, token = this.recentToken + 1;
    this.recentToken = token; this.recentLoading = true; this.recentError = null;
    cx.spawn(async (cx) => {
      try {
        const page = await loadPage(path, { scope: this.scope, remotes: false }, 0, [], this.app.radar.on);
        if (token === this.recentToken) this.recent = page.commits.slice(0, RECENT);
      } catch (e) {
        if (token === this.recentToken) this.recentError = `Could not list commits: ${e.message ?? e}`;
      } finally {
        if (token === this.recentToken) this.recentLoading = false;
        cx.notify();
      }
    });
    cx.notify();
  }

  setScope(scope, cx) {
    this.scope = scope;
    this.loadRecent(cx);
  }

  preset(from, to, cx) {
    if (to !== WORKTREE) this.refsInput.set_value(`${from}..${to}`);
    this.cmp.start(this.path, from, to, cx, true);
  }

  submitRefs(cx) {
    const text = this.refsInput.value().trim();
    const [a, b, extra] = text.split(/\.\.\.?|\s+/);
    if (!a || extra !== undefined) { this.refsError = `Type a..b or a b, got ${JSON.stringify(text)}`; cx.notify(); return; }
    this.refsError = null;
    this.preset(a, b || "HEAD", cx);
    this.app.handle.focus();
  }

  click(commit, ev, cx) {
    this.cursor = this.recent.findIndex((c) => c.hash === commit.hash);
    if (this.cmp.partner(commit.hash, ev?.modifiers, this.selected, cx)) return;
    this.selected = commit.hash;
    cx.notify();
  }

  beginPick(cx) {
    const base = this.selected ?? this.recent[this.cursor ?? 0]?.hash;
    if (!base) return;
    this.selected = base;
    this.cmp.beginPick(base, cx);
  }

  compareKey(cx) {
    const cursor = this.recent[this.cursor ?? -1];
    if (this.selected && cursor && cursor.hash !== this.selected) this.cmp.start(this.path, this.selected, cursor.hash, cx);
    else this.beginPick(cx);
  }

  move(step, cx) {
    if (!this.recent.length) return;
    this.cursor = Math.min(this.recent.length - 1, Math.max(0, (this.cursor ?? -1) + step));
    cx.notify();
  }

  key(key, cx) {
    if (key === "escape") return this.cmp.escape(cx);
    if (key === "c") this.compareKey(cx);
    else if (key === "x") this.cmp.clear(cx);
    else if (key === "j" || key === "down") this.move(1, cx);
    else if (key === "k" || key === "up") this.move(-1, cx);
    else if (key === "enter" && this.recent[this.cursor ?? -1]) this.click(this.recent[this.cursor], null, cx);
    else return false;
    return true;
  }

  command(arg, cx) {
    if (!arg.startsWith("pick-")) { compareCommand(this.cmp, this.path, arg, cx); return; }
    const hit = this.recent.find((c) => c.hash.startsWith(arg.slice(5)));
    if (!hit) return;
    this.selected = hit.hash;
    this.cmp.beginPick(hit.hash, cx);
  }

  quickButtons(t) {
    const info = this.app.radar.info[this.path];
    const upstream = Boolean(info?.upstream), base = info?.base;
    return h_flex().gap(4).flex_wrap().items_center()
      .child(button("q-unpushed", "Unpushed (upstream..HEAD)", t, (_ev, cx) => this.preset("@{upstream}", "HEAD", cx), { small: true, disabled: !upstream, tooltip: upstream ? `${info.upstream}..HEAD` : "This branch has no upstream" }))
      .child(button("q-unmerged", `Unmerged (${base ? shortRef(base) : "origin/master"}..HEAD)`, t, (_ev, cx) => this.preset(base, "HEAD", cx), { small: true, disabled: !base, tooltip: base ? "Commits not on the base branch" : "No origin/master or origin/main" }))
      .child(button("q-work", "Working tree vs HEAD", t, (_ev, cx) => this.preset("HEAD", WORKTREE, cx), { small: true, tooltip: "Uncommitted changes, untracked files included" }));
  }

  refsField(t) {
    return h_flex().gap(6).items_center()
      .child(div().flex_none().text_size(10).text_color(t.dim).child("Refs…"))
      .child(h_flex().id("refs-field").flex_1().min_w(0).h(24).px(7).items_center().rounded(6).border_1().border_color(this.refsError ? t.ansi1 : t.border).bg(t.background)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(Input.new(this.refsInput).flex_1().h_full().text_size(11.5).text_color(t.foreground)))
      .child(button("refs-run", "Compare", t, (_ev, cx) => this.submitRefs(cx), { small: true }));
  }

  controls(t) {
    return v_flex().flex_none().gap(8).px(10).py(8).bg(t.surface).border_b(1).border_color(t.border)
      .child(h_flex().gap(8).items_center()
        .child(button("back-detail", "Back", t, (_ev, cx) => this.app.go({ name: "detail", path: this.path }, cx)))
        .child(div().flex_1().min_w(0).truncate().font_bold().text_size(13).child(this.app.radar.name(this.path))))
      .child(viewTabs(this.app, this.path, "compare", t))
      .child(this.quickButtons(t))
      .child(this.refsField(t))
      .when(Boolean(this.refsError), (e) => e.child(errorRow(t, this.refsError, "refs")));
  }

  mark(t, hash) {
    const s = this.cmp.state;
    if (s?.a?.hash === hash) return { letter: "A", color: t.ansi4 };
    if (s?.b?.hash === hash) return { letter: "B", color: t.ansi5 };
    if (this.cmp.picking === hash || (!s && this.selected === hash)) return { letter: "A?", color: t.accent };
    return null;
  }

  recentRow(t, c, i) {
    const mark = this.mark(t, c.hash), cursor = this.cursor === i;
    return h_flex().id(`recent-${i}`).h(24).flex_none().px(10).gap(8).items_center().text_size(11).cursor_pointer()
      .border_l(2).border_color(mark ? mark.color : shade(t.background, "clear"))
      .when(Boolean(mark), (e) => e.bg(shade(mark.color, "soft"))).when(!mark && cursor, (e) => e.bg(t.hover)).hover((s) => s.bg(t.hover))
      .on_click((ev, cx) => this.click(c, ev, cx))
      .child(mark ? chip(t, mark.letter, mark.color, "solid") : div().w(18).flex_none())
      .child(div().flex_none().font_family(monoFont()).text_color(t.muted).child(c.short))
      .children(c.refs.slice(0, 2).map((ref) => chip(t, ref.name, ref.kind === "head" ? t.accent : t.ansi4, "outline")))
      .child(div().flex_1().min_w(0).truncate().child(c.subject))
      .child(div().flex_none().text_color(t.dim).child(ago(c.at)));
  }

  recentList(t) {
    const scope = tabs(t, "recent-scope", [["current", "Current"], ["all", "All branches"]], this.scope, (key, _ev, cx) => this.setScope(key, cx));
    return card(t, "recent").h(190)
      .child(cardHeader(t, { icon: ICONS.commit, title: "Commits", meta: "click A, cmd/shift-click B · c compare · x clear", actions: [scope] }))
      .child(v_flex().id("recent-list").flex_1().min_h(0).overflow_y_scrollbar().py(2)
        .when(this.recentLoading && !this.recent.length, (e) => e.child(spinner(t, "Reading history…")))
        .when(Boolean(this.recentError), (e) => e.child(errorRow(t, this.recentError, "recent", (_ev, cx) => this.loadRecent(cx))))
        .children(this.recent.map((c, i) => this.recentRow(t, c, i))));
  }

  pickHint(t) {
    const selected = this.recent.find((c) => c.hash === this.selected);
    if (!selected) return note(t, "Pick A in the list, then cmd/shift-click B, or use a quick range above.");
    return h_flex().px(10).py(4).gap(6).flex_wrap().items_center()
      .child(div().text_size(11).text_color(t.dim).child(`A = ${selected.short}. Cmd/shift-click B, or`))
      .child(button("r-pick", "Compare with…", t, (_ev, cx) => this.beginPick(cx), { small: true }))
      .child(button("r-head", "Compare with HEAD", t, (_ev, cx) => this.cmp.start(this.path, this.selected, "HEAD", cx), { small: true }))
      .child(button("r-work", "Compare with working tree", t, (_ev, cx) => this.cmp.start(this.path, this.selected, WORKTREE, cx), { small: true }));
  }

  selectSha(sha, cx) {
    const index = this.recent.findIndex((c) => c.hash === sha);
    if (index >= 0) this.cursor = index;
    cx.notify();
  }

  render(t, width) {
    const picking = this.cmp.picking;
    return v_flex().size_full().min_h(0)
      .child(this.controls(t))
      .when(Boolean(picking), (e) => e.child(pickBanner(this.cmp, t, picking.slice(0, 8))))
      .child(div().flex_none().p(8).child(this.recentList(t)))
      .when(!this.cmp.state && !picking, (e) => e.child(this.pickHint(t)))
      .when(Boolean(this.cmp.state), (e) => e.child(compareView(this.cmp, t, width, { review: true, sending: this.app.sending, selectCommit: (sha, cx) => this.selectSha(sha, cx) })));
  }
}
