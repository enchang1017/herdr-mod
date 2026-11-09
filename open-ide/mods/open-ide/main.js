import { View, div } from "gpui-kit";
import { props, closeOverlay, notify } from "herdr";
import { targetFrom, planFor, openPlan } from "./ide.js";

const RIDER_REMOTE = "Remote machines open in VS Code Remote-SSH; Rider remote is not supported.";

function opened(plan) {
  const body = plan.remote ? `${plan.path}\n${RIDER_REMOTE}` : plan.path;
  notify({ title: `Opened in ${plan.ide}`, body, level: "success", timeout: 4000 });
}

export default class OpenIde extends View {
  init(_props, cx) {
    const overlay = props()?.overlay;
    if (!overlay) return;
    cx.spawn(async () => {
      try {
        const plan = await planFor(targetFrom(props()));
        if (props()?.dryRun) notify({ title: `Open in IDE (dry run): ${plan.ide}`, body: [plan.command, ...plan.args].join(" "), level: "info", timeout: 6000 });
        else opened(await openPlan(plan));
      } catch (e) {
        notify({ title: "Open in IDE failed", body: String(e.message ?? e), level: "error", timeout: 6000 });
      } finally {
        closeOverlay(overlay);
      }
    });
  }

  render() {
    return div().size_full();
  }
}
