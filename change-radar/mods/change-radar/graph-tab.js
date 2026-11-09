import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { focused, panes } from "herdr";
import { graphView } from "./graph-view.js";
import { ciCard } from "./ci-view.js";
import { loadUi, saveUi } from "./ui-state.js";
import { button, chip, icon, ICONS } from "./kit.js";
import { note } from "./ui.js";

const PICKER_ROWS = 200;

function focusedCwd() {
  const f = focused();
  const pane = panes().find((one) => one.pane === f?.pane);
  return (f?.cwd || pane?.cwd || "").replace(/\/+$/, "");
}

export class GraphTab {
  constructor(app) {
    this.app = app;
    this.picking = false;
    this.filter = "";
    this.pickCursor = 0;
    this.repo = null;
    this.input = InputState.new({ placeholder: "filter repos" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.pickCursor = 0; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.selectCursor(cx));
    this.input.on("focus", () => { app.typing = true; });
    this.input.on("blur", () => { app.typing = false; });
  }

  repos() {
    return this.app.radar.repos;
  }

  defaultRepo() {
    const repos = this.repos();
    const saved = loadUi().graphRepo;
    if (saved && repos.includes(saved)) return saved;
    const cwd = focusedCwd();
    const owner = cwd ? this.app.radar.owner(cwd) : null;
    return owner ?? this.app.radar.listed()[0]?.path ?? repos[0] ?? null;
  }

  ensure(cx) {
    if (!this.repo || !this.repos().includes(this.repo)) this.repo = this.defaultRepo();
    if (this.repo && this.app.graph.path !== this.repo) this.app.graph.show(this.repo, cx);
  }

  select(path, cx) {
    this.repo = path;
    this.picking = false;
    this.app.storeError = saveUi({ graphRepo: path }) || this.app.storeError;
    this.app.graph.show(path, cx);
    this.app.handle.focus();
    cx.notify();
  }

  togglePicker(cx) {
    this.picking = !this.picking;
    if (this.picking) { this.pickCursor = Math.max(0, this.matches().indexOf(this.repo)); this.input.focus(); }
    else this.app.handle.focus();
    cx.notify();
  }

  selectCursor(cx) {
    const path = this.matches()[this.pickCursor];
    if (path) this.select(path, cx);
  }

  movePicker(step, cx) {
    const count = Math.min(this.matches().length, PICKER_ROWS);
    if (!count) return;
    this.pickCursor = Math.min(count - 1, Math.max(0, this.pickCursor + step));
    cx.notify();
  }

  pickerKey(key, typing, cx) {
    if (key === "escape") this.togglePicker(cx);
    else if (key === "down" || (!typing && key === "j")) this.movePicker(1, cx);
    else if (key === "up" || (!typing && key === "k")) this.movePicker(-1, cx);
    else if (key === "enter") this.selectCursor(cx);
    else if (!typing && key === "p") this.togglePicker(cx);
    else return false;
    return true;
  }

  matches() {
    const words = this.filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return this.repos().filter((path) => words.every((word) => this.app.radar.name(path).toLowerCase().includes(word)));
  }

  repoBar(t) {
    const info = this.repo ? this.app.radar.info[this.repo] : null;
    return h_flex().flex_none().px(10).py(8).gap(8).items_center().bg(t.surface).border_b(1).border_color(t.border)
      .child(icon(ICONS.repo, 13, t.accent))
      .child(div().flex_shrink(1).min_w(0).truncate().font_bold().text_size(13).child(this.repo ? this.app.radar.name(this.repo) : "No repo"))
      .when(Boolean(info?.branch), (e) => e.child(chip(t, info.branch, t.muted, "outline", ICONS.branch)))
      .child(div().flex_1())
      .child(button("pick-repo", this.picking ? "Close esc" : "Change repo p", t, (_e, cx) => this.togglePicker(cx), { active: this.picking, tooltip: `${this.repos().length} repos under ${this.app.radar.root ?? ""}` }));
  }

  picker(t) {
    const list = this.matches();
    return v_flex().flex_1().min_h(0)
      .child(h_flex().mx(10).my(8).h(28).flex_none().px(8).gap(6).items_center().rounded(6).border_1().border_color(t.accent).bg(t.background)
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(Input.new(this.input).flex_1().h_full().text_size(11.5).text_color(t.foreground)))
      .child(v_flex().id("repo-list").flex_1().min_h(0).overflow_y_scrollbar()
        .when(!list.length, (e) => e.child(note(t, "No repo matches")))
        .children(list.slice(0, PICKER_ROWS).map((path, i) => h_flex().id(`repo-pick-${i}`).h(26).flex_none().px(12).gap(8).items_center().cursor_pointer()
          .when(path === this.repo, (e) => e.bg(t.selected)).when(i === this.pickCursor && path !== this.repo, (e) => e.bg(t.hover))
          .when(i === this.pickCursor, (e) => e.border_l(2).border_color(t.accent)).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.select(path, cx))
          .child(div().flex_1().min_w(0).truncate().text_size(11.5).child(this.app.radar.name(path)))
          .child(div().text_size(10.5).text_color(t.dim).child(this.app.radar.info[path]?.branch ?? "")))));
  }

  render(t, width) {
    if (!this.repo) return v_flex().flex_1().min_h(0).child(this.repoBar(t)).child(note(t, this.app.radar.discovering ? "Finding git repos…" : "No git repos under this folder"));
    const info = this.app.radar.info[this.repo];
    return v_flex().flex_1().min_h(0)
      .child(this.repoBar(t))
      .when(this.picking, (e) => e.child(this.picker(t)))
      .when(!this.picking && Boolean(info?.upstream), (e) => e.child(ciCard(this.app.ci, this.repo, info.branch, t, (_e, cx) => this.app.refreshCi(cx))))
      .when(!this.picking, (e) => e.child(graphView(this.app.graph, t, width, { expandable: true, review: true, sending: this.app.sending })));
  }
}
