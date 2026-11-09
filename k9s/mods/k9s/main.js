import { View } from "gpui-kit";
import { props } from "herdr";
import { Panel } from "./panel.js";
import { LiveRole } from "./roles.js";
import { loadSettings } from "./settings.js";

function roleFor(spec) {
  if (spec?.role === "live" && spec.live) return new LiveRole(spec.live);
  return new Panel();
}

export default class K9s extends View {
  init(_props, cx) {
    this.role = roleFor(props());
    this.role.init(cx);
    cx.spawn(async (cx) => {
      await loadSettings();
      cx.notify();
    });
  }

  render(cx) {
    return this.role.render(cx);
  }

  async close(cx) {
    await this.role.close?.(cx);
  }
}
