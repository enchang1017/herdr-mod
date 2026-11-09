import { div } from "gpui-kit";
import { notify } from "herdr";
import { focusedPlace } from "./target.js";
import { agentName, launchTemplate, liveTeam, nameTab, teamTabId, focusAgent } from "./agents.js";
import { shade } from "./kit.js";
import { reviewCommand } from "./settings.js";

const TEMPLATE = "reviewer";
const TEAM = "review";

const baseName = (path) => path.replace(/\/+$/, "").split("/").pop() || path;

export function reviewTask(path, range) {
  return range ? `Review the commit range ${range} in ${path}` : `Review the uncommitted and unpushed changes in ${path}`;
}

export function reviewText(path, range) {
  return range ? `${reviewCommand()} ${path} ${range}` : `${reviewCommand()} ${path}`;
}

export function reviewersOf(path) {
  return liveTeam().filter((one) => one.labels?.team === TEAM && one.labels?.["team.repo"] === path);
}

export async function startReviewer(path, range, on, cx, why = null, task = null) {
  const space = focusedPlace().space;
  if (!space) throw new Error("No space is focused to hold the team tab.");
  const tab = teamTabId(space);
  const name = agentName(`review-${baseName(path)}`);
  cx.spawn(async (cx) => nameTab(space, tab, cx));
  const result = await launchTemplate({ template: TEMPLATE, team: TEAM, name, cwd: path, repo: path, space, tab, task: task ?? reviewTask(path, range), on });
  notify({
    title: `Reviewer started: ${baseName(path)}`,
    body: [why, result.sent ? `${result.address} in the team tab` : `${result.address} did not take its task yet: open it and check its screen`].filter(Boolean).join(". "),
    level: result.sent ? "success" : "warning",
    timeout: 5000,
    action: { name: "agent.focus", args: { terminal: result.address } },
  });
  return result;
}

export function reviewingChips(path, t) {
  return reviewersOf(path).map((one) => div().id(`reviewing-${one.address}`).flex_none().h(18).px(6).flex().items_center().rounded(5)
    .text_size(10.5).font_semibold().whitespace_nowrap().cursor_pointer()
    .bg(shade(t.working, "soft")).text_color(t.working).hover((s) => s.bg(shade(t.working, "hover")))
    .tooltip(`${one.name ?? one.address} (${one.address}): click to focus`)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click(() => focusAgent(one.address))
    .child("reviewing"));
}
