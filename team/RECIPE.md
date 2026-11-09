# team

A launcher for the agents that work with you, in four tabs. Start dev opens a
tab running Claude with your `dev-lead` skill on a Jira key and a plan link.
Review MR has a GitLab merge request reviewed into a markdown report. Agents
starts any herdr-core template agent on a repo (in the team tab or a fresh git
worktree, on this Mac or a connected machine). Running lists the team agents
that are live, so you can focus, read, open or stop them.

## What you see

- A floating window, 55% wide and 80% high, titled `Team`. It opens with
  `mod.open:team`, or from the jira mod's Start dev action (Start dev with
  that issue's key and plan link filled in).
- Header, 32px: `Team` in bold, `esc closes` (or `agents` when docked), then
  Reload and `Dock ⌘↵` (`Float ⌘↵` when docked) on the right.
- A tab bar: `Start dev`, `Review MR`, `Agents`, `Running` with a count badge
  that turns the blocked color when an agent is waiting. The selected tab is
  solid; the panel remembers the last one.
- A 22px footer strip on every tab except Running: `<n> running · <n> waiting`
  (waiting in the blocked color when above 0). Clicking it opens Running.
- Text is 12px in JetBrainsMono Nerd Font when installed, else the terminal
  font. From 520px wide, field labels sit left of their field (64px column);
  narrower, they sit above it.
- **Start dev**: "New tab running claude /dev-lead with the Jira key and plan
  link." Fields JIRA (`PROJ-123 (optional)`), PLAN (`https://... plan link
  (optional)`), FOLDER (the workspace root, with `Folder…`, disabled for a
  remote machine), MACHINE (`This Mac` plus each connected machine), and a
  `Start dev` button with the last start or "Opens a tab running the dev-lead
  skill; teammates start later, from the lead." beside it.
- **Review MR**: "mr-reviewer: read-only review of a GitLab merge request; its
  report link shows in Running." Fields MR URL
  (`https://<gitlab-host>/<group>/<project>/-/merge_requests/<iid>`) and FOCUS
  (`optional: what to look at closely`), a `Review` button and "Starts in this
  space's team tab; its Running row gets the report link."
- **Agents**: first the template list from herdr-core, one 28px row each with
  name, description and command. Clicking a row opens its form: a bar with
  `Templates` (back), then MACHINE (`This Mac` and every machine; ones not
  connected are dimmed with their state), ROOTS for a remote machine
  (`~/Project, ~:1` by default, with Rescan), REPO (a filter field, the count
  and source, `Folder…`, and a scrolling list of at most 60 repos), TASK,
  WHERE (`Team tab` or `New worktree`; a remote machine only says "Team tab in
  a <machine> space (worktrees are this Mac only)"), BRANCH for a worktree,
  and `Launch` with the chosen repo as a chip.
- **Running**: one row per live terminal labelled `team=*`: name, template
  chip, status chip, address and age; under it the repo name and path, and
  Focus, IDE, Read, Kill. A finished MR review adds a strip with `Link` (or
  `Report` for a local file), the finding counts, the target, Open and Copy.
  Read shows a card "Screen of <name>" (`hc read --lines 80`) with Copy,
  Refresh, Close and the screen text. With nothing running: "No team agents
  running (terminals labelled team=*)."

## How it behaves

- Status on Running comes from the agent's Claude session file every 3
  seconds: `working` (Claude busy), `idle`, `waiting` (blocked color). Without
  one it shows the terminal's own status, `starting` on this Mac or `unknown`
  on a remote one.
- Settings, read when the window opens (invalid JSON is logged and the
  defaults are used):
  - `<herdr home>/data/workspace.json`: `{ "workspaceRoot": "~/code" }`,
    shared with change-radar; `~` when missing. It is the default FOLDER,
    Review MR's working folder, and the last fallback for the repo list.
  - `data/team/settings.json`:
    - `gitHost` (default empty): Review MR accepts only
      `https://<gitHost>/<group>/<project>/-/merge_requests/<iid>`. Empty
      accepts that GitLab shape on any https host.
    - `planUrlPattern` (default empty): a regex (JavaScript syntax, no
      slashes) a plan link must match; a trailing `/`, `?query` or `#hash`
      is allowed after it. Empty accepts any `https://` link.
- Start dev uses FOLDER (blank means the workspace root; `~` resolves on the
  chosen machine), checks the folder exists there and that
  `~/.claude/skills/dev-lead/SKILL.md` exists on that machine, then opens a tab
  `dev <KEY>` (or `dev <folder name>` without a key) running
  `claude --model opus "/dev-lead <KEY> <URL>"` in a login shell that stays
  open when Claude exits. The lead agent is named `lead-<key>`; it is not a
  team agent, so it does not show in Running. The window closes after a start.
- A bad Jira key or plan link stops Start dev with "Jira key must look like
  PROJ-123, not <key>", "Plan URL must start with https://", or "Plan URL
  does not match planUrlPattern in data/team/settings.json".
- Review MR runs the `mr-reviewer` template in the workspace root, in this
  space's team tab, named `mr-<project>-<iid>`. The task names the MR and,
  when `<workspaceRoot>/<project name>` is a git checkout, that folder for
  reading code. When the agent writes its result file
  `~/.cache/herdr-team/mr-review/<address>.json`, Running shows the link or
  report path.
- Agents prefills the task for `reviewer` ("Review the uncommitted and unpushed
  changes in <repo>") and `tester` ("Write the tests the current changes in
  <repo> need"), else `Work in <repo>: `. The repo list is change-radar's list
  (shared `change-radar.repos`) when it has one, else the repos under the
  focused space's folder, else under the workspace root (3 levels deep).
- Team tab launches go into one tab per space, named `team`. The agent is
  named `<template>-<repo>` (32 characters at most, `-2`, `-3` added when
  taken) and gets the template's instructions, a blank line, then the task.
  A toast says it started, with a click to focus it.
- New worktree checks the branch name (default
  `agent/<template>-<words of repo and task>-<yyMMdd-HHmm>`) is new, opens
  Herdr's worktree dialog to create `~/.herdr/worktrees/<repo>/<branch>`, waits
  for that space and starts the agent there as `<template>-<repo>-wt`, with
  the repo path in the task replaced by the worktree path.
- On a remote machine the template must exist there. If it is missing, a note
  offers `Copy <template> to <machine>` (when you have it locally) and
  `Launch plain claude with the task instead`; skills from plugins the machine
  lacks are named too. Remote repos are scanned under ROOTS (`path` or
  `path:depth`, depth 1 or 2, 15 seconds per root); enter or Rescan saves them
  for that machine.
- With two or more team agents running, Review and Launch first ask "<n>
  agents already running: each is a full Claude session using quota. Start
  another?" with `Start anyway` and `Cancel`. Start dev does not ask.
- Kill asks "Kill and remove?"; Kill stops the terminal and removes it. IDE
  opens the repo in an `open-ide` mod when you have one. Open opens the
  report link or file with the system opener.
- Keys: `1`-`4` switch tab when no field has focus. `escape` dismisses a
  confirm, then closes Read, then leaves the template form, then leaves a
  field, then closes the window. `cmd-enter` docks the panel to the right of
  the focused pane and floats it back; `cmd-shift-t` reopens it as a tab
  named `Team`.

## Built from

- `mod.json`: `place: none`, size 440, focusable, overlay
  `{ kind: "window", key: "team-panel", width: 0.55, height: 0.8 }`, title `Team`.
  No `keys.json`.
- `main.js` (state, commands, launch), `tabs.js` (tab bar, footer, saved tab in
  shared `team.ui`), `keys.js`, `dev.js` + `lead.js` (Start dev), `mr.js`
  (Review MR, result rows), `form.js` (Agents), `running.js`, `data.js`
  (templates, repos, session status, read, kill), `remote.js` +
  `machine-state.js` (machines, roots in shared `team.roots`, remote
  templates), `launch.js` (team tab, worktree, spaces), `agents.js` (template
  parsing, `hc run` arguments, names), `settings.js` (workspace and mod
  settings), `dock.js`, `kit.js`, `tokens.js` (alpha shades), `icons.js`.
- `templates/` (next to this recipe): generic herdr-core templates
  `reviewer`, `tester`, `refactorer` and `mr-reviewer`. Copy them to
  `~/.config/herdr-core/templates/` (ask before replacing one that exists
  and differs); `hc templates --json` then lists them.
- Agent launch: `hc run --bg --json --no-parent --name <n> --cwd <dir> [--on
  <machine>] --label herdr.space=<space> --label herdr.tab=<tab> --label
  team=<template|mr-review> --label team.repo=<repo> --label
  team.template=<template> -- <template command> "<body>\n\n<task>"`. The team
  tab id is `tb-team-<last 12 characters of the space id>`. Start dev uses
  `hc run --keep` without the `team` labels and wraps the command as
  `<shell> -lic '"$@"; exec "$0" -li' <shell> claude --model opus "<message>"`
  in tab `tb-dev-<base36 time>`.
- Commands (`nextCommand`): `dev`, `mr`, `agents`, `running`,
  `section-<tab>`, `focus`, `escape`, `dock`, `float`, `tab`, `refresh`,
  `launch`, `dev-request` (reads shared `team.dev-request` `{ jira, plan }`).
  Props: `section`, `template`, `machine`, `repo`, `task`, `branch`, `where`,
  `plain`, `jira`, `plan`.
- Programs: `hc` (`templates --json`, `machine ls --json`, `run`, `get
  --json`, `read --lines 80`, `kill`, `rm`, `file write --on`), `git`
  (`rev-parse --show-toplevel`, `rev-parse --git-common-dir`, `show-ref`),
  `find`, `test`, `sh` (home, login shell, skill check, repo scan, plugin
  check, also on remote machines), `open`; `claude` through `hc run`.
- Herdr functions: `exec` (with `on`), `hc`, `run` (`tab.new`, `tab.select`,
  `tab.rename`, `space.new`, `agent.focus`, `pane.split`, `pane.focus`,
  `pane.close`, `layout.resize`, `mod.open`), `openOverlay` (shipped `worktree`
  dialog 460x180; `open-ide` window), `closeOverlay`, `readTextFile` (with
  `on`), `pickFolder`, `shared` / `setShared`, `spaces`, `panes`, `focused`,
  `terminals`, `home`, `appHome`, `notify`, `props`, `theme`, `settings`,
  `fonts`.
- Art: Lucide icons (`folder-git-2`, `square-terminal`) in `icons/`, ISC
  license in `icons/LICENSE`.

## Watch out

- Every launch is a full Claude session on the person's quota.
- Requirements: herdr-core's `hc` and its templates in
  `~/.config/herdr-core/templates/*.md`, the `claude` CLI, and for
  mr-reviewer `glab` signed in to your GitLab. The mod itself makes no
  network calls.
- Start dev needs a `dev-lead` skill of your own at
  `~/.claude/skills/dev-lead/SKILL.md`; none ships here. Without it Start dev
  shows "The dev-lead skill is not installed". It receives
  `/dev-lead [KEY] [plan URL]` as its first message.
- Reads outside its folder: `data/workspace.json`, `data/team/settings.json`,
  template files (also on remote machines), `~/.claude/sessions/<pid>.json`
  (also remote), `~/.cache/herdr-team/mr-review/<address>.json` (written by
  mr-reviewer, read for local agents only), the existence of
  `~/.claude/skills/dev-lead/SKILL.md` and
  `~/.claude/plugins/cache/*/<plugin>`, and change-radar's shared
  `change-radar.repos`.
- Writes outside its folder: only a copied template on a remote machine
  (`hc file write`, run through `sh` so `hc` must be on PATH). Worktrees are
  created by the `worktree` dialog, not by this mod.
- For an MR review the repo label is the GitLab project path, not a folder.
- Template commands must be plain words (no quotes, `$`, `;`, pipes) and the
  file must have `---` frontmatter with `command:`.
- Worktrees and `Folder…` are this Mac only. Machines are whatever `hc machine
  ls` lists, minus temporary ones; nothing about a particular machine is built
  in.
- Leftovers that do nothing: `visibility.js`, `kit.targetField`,
  `dock.dockBeside`, icon names `lock` and `issue`, and the unused svgs
  (`book`, `bookmark`, `bug`, `check`, `corner-down-right`, `file`, `lock`,
  `zap`).

## Done when

- `1`-`4` switch between Start dev, Review MR, Agents and Running, and the
  window reopens on the last one.
- Start dev with a Jira key opens a `dev <KEY>` tab whose Claude got
  `/dev-lead <KEY>`; without `~/.claude/skills/dev-lead/SKILL.md` it shows
  "The dev-lead skill is not installed".
- Changing `workspaceRoot` in `data/workspace.json` and reopening shows that
  folder in FOLDER.
- With `gitHost` set, an MR URL on another host shows the paste hint naming
  that host; a real one starts `mr-<project>-<iid>` in the `team` tab, and
  its Running row gets the report when the review finishes.
- With `planUrlPattern` set, a plan link that does not match it stops Start
  dev with the planUrlPattern message.
- An agent launched from Agents shows in Running with its status, the footer
  count rises, and Kill removes it from `hc ls`.
- `cmd-enter` docks the panel beside the focused pane and back.
- `herdr-app check mods/team` passes.
