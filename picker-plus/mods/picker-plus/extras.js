import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, focused, hc, home, openOverlay, panes, readTextFile, run } from "herdr";

const MOD_ENTRIES = [
  { mod: "k9s", label: "k9s", hint: "Kubernetes, read-only", words: "k9s kubernetes kubectl pods logs" },
  { mod: "orbit", label: "Orbit", hint: "local dev env: resources, logs, traces", words: "orbit local dev env resources services logs traces daemon" },
  { mod: "change-radar", label: "Git changes", hint: "change radar, graph", words: "git changes change-radar radar graph review" },
  { mod: "change-radar", label: "Git \u{b7} Session changes", hint: "what this Claude session changed", words: "git session changes claude commits pushed transcript review", gitSession: true },
  { mod: "session-history", label: "Session history", hint: "past Claude sessions \u{b7} \u{2318}Y", words: "session history claude past resume transcripts search" },
  { mod: "team-dev", label: "Team \u{b7} Start dev", hint: "kick off a feature with a lead agent", words: "team start dev lead kickoff feature", section: "dev" },
  { mod: "team-mr", label: "Team \u{b7} Review MR", hint: "a colleague's merge request", words: "team review mr merge request gitlab colleague", section: "mr" },
  { mod: "team-agents", label: "Team \u{b7} Agents", hint: "launch a template agent", words: "team agents templates reviewer tester refactorer worktree launch", section: "agents" },
  { mod: "team-running", label: "Team \u{b7} Running", hint: "live team agents: read, focus, kill", words: "team running live agents status kill read", section: "running" },
  { mod: "jira", label: "Jira", hint: "work items: status, assign, comment, start dev \u{b7} \u{2318}\u{21e7}J", words: "jira issues work items tickets assigned sprint transition comment start dev acli" },
  { mod: "open-ide", label: "Open in IDE", hint: "focused folder: Rider (.NET) or VS Code \u{b7} \u{2318}\u{21e7}E", words: "open ide editor rider vscode vs code folder project solution" },
];

const TEAM_WINDOW = { mod: "team", kind: "window", key: "team-panel", width: 0.55, height: 0.8 };
const GIT_WINDOW = { mod: "change-radar", kind: "window", key: "change-radar-panel", width: 0.6, height: 0.85 };
const PICKABLE = new Set(["mod", "ctx", "new", "space"]);

export const EXTRA_HEIGHTS = { mod: 32 };

export const isPickable = (r) => PICKABLE.has(r.kind);

export function extraRows(filter) {
  return MOD_ENTRIES.filter((m) => !filter || `${m.label} ${m.words}`.toLowerCase().includes(filter)).map((m) => ({ kind: "mod", ...m }));
}

async function windowOpen(mod) {
  try {
    const status = await exec("herdr-app", ["status"]);
    return status.code === 0 && (JSON.parse(status.stdout).overlays ?? []).includes(mod);
  } catch (e) {
    console.log(`picker-plus: could not read herdr-app status: ${e.message ?? e}`);
    return false;
  }
}

async function focusedSessionId() {
  const f = focused();
  const address = f?.terminal ?? panes().find((p) => p.pane === f?.pane)?.terminal;
  if (!address || address.includes("/")) return null;
  try {
    const got = await hc(["get", address, "--json"]);
    const fg = got.code === 0 ? JSON.parse(got.stdout).foreground : null;
    if (!fg?.pid || !(fg.argv?.[0] ?? "").split("/").pop().startsWith("claude")) return null;
    const id = JSON.parse((await readTextFile(`${home()}/.claude/sessions/${fg.pid}.json`)) ?? "{}").sessionId;
    return typeof id === "string" && /^[\w-]+$/.test(id) ? id : null;
  } catch (e) {
    console.log(`picker-plus: could not read the focused Claude session: ${e.message ?? e}`);
    return null;
  }
}

function teamSection(section, close, cx) {
  cx.spawn(async () => {
    const open = await windowOpen("team");
    close();
    if (open) run(`team.section-${section}`);
    else openOverlay({ ...TEAM_WINDOW, props: { section } });
  });
}

function gitSession(close, cx) {
  cx.spawn(async () => {
    const [id, open] = [await focusedSessionId(), await windowOpen("change-radar")];
    close();
    if (open) run(id ? `change-radar.session-${id}` : "change-radar.session");
    else openOverlay({ ...GIT_WINDOW, props: { tab: "session", ...(id ? { sessionId: id } : {}) } });
  });
}

export function goExtra(r, close, cx) {
  if (r.gitSession) return gitSession(close, cx);
  if (r.section) return teamSection(r.section, close, cx);
  close();
  run("mod.open", { name: r.mod });
}

export function extraRow(r, on, t, pick) {
  return h_flex()
    .id(r.gitSession ? "pk-mod-change-radar-session" : `pk-mod-${r.mod}`)
    .mx(4)
    .px(10)
    .h(32)
    .rounded(7)
    .gap(10)
    .items_center()
    .cursor_pointer()
    .when(on, (el) => el.bg(t.hover))
    .hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => pick(cx))
    .child(div().w(12).flex_none().text_color(t.accent).child("\u{25b8}"))
    .child(div().flex_1().truncate().text_color(t.foreground).child(r.label))
    .child(div().text_size(11).text_color(t.dim).child(r.hint));
}
