import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, exec, notify, openOverlay, run, theme } from "herdr";

const GIT_WINDOW = { mod: "change-radar", kind: "window", key: "change-radar-panel", width: 0.6, height: 0.85 };
const SID = /^[\w-]+$/;

const message = (e) => String(e?.message ?? e);

export const isAgentMenu = (p) => Boolean(p?.agentMenu);

export function openAgentMenu(entry) {
  if (!SID.test(entry.sessionId ?? "")) return;
  openOverlay({ mod: "spaces-agents", kind: "popup", width: 220, height: 41, props: { agentMenu: true, sessionId: entry.sessionId, label: entry.label } });
}

export async function windowOpen(mod) {
  const status = await exec("herdr-app", ["status"]);
  if (status.code !== 0) throw new Error((status.stderr || status.stdout).trim() || `herdr-app status exited ${status.code}`);
  return (JSON.parse(status.stdout).overlays ?? []).includes(mod);
}

export class AgentMenu {
  constructor(p, cx) {
    this.p = p;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  close() {
    closeOverlay(this.p.overlay);
  }

  sessionChanges(cx) {
    const id = this.p.sessionId;
    cx.spawn(async () => {
      let open = false;
      try {
        open = await windowOpen("change-radar");
      } catch (e) {
        notify({ title: "Session changes", body: `Could not read herdr-app status, opening a new Git window: ${message(e)}`, level: "warning" });
      }
      this.close();
      if (open) run(`change-radar.session-${id}`);
      else openOverlay({ ...GIT_WINDOW, props: { tab: "session", sessionId: id } });
    });
  }

  render() {
    const t = theme();
    return v_flex().id("agent-menu").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "escape") this.close();
        else if (e.key === "enter") this.sessionChanges(cx);
        else return;
        cx.stop_propagation();
      })
      .child(h_flex().id("am-session-changes").h(31).px(8).gap(9).rounded(7).items_center().cursor_pointer()
        .bg(t.hover)
        .on_click((_e, cx) => this.sessionChanges(cx))
        .child(div().flex_1().text_color(t.foreground).child("Session changes"))
        .child(div().max_w(90).truncate().text_size(11).text_color(t.dim).child(this.p.label ?? "")));
  }
}
