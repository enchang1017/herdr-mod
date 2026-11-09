# change-radar

A floating window titled Git with three tabs. Change radar lists every git
repo under one folder that has uncommitted, unpushed or unmerged work, with
its merge request and pipeline; open a repo to see its files and diffs,
compare ranges, get a short AI summary, mark it reviewed or hand it to a
reviewer agent. Graph shows one repo's commit history as a lane graph with
its GitLab card, commit detail and two-commit compare. Session shows what
one Claude session (and its subagents) changed, repo by repo, read from its
transcript, plus the pipelines and MR review comments of what it pushed;
CI failures and new comments can go back to that agent with one click, or
by themselves while it is idle.

## What you see

- A window 60% wide and 85% high, title `Git`. Top bar 36px on the
  `chrome` background: `Git` in bold 13px, the tabs `Change radar` /
  `Graph` / `Session` (selected tab on `solid`), and on the right
  `Dock ⌘↵` (`Float ⌘↵` once docked). Monospace throughout: JetBrainsMono
  Nerd Font when installed, else the terminal font.
- **Change radar** header: a radar icon, `Change radar`, a `<n> to review`
  chip (tinted `blocked`, or outlined green at 0), an outlined `<n> changed`
  chip, `scanning <done>/<total>` or `<n> repos`, and Refresh. Under it the
  root folder and where it came from (`space <name>`, `space <name> is at
  home: default`, `no space: default`, `pinned by props`).
- **Repos with changes** card, newest change first. Each row: a review icon
  (hollow circle `accent` = to review, check `ansi2` = reviewed, triangle
  `blocked` = changed since review), the repo path relative to the root,
  its branch, a `reviewing` chip per live reviewer agent (click focuses it),
  the MR chip `!<iid> open|draft|merged|closed` and a `CI` chip colored by
  pipeline status, the age of the last change, and a `Graph` link. Second
  line: `<n>` uncommitted (pencil, `ansi3`), `<n>` unpushed (arrow, `ansi4`),
  `<n>` unmerged (fork, `ansi5`), `<files> files`, `+added −removed`.
  Footer legend: uncommitted, unpushed, unmerged; reviewed, to review.
- **Repo detail** (Enter or click): Back, name, branch chip, review state
  chip; `base origin/master`, `↑ahead ↓behind upstream`; tabs `Changes` /
  `Compare`; buttons Review (primary), the agent-name field (placeholder
  `new session`, hint `→ <address>` when it matches), Walkthrough, Mark
  reviewed / Unmark, Fetch. Then the AI summary box (headline + up to 3
  bullets, `cached`), and cards uncommitted / unpushed / unmerged (first 8
  commits, first 300 files). Clicking a file opens its diff pane at the
  bottom: old/new line gutters, green/red rows, Copy, close.
- **Compare** (in the repo): quick ranges `Unpushed (upstream..HEAD)`,
  `Unmerged (origin/master..HEAD)`, `Working tree vs HEAD`; a `Refs…` field
  taking `a..b`; a 190px Commits list (last 80, Current / All branches)
  where A and B get colored letter chips; then A and B, Swap, the commits
  in range, a file tree, and Diff / AI tabs side by side from 760px wide
  (Files / Diff / AI below that), Copy, AI summary, Review range.
- **Graph** tab: a repo bar (`Change repo p` opens a filter list of every
  repo under the root). When the branch has an upstream, a **GitLab** card
  (max 340px): the MR row, `Pipeline #<id> <status> · <stage>`, stage chips
  with `done/total`, failed jobs that expand to the last 80 log lines with
  Copy and `AI analyze failure`. Below it the graph: Expand, Fetch, Refresh;
  `All branches` / `Current` and a Remotes checkbox; columns GRAPH, COMMIT,
  DESCRIPTION, AUTHOR (from 620px wide), DATE; 26px rows, colored lanes,
  ref chips (HEAD solid, tags, remotes with a cloud), 200 commits a page
  with `Load 200 more`. Selecting a commit shows its message, hash (click
  copies), parents, author, date, changed-file tree, diff and `AI explain`,
  with Compare with…, Compare with HEAD, Compare with working tree.
- **Session** tab header: `Session`, the session button (`<label> · <space
  · tab>`), and on the right three counters `failed` / `running` / `passed`
  (18px bold numbers, colored only when non-zero), an `auto` toggle and an
  info icon. Second row: `Refresh r`, `Summarize s`, `Walkthrough w`,
  `Review`, the agent-name field, then `<n> repos`, `<n> files`, `+/−`.
  A dim line: `1 transcript + <n> subagents · outside git: <n> files ·
  active <age> ago` and how Bash edits are matched.
- The session picker (560 × 340 popup, up to 60 rows): a filter field, then
  sessions grouped by `<space> · <tab>`, `Live outside Herdr`, `Recent`.
  Each row: a live dot (`●` working color, `○` ended), the label, a red or
  spinning icon when its pipelines fail or run, `this terminal`, the first
  prompt and folder, age.
- **PIPELINES** (Session body): any review-comment strips (up to 3), then
  one 232 × 90 tile per repo and branch the session pushed: status icon,
  repo, branch, MR pill `!<iid>` with an unresolved-count badge, an open
  link, a segmented stage bar (hover lists stages), and a status line
  (`failed · <job>`, `running 4m`, `passed 2h ago`, `no pipeline`).
  Clicking a tile opens a drawer: failed jobs with logs, stages, unresolved
  MR comments, the head commit (opens it in Graph), and Send to agent or
  Revive, Open, Copy, Dismiss, or a `sent` / `auto-sent` chip.
- Session repos in cards `DB`, `SERVICE`, `UI`, `TESTS`, `OTHER`. Each repo
  row: caret, name, branch, a spinner while loading, a CI dot, a state chip
  (`uncommitted` `ansi3`, `local` `ansi4`, `pushed` `ansi2`, `not on a
  branch` `ansi1`, `no diff`), `+<n> not attributed`, file count, `+/−`.
  Expanded: the session's commits with their state, its files with state
  and a `via Bash` chip where only a shell command touched them, and a
  `Not attributed` block (other uncommitted files in the repo, first 40).
- **Walkthrough** (Detail or Session): a step list (250px) and the current
  step's title, why, risks, its files and only its hunks, `step n/total`
  with a progress bar, ← p / n →, Regenerate.

## How it behaves

- Root: the focused space's folder (its first terminal's cwd). At home, or
  with no space, it is `workspaceRoot` from
  `<herdr home>/data/workspace.json` (`~` when the file or key is missing).
  Props `repo` (+ `view` radar/detail/graph/compare, `range a..b`) pin one
  repo. Remote spaces run every git command on that machine.
- Settings, read once when the window opens (invalid JSON is logged and
  the defaults are used):
  - `data/workspace.json`: `{ "workspaceRoot": "~/code" }`, shared with the
    team mod.
  - `data/change-radar/settings.json`:
    - `gitHost` (default empty): the GitLab host name, used only in hints
      (`glab is not signed in: run glab auth login --hostname <gitHost>`,
      `<gitHost> is unreachable (VPN or DNS?)`). Empty gives the same hints
      without a host name.
    - `reviewCommand` (default `/review`): the slash command Review sends
      to a named agent and names in the Session review task.
    - `dbRepoPrefixes`, `testRepos`, `frontendRepos` (default `[]`): repo
      name lists for the Session cards. A repo whose name starts with a
      `dbRepoPrefixes` entry (or ends in `.db`) is DB; one named exactly as
      a `testRepos` entry (or starting `e2e.` / `e2e-`) is TESTS; then a
      repo with a `.sln`/`.slnx`/`.csproj` within 2 levels is SERVICE; one
      starting with a `frontendRepos` entry, or whose `package.json`
      depends on vue, nuxt, react, next or react-dom, is UI; the rest OTHER.
      Names compare in lower case.
- Discovery finds `.git` to depth 4, skipping `node_modules`, `bin`, `obj`,
  `.vs`, `.idea`, `dist`, `.nuxt`, `.output`, `.next`; again every 10 min.
  Repos are rescanned 4 at a time on file changes (700ms quiet, at most
  4s), every 5 min, or every 45s when watching fails or the space is remote.
  The base is `origin/master`, `origin/main`, or `origin/HEAD`.
- Opening a repo summarizes it with claude haiku at once (cached by the
  diff, so it reruns only when the diff changes); Regenerate forces it.
  Compare, commit explain and CI failure analysis run only on click.
- Mark reviewed stores a fingerprint of HEAD, branch, status and file
  hashes; any later change turns the icon into `changed since review`.
- Review: with an agent name that matches a live Claude terminal (by
  terminal name, address, Claude session name or tab name) it sends
  `<reviewCommand> <repo> [range]` there and closes the window; otherwise
  it starts a `reviewer` template agent in a `team` tab of the focused
  space. The Session Review sends one task listing every repo, commit and
  file of the session.
- CI on the radar and Graph: for repos with an upstream, MR and latest
  pipeline of the branch, every 20s while running, 60s for the selected
  repo, 5 min for the rest, backing off to 10 min on errors; only while
  the window shows. No glab, not signed in, or GitLab unreachable shows one
  hint and stops until Refresh.
- Session: opens on the Claude session in the focused terminal, else the
  last one picked, else the picker. It reads the transcript and its
  subagents: Edit/Write/MultiEdit/NotebookEdit calls, Bash commands that
  write (redirects, `sed -i`, `tee`, `mv`, `cp`, `git apply`, formatters)
  and the file paths in them, and `git commit` / `git push` output. Commits
  are matched by the hash git printed, or by message and time. A commit
  later rewritten by a rebase is shown as the remote commit with the same
  subject (within a day), so its pipeline is still found.
- Session pipelines: live sessions (and the one shown) are rescanned every
  60s (2 min when hidden); commits from the last 3 days, up to 40 a repo.
  A running pipeline is rechecked every 30s, a missing one for 15 min, open
  MRs every 2 min, missing MRs every 10 min for 6 h. Only one open copy
  polls (45s lease). The sidebar gets a per-session failed/running count.
- A new failed pipeline (up to 3 failed jobs with 40 log lines) or new
  unresolved MR comments become a message for the session that pushed:
  a 10s toast opens the Session tab. Send to agent types it into the live
  terminal; Revive opens `claude --resume <id>` in a new tab with it.
  With `auto` on for that session it is sent by itself, only while the
  agent is idle. Items older than 1 h are not announced.
- Keys: `1` `2` `3` tabs; `j`/`k` or arrows, Enter, `r` refresh, `escape`
  backs out (diff, picker, drawer, view, then closes); `cmd-enter` docks
  beside the focused pane (60%) and floats back; `cmd-shift-t` opens it as
  a tab. Graph: `p` repo, `c` compare, `x` clear, Expand opens an 85% graph
  window. Session: `p` picker, `s`, `w`. Walkthrough: `n`/`p` steps, `j`/`k`
  files, Enter full diff.

## Built from

- Mod `change-radar`, `place: none`, overlay key `change-radar-panel`
  (0.6 × 0.85). No `keys.json`: open it with `mod.open:change-radar`, or
  with props `tab: "session"` (+ `sessionId`), or the command
  `change-radar.session-<id>`. Graph window: same mod, `props.role:
  "graph"`, key `change-radar-graph`.
- `main.js` (state, keys, commands), `shell.js` (root, top bar),
  `settings.js` (workspace and mod settings), `radar.js` + `git.js`,
  `overview.js`, `detail.js`, `ranges.js`, `diff-view.js`, `summary.js`,
  `compare*.js`, `graph*.js`, `commit-detail.js`, `ci.js` / `ci-poll.js` /
  `ci-view.js`, `review.js` + `agents.js` + `target.js`, `session-*.js` +
  `session-list.py` + `session-scan.py` (the repo name lists arrive as a
  JSON argument), `ship-*.js` (pipelines and feedback), `walk*.js`,
  `extras.js`, `store.js`, `pin.js`, `dock.js`, `lease.js` / `once.js`,
  `visibility.js`, `ui-state.js`, `kit.js`, `ui.js`, `icons.js`,
  `tokens.js`.
- Herdr: `exec`, `hc`, `watchFolder`, `readTextFile`, `shared` /
  `setShared`, `spaces`, `panes`, `terminals`, `focused`, `window`,
  `props`, `run` (`pane.focus`, `pane.split`, `layout.resize`, `tab.new`,
  `tab.select`, `tab.rename`, `pane.close`, `mod.open`, `agent.focus`),
  `openOverlay`, `closeOverlay`, `notify`, `nextCommand`, `appHome`, `home`,
  `theme`, `fonts`, `settings`; `fs/promises` for the walkthrough files.
- Commands: `refresh`, `back`, `review`, `summarize`, `mark`, `compare`,
  `graph`, `graph-<repo>`, `graph-compare-*`, `radar-compare-*`, `session`,
  `session-<id|refresh|summarize|pick|open-<repo>>`, `ship-open-<id>`,
  `ship-refresh`, `walkthrough`, `dock`, `float`, `tab`.
- Programs: `git` (read-only flags; `fetch --quiet` on Fetch), `find`,
  `stat -f %m`, `wc -l`, `glab` (`mr list`, `ci list`, `api` GETs only),
  `claude -p` (haiku for summaries; sonnet in the background via `sh` for
  walkthroughs), `python3 -I`, `hc` (herdr-core: `get`, `send`,
  `send --if idle`, `run`), `herdr-app status`.
- Art: 50 Lucide icons in `icons/` under ISC (`icons/LICENSE`).

## Watch out

- Requirements: `git`, `python3`, the `claude` CLI (summaries,
  walkthroughs, agents), herdr-core's `hc` (reviewer agents, Send), and
  `glab` signed in to your GitLab for MR and pipeline cards. Without glab
  the radar still works and shows one hint.
- The Review button without a named agent runs the `reviewer` template from
  `~/.config/herdr-core/templates/reviewer.md` (the team mod ships one).
- AI text (summaries, walkthroughs, CI analysis) is asked for in
  Traditional Chinese (zh-TW) in `summary.js`, `walk-run.js` and
  `ci-poll.js`; change those prompt lines for another language.
- Base `origin/master` / `origin/main`; MR lookup skips `main`, `master`,
  `develop`.
- Reads outside its folder: every repo under the root, `~/.claude/projects`
  (session transcripts and subagents), `~/.claude/sessions/<pid>.json`,
  `~/.config/herdr-core/templates/*.md`, `data/workspace.json`,
  `data/change-radar/settings.json`, `data/session-history/index.json`.
- Writes: `data/change-radar/session-scan-cache.json` (last 300
  transcripts), `data/change-radar/store.json` (reviews),
  `data/change-radar/walk/` (plans, plus temporary
  `.prompt/.system/.out/.err/.code` files), `change-radar.*` shared keys
  (`repos` is read by the team mod, `ship` by a sidebar), and git refs on
  Fetch. It never writes to GitLab.
- Network: Fetch talks to the git remote, glab to GitLab, `claude` sends
  diffs and CI logs to Anthropic (lock, image and `.env`/key files left
  out; 12,000 chars for summaries, 60,000 for walkthroughs).
- Opening a repo detail spends a haiku call when the diff is new.
- `stat -f %m` is the macOS form; the radar's ages fail on GNU stat.
- `exec` stops after 30s: a slow haiku call fails; walkthroughs run
  detached and are polled for up to 14 min.
- Session and pipelines are local only; Send needs the agent in a local
  Herdr terminal with `claude` in the foreground. The auto default is off
  and only the per-session toggle changes it.
- With `workspaceRoot` unset the root at home is `~`, and discovery walks
  4 levels under it: set it to the folder holding your repos.

## Done when

- In a space inside a repo folder, Change radar lists that folder's repos
  with changes and counts matching `git status`; a space at home lists the
  `workspaceRoot` folder from `data/workspace.json`.
- Mark reviewed turns the icon into a check; editing a file in that repo
  shows `changed since review`.
- Graph draws the lanes, Load 200 more extends them, and a branch with an
  MR shows the GitLab card with its pipeline stages.
- With `reviewCommand` set to `/my-review`, Review with a named live agent
  types `/my-review <repo>` into it.
- Session on a Claude terminal lists the repos it edited, a sed-edited file
  with `via Bash`, other dirty files under `Not attributed`, and a tile per
  pushed branch with the right counter; a repo listed in `dbRepoPrefixes`
  lands in the DB card.
- A failed pipeline on a pushed branch shows a toast; Send to agent types
  the message into that terminal, and with `auto` on it arrives only once
  the agent is idle.
- `herdr-app check mods/change-radar` passes.
