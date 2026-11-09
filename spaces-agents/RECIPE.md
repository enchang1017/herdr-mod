# spaces-agents

One sidebar instead of Herdr's separate Spaces and Agents lists: each machine,
its spaces, each space's tabs, and the agents in them with their status,
context use, CI state and age, then your Claude quota at the bottom. Claude
sessions whose tab was closed stay listed under "Lost agents" so you can
revive them, a whole team at a time, or reopen the last closed tab with
`cmd-alt-t`. It also turns JSON files dropped into the inbox folder into
toasts, folds teammate panes like an accordion, and warns when the built-in
mod it was cloned from changes. Ships with the `spaces-agents` layout.

![spaces-agents](preview.png)

## What you see

- Left sidebar, 268px on the `chrome` background: the shipped
  `workspace-chrome` header (46px), this mod, the `workspace-chrome` footer
  (69px). To the right: `tabs` (42px), the active tab's panes (each with a 30px
  `pane` header, radius 10, gap 8), a hidden 368px `files` / `changes` panel,
  and `workspace-status` (28px).
- Header (31px): `Spaces & Agents`, a `!` in `blocked` color when something
  failed (hover shows every error), then three 26px icon buttons: show or hide
  plain shells (`terminal` / `square` icon), the teammate accordion (`layers`,
  tooltip says on or off), `+` new space.
- One section per machine when remote machines exist: `This computer` and each
  machine from `hc machine ls` (temporary ones left out). Each header has a
  monitor or server icon, the state (`asleep`, `unreachable`...) when not
  connected, `+` (new space there), a 6px dot (`ansi2` connected, `dim`
  otherwise) and a fold chevron. A machine that was replaced shows
  `rebuilt · Connect`. An empty machine shows `New space there`; one still
  loading shows `Loading…`.
- Space rows (30px): an 18px letter badge in the space's color (from shared
  `space.colors`, the same one the Picker uses; palette `#22a99a`, `#e3814f`,
  `#5b8def`, `#8b7cf6`, `#3fae6a`, `#d9649a`), the name, then
  `<repo> · <branch>` (repo hidden when it equals the name, branch hidden for
  `main` / `master` or when it equals the name), `↑n` in `ansi2`, `↓n` in
  `ansi1`, and a fold chevron. A git worktree of a repo that already has a
  space sits under it (28px, `├─` / `└─`, branch icon instead of the badge).
  Folded, a 7px dot shows the most urgent agent status.
- Tab rows (24px): chevron, the tab name (`Tab 2` for numeric names). Folded,
  the agent count and a status dot.
- Agent rows (42px): `├` / `└`, the program icon, the agent's name; second line:
  a status chip, `ctx <n>%` (turns `working` color at 85% and up), a CI chip
  when change-radar tracks a branch for that session, and the time since the
  status last changed (`<1m`, `12m`, `3h`, `2d`). The focused pane's row has the
  `selected` background. Plain programs and shells are 24px rows with no
  second line.
- `Lost agents · <n>` (folded by default): `Revive all` and a chevron; open,
  one group per tab (`<space> · <tab>`, `Revive tab`), and per agent: Claude
  icon, name, how long ago it was seen, `lead` / `teammate` / machine / folder,
  and `Revive`, `Fork`, `Dismiss` buttons.
- Footer: `Claude quota` with `5h` and `week` bars (4px, `accent`, `working`
  from 80%, `blocked` from 95%), percent and reset time (`14:00`,
  `Fri 09:00`), and `updated <n>m ago`; the block fades to 55% after 30 min.
  Without data it reads `no data yet — open a Claude session`.
- Narrower than 160px it draws a compact rail: each space's number and a `·`
  or `●` in its status color.

## How it behaves

- Status chips, in the theme's status color on a 15% tint of it:
  - working: `working` (amber).
  - blocked: `waiting`; the hover tooltip adds what it waits for.
  - done: `done`.
  - idle: `idle` (grey).
  - Status comes from Herdr's agent list first; for Claude it falls back to
    `~/.claude/sessions/<pid>.json` (`busy` -> working, `idle`, `waiting` ->
    blocked). Folded rows show the most urgent one: blocked over done over
    working over idle.
- When a Claude session that Herdr does not track goes from working to idle in
  a tab you are not looking at (or the window is in the background), it plays
  the `done` sound (when sounds are on) and shows `Claude · <name>` /
  `Finished its turn` for 5s; clicking it focuses that pane.
- Click a space row to select it, a tab to select it, an agent or program to
  focus its pane. Drag a space onto another of the same machine to reorder; a
  2px `accent` line shows where it lands. Right-click a space for Herdr's space
  menu. Chevrons fold spaces and tabs (tabs with agents start open); clicking a
  machine header folds it. New spaces appear once their git info is in, or
  after 1.5s.
- Right-click an agent that has a Claude session: a 220px popup with
  `Session changes` (Enter or click, Esc closes) opens change-radar's session
  tab for it, in the open change-radar window or a new one.
- CI chip: a spinner and `CI` (`CI 2` for two branches) in `working` color
  while CI runs, `✕ CI` in `ansi1` when it failed; click opens change-radar's
  Ship tab for that session.
- Agent names: a team lead shows as `lead` (or `lead · <name>`), a teammate by
  its `team` label, otherwise the terminal name, a renamed Claude session name,
  or the folder name. A trailing `-<key>-<n>` matching a ticket key in the tab
  name is cut off.
- Lost agents: every Claude session seen in a local pane is recorded. One
  whose process is gone and whose transcript still exists is lost. `Revive`
  runs `claude --resume <id>` in a new terminal in the same folder, space and
  tab (recreated and renamed when gone); `Fork` adds `--fork-session` and a
  `-fork` name. `Revive tab` and `Revive all` ask `Revive <n> agents?` first
  (Confirm, Cancel, Esc, or it cancels itself after 10s); a lead comes back
  with its teammates stacked in a column to its right. Agents on offline
  machines are greyed out. `Dismiss` forgets an entry.
- `cmd-alt-t` (`spaces-agents.reopen-tab`) revives the most recently lost tab
  with no confirm, with a toast saying how many agents; a toast explains when
  there is nothing to reopen, a revive is running, or the machine is offline.
- Inbox: watches `<app home>/inbox/` (and checks every 10s). Each
  `<unix-ms>-<name>.json` with `{title, body, level, focus}` becomes a toast
  (clicking focuses the `focus` terminal when it is live) and the file is
  removed; more than 5 at once fold into one `<n> more notifications` toast. A
  `success` note plays the `done` sound. An invalid file becomes a warning
  toast.
- Accordion (on by default; layers button or `spaces-agents.accordion`): in a
  tab with a lead pane and one column of teammates beside it, the column is 30%
  wide while the lead is focused; focusing a teammate makes it 50% and folds
  the other teammates to 30px. Turning it off splits evenly.
- Health check at start: runs `herdr-app check` on itself and, when it is
  installed, `picker-plus`, and compares the built-in `spaces` (and `picker`
  when `picker-plus` is there) with a snapshot. A
  failure is an error toast, a changed built-in a warning toast `Update
  available for <clone>`; clicking either opens a tab `fix with claude` that
  starts Claude with a prompt to fix or three-way-merge the clone. It
  rechecks every 60s while a problem remains.

## Built from

- Layout `layouts/spaces-agents.json` (cloned from `main` 0.1.12): `root` row
  (background `canvas`, terminal padding 14/12, 1px `border` dividers, no
  titlebar, traffic lights at 12,16):
  - `sidebar` column, 268px (min 44, max 480, not resizable, `chrome`):
    `brand` block `workspace-chrome` 46px (window drag), `sidebar-lists`
    column with `spaces` block `spaces-agents` (weight 1, min 90),
    `sidebar-footer` block `workspace-chrome` with `props: {footer: true}`
    69px.
  - `work` column: `tabs` block 42px (window drag), `work-body` row (padding
    8, gap 8) with `main` (active tab; pane header `pane` always shown, 30px,
    top; `background`, 1px `border`, 1px `accent` focus, radius 10, gap 8,
    `lone`) and `panel` column 368px (min 280, max 900, hidden) holding a
    `stack` of `files` and `changes`; `status` block `workspace-status` 28px.
- `keys.json`: `global` `cmd-alt-t` -> `spaces-agents.reopen-tab`.
- `mods/spaces-agents/` (`mod.json`: `place: none`, title `Spaces & Agents`,
  cloned from `spaces` 0.1.12). No props in the sidebar; `props.agentMenu`
  (with `sessionId`, `label`) makes the same mod render the agent popup.
  - `main.js`: timers 250ms new spaces and git, 3s tick (foreground query every
    tick while the window is active, every 15s otherwise), 15s machines, 30s
    quota and age repaint; commands `accordion` and `reopen-tab`.
  - `tree.js`, `rows.js`: tab tree, agent rows, chips, space rows, drag,
    compact rail. `ship-chip.js`: CI chip from shared `change-radar.ship`
    (`{[sessionId]: {state, count}}`). `agent-menu.js`: the popup.
  - `claude.js`: `hc get <terminal> --json` (cached 60s) to find a `claude*`
    foreground process, then `~/.claude/sessions/<pid>.json`, watched.
  - `registry.js`, `tombstones.js`, `transcript.js`: lost-agent registry
    `<app home>/data/spaces-agents/sessions.json` (version 1, `sessions` and
    `removed`); merges with the file on write conflicts; liveness every 15s
    with `kill -0` and a transcript check; entries go after 7 days or 2 min
    without a transcript; dismissals are kept 30 days.
  - `lost-view.js`, `revive.js`, `team.js`: the section and reviving
    (`hc run --bg --json --no-parent|--parent <lead> --name <free name>
    --cwd <dir> [--on <machine>] --label herdr.space=… --label herdr.tab=…
    [--label team=… --label team.template=…] -- claude --resume <id>
    [--fork-session]`), then `herdr-app do terminal.keep` (right, then down),
    `pane.focus` and `layout.resize` to stack teammates.
  - `health.js`: `herdr-app check`, a sha256 of each built-in mod folder
    (`find`, `shasum`), `rsync` snapshot under
    `<app home>/data/spaces-agents/upstream/`, `upstream.json`.
  - `machines.js` (`hc machine ls|rm|add`, fold and reconnect state in
    `localStorage`), `git.js` (`git status --porcelain=v2 --branch`,
    `rev-parse`, watches local repos), `usage.js`, `inbox.js`, `accordion.js`
    (`hc connect` `doc.get`, then `layout.resize`), `util.js`.
- Shipped mods used: `workspace-chrome` (also its `terminal`, `square`,
  `layers`, `plus`, `chevron-*`, `branch`, `server`, `monitor` icons), `tabs`,
  `pane`, `files`, `changes`, `workspace-status`, `menu` (space menu). Optional:
  `change-radar` (session changes, Ship, CI chip).
- Herdr functions: `agents`, `spaces`, `panes`, `terminals`, `machines`,
  `focused`, `layout`, `window`, `theme`, `props`, `settings`, `shared` /
  `setShared`, `setAgentOrder`, `nextCommand`, `notify`, `playSound`,
  `openOverlay` / `closeOverlay`, `watchFolder`, `readTextFile` /
  `writeTextFile`, `home`, `appHome`, `exec`, `hc`; `fs/promises`.
- Commands: `space.select`, `space.new`, `space.move`, `space.rename`,
  `tab.select`, `tab.rename`, `tab.new`, `pane.focus`, `layout.resize`,
  `terminal.keep`, `change-radar.session-<id>`, `change-radar.ship-open-<id>`.
- Programs: `hc`, `git`, `sh`, `herdr-app` (`status`, `check`, `do`),
  `claude`, `find`, `shasum`, `rsync`, `kill`; the statusline tee uses `jq`.
- `statusline/statusline-herdr-tee.sh` (optional, see `INSTALL.md`): Claude
  Code's statusline command; writes `~/.claude/herdr-usage/latest.json`
  (`rate_limits`) and `sessions/<id>.json` (`context_window`, model), then
  runs the command in `next-statusline` if present.

## Watch out

- Reads outside its folder: `~/.claude/sessions/`, `~/.claude/herdr-usage/`,
  and checks transcripts exist under `~/.claude/projects/` (never reads
  them). Writes `<app home>/data/spaces-agents/` and deletes the files in
  `<app home>/inbox/` it showed.
- Runs programs: every `claude` revive resumes a full session (cost and
  quota); the health toast's fix starts Claude with edit instructions in the
  app home. `herdr-app do` drives panes during a team revive.
- The health check covers a `picker-plus` clone only when `mods/picker-plus`
  exists; without it that pair is skipped silently (optional companion, the
  `picker-plus` folder in this repo). It snapshots the
  built-in mods on first run, so the first run never reports an update.
- Status for Claude comes from `~/.claude/sessions/<pid>.json`, so only local
  terminals get it; Claude on a remote machine shows only what Herdr reports.
  Only Claude sessions are tracked as lost; plain terminals are not restored.
- The session-changes popup and CI chip need a `change-radar` mod that writes
  shared `change-radar.ship` and answers `change-radar.session-<id>` /
  `ship-open-<id>`; without it the chip never shows and the popup opens an
  empty window.
- Team handling expects Herdr-core teams: teammates carry a `team` label (and
  `team.template`) and a `parent` terminal. Name trimming expects ticket keys
  like `ABC-123` in tab names.
- The accordion resizes panes in the focused tab whenever focus moves; turn it
  off when arranging panes by hand. It skips zoomed tabs and remote tabs.
- Quota and `ctx %` need the statusline tee (and `jq`) installed in Claude
  Code's `statusLine`.

## Done when

- A Claude agent in a tab shows under its space with `working` while it runs
  and `idle` after, and `ctx <n>%` once the statusline tee wrote its session
  file; finishing in a background tab gives a `Finished its turn` toast.
- Closing a tab with a Claude agent lists it under `Lost agents` within 15s;
  `cmd-alt-t` brings it back in a tab of the same name, and `Revive tab` on a
  lead with teammates restores the stacked column.
- Writing `{"title":"t","body":"b","level":"success","focus":null}` to
  `inbox/<ms>-test.json` shows a toast and the file disappears.
- `herdr-app check mods/spaces-agents` passes and `layout.switch --name
  spaces-agents` shows it in the sidebar.
