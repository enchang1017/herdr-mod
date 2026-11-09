import { v_flex } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { Graph } from "./graph.js";
import { graphView } from "./graph-view.js";
import { monoFont } from "./ui.js";
import { SummaryCache } from "./store.js";

export class GraphWindow {
  constructor(spec, cx) {
    this.on = spec.on ?? null;
    this.path = spec.path;
    this.width = 0;
    this.handle = cx.focus_handle();
    this.graph = new Graph({ on: () => this.on, name: (path) => path.split("/").pop(), cache: new SummaryCache() });
    this.graph.show(this.path, cx);
  }

  keyDown(key, cx) {
    if (key === "escape") {
      if (!this.graph.escape(cx)) closeOverlay(props().overlay);
    } else if (key === "c") this.graph.compareKey(cx);
    else if (key === "x") this.graph.compare.clear(cx);
    else if (key === "j" || key === "down") this.graph.move(1, cx);
    else if (key === "k" || key === "up") this.graph.move(-1, cx);
    else if (key === "enter") this.graph.openCursor(cx);
    else return false;
    return true;
  }

  render(t) {
    return v_flex().id("graph-window").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(12).font_family(monoFont())
      .track_focus(this.handle)
      .on_size_change((size, cx) => { this.width = size.width; cx.notify(); })
      .on_mouse_down("left", () => this.handle.focus())
      .on_key_down((e, cx) => { if (this.keyDown(e.keystroke, cx)) cx.stop_propagation(); })
      .child(graphView(this.graph, t, this.width, { repo: this.path.split("/").pop() }));
  }
}
