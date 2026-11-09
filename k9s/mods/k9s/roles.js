import { props, closeOverlay, terminals, theme } from "herdr";
import { killTerminal, startFollow } from "./live.js";
import { livePrompt, askAgent } from "./ask.js";
import { lokiExploreUrl } from "./grafana.js";
import { errorText } from "./kubectl.js";
import { liveBar } from "./views/overlays.js";

export class LiveRole {
  constructor(live) {
    this.live = live;
    this.message = "";
    this.asking = false;
    this.restarting = false;
  }

  init() {}

  lokiUrl() {
    const resource = this.live.kind === "pod" ? "pods" : "deployments";
    return lokiExploreUrl(this.live.context, this.live.namespace, resource, this.live.name);
  }

  openLoki(cx) {
    const url = this.lokiUrl();
    if (url) cx.open_url(url);
  }

  isRunning() {
    return terminals().some((one) => one.address === this.live.address && one.state === "live");
  }

  stopLive(cx) {
    cx.spawn(async (cx) => {
      const error = this.isRunning() ? await killTerminal(this.live.address) : "";
      if (error) {
        this.message = error;
        cx.notify();
        return;
      }
      closeOverlay(props().overlay);
    });
  }

  askLive(cx) {
    this.asking = true;
    this.message = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const prompt = await livePrompt(this.live);
        if (prompt.error) this.message = prompt.error;
        else await askAgent(`${this.live.namespace}/${this.live.name}`, prompt.text, this.live.context);
      } catch (error) {
        this.message = errorText(error);
      } finally {
        this.asking = false;
        cx.notify();
      }
    });
  }

  restart(cx) {
    if (this.restarting) return;
    this.restarting = true;
    this.message = "";
    cx.notify();
    cx.spawn(async (cx) => {
      const { context, namespace, kind, name } = this.live;
      const started = await startFollow({ context, namespace, kind, name }).catch((error) => ({ error: errorText(error) }));
      this.restarting = false;
      this.message = started.error ?? "";
      cx.notify();
    });
  }

  render() {
    return liveBar(this, theme(), this.live);
  }

  async close() {
    if (this.isRunning()) await killTerminal(this.live.address);
  }
}
