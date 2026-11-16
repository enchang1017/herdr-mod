import * as fs from "fs/promises";
import { appHome, exec, run, openOverlay, setShared } from "herdr";
import { KEY, errorText } from "./acli.js";

const TEAM_WINDOW = Object.freeze({ mod: "team", kind: "window", key: "team-panel", width: 0.55, height: 0.8 });
const REQUEST_KEY = "team.dev-request";

async function windowOpen(mod) {
  const status = await exec("herdr-app", ["status"]);
  if (status.code !== 0) throw new Error(`herdr-app status exited ${status.code}`);
  return (JSON.parse(status.stdout).overlays ?? []).includes(mod);
}

export async function startDev(issue) {
  if (!KEY.test(issue.key)) throw new Error(`Not a Jira key: ${issue.key}`);
  if (!(await fs.exists(`${appHome()}/mods/team/main.js`))) throw new Error("Start dev requires the Team mod, which is not installed.");
  const request = Object.freeze({ jira: issue.key, plan: issue.plan?.[0] ?? "", at: Date.now() });
  setShared(REQUEST_KEY, request);
  const open = await windowOpen("team").catch((e) => {
    console.log(`jira: could not read herdr-app status: ${errorText(e)}`);
    return false;
  });
  if (open) run("team.dev-request");
  else openOverlay({ ...TEAM_WINDOW, props: { section: "dev", jira: request.jira, plan: request.plan } });
  return request;
}
