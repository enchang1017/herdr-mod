# jira

A Jira window driven by the Atlassian CLI (`acli`). Switch between your open
work items, the active sprint as a board with one swimlane per story, your
in-progress and to-do items, recently viewed items, the sprint as a list, or
any JQL. Open an item in a side drawer to read its description, sub-tasks,
links, comments and plan links; move it to another status, assign or
unassign yourself, or comment. Every change to Jira first shows a confirm card
with the exact `acli` command it will run.

## What you see

- A floating window, 75% wide and 80% high (`mod.json` overlay, key
  `jira-panel`, title `Jira`), opened with `mod.open:jira` (`cmd-shift-j` in the
  shipped `keys.json`).
- **Top bar** (44px, `surface`): a 28px `accent` tile with a ticket icon,
  `Jira` with the Jira site under it (`acli` until the site is known), a 150px
  bar split by status category (done `ansi2`, in progress `ansi4`, to do
  `muted`; tooltip with the counts), `updated HH:MM` or a `loading` spinner,
  Refresh `r`, and Dock (Float when docked) `⌘↵`.
- **View tabs**: `MINE`, `BOARD`, `IN PROGRESS`, `TO DO`, `RECENT`, `SPRINT`,
  `JQL`, each with an icon and its digit `1`-`7`; the current one is a solid
  chip with its row count.
- **Filter row**: on `JQL`, a JQL field and Run. Always a fuzzy filter field
  (key, summary, status, assignee, type, priority), `N items` or `M of N`.
- **List views**: a table with 30px rows: type icon, KEY, SUMMARY, STATUS
  pill, priority icon, assignee avatar (initials, color hashed from the name),
  AGE (time since last update, once the item's detail is cached). The
  selected row has an `accent` left border. Hovering a row for 650ms shows a
  card with type, priority, assignee and, once loaded, parent, sprint,
  updated, comment count and plan link count. At most 300 rows are drawn
  (`+N more not drawn`).
- **BOARD view**:
  - Sprint strip (36px): sprint name (`Active sprint` until known), a days
    chip (`Nd left`, `ends today`, `Nd over`; `ansi1` at 1 day or less,
    `ansi3` at 3 or less), the sprint goal (80 characters, full text on hover),
    a 160px progress bar of sub-tasks done (all items when there are no
    sub-tasks), and a collapse/expand-all button `Z`.
  - Filter bar: one chip per label with its count (color hashed from the
    name), the assignees as 22px avatars, `Only mine` `u`, `Clear` `x` while
    a filter is on, and an `L filter keys` hint.
  - Column headers (30px) with counts: `TO DO`, `IN PROGRESS`, `CODEREVIEW`,
    `PENDING RELEASE`, any other status found in the sprint, then `DONE`.
  - One lane per story (every item that is not a sub-task), in sprint rank
    order. The 34px lane header shows a fold chevron, type icon, key,
    summary, status, labels, a 44px done bar with `done/total`, and
    `N sub-tasks` or `no sub-tasks`. A story without sub-tasks shows itself
    as its only card. Sub-tasks whose parent is not in the sprint go to a last
    lane, `No parent / other`.
  - Cards (86px): two lines of summary, labels, then type icon, key (a check
    when done), priority and an 18px avatar. Done cards are dimmed. Hovering
    700ms shows the card's parent, assignee, priority and labels.
  - While sub-tasks are being mapped: `mapping sub-tasks done/total` with a
    160px bar.
- **Drawer**: slides in from the right over the list, half the width (at
  least 440px, leaving 300px for the list); in a window narrower than 760px it
  covers almost everything. Header: a 34px type tile, the key in `accent`,
  the type, close; the summary; chips for status, priority, assignee, sprint
  and parent/epic (click opens it). Buttons in `ansi3`: Status `t`,
  Assign me / Unassign `a`, Comment `m`; then Start dev `d` in `ansi2`, Copy
  key `c`, Copy branch `b`, Open in browser `o`, Reload `r`. Body: Reporter,
  Labels, Created, Updated; a `PLAN` section with one button per
  plan link; `DESCRIPTION` (Jira rich text as plain text, first 12000
  characters); `SUBTASKS`; `LINKS` (with the link type); `COMMENTS`.
- **Action panel** (inside the drawer, `ansi3` tint): a status picker
  (statuses grouped to do, in progress, done, `1`-`9` on the first nine), a
  110px comment box with Review, or the confirm card: title, what changes,
  `RUNS EXACTLY` and the command, Cancel `esc`, Confirm `↵`.
- **Login card** when `acli` has no Jira login: the command
  `acli jira auth login --web`, Copy and Retry.
- **Board and sprint without a project**: BOARD and SPRINT show the error box
  "Set "project" in data/jira/settings.json (for example {"project": "PROJ"})
  to use the board and sprint views." with Retry; the other views work.
- **Footer** (24px): key hints for the current view, or the last message in
  `ansi3` (most clear after 4s).

## How it behaves

- Settings: `<herdr home>/data/jira/settings.json`, read once when the
  window opens, before the first load (invalid JSON or values are logged and
  the defaults are used):
  - `project` (default empty): the Jira project key for BOARD and SPRINT.
    Empty: those two views show the "Set project" error; MINE, IN PROGRESS,
    TO DO, RECENT and JQL work.
  - `boardId` (default empty): the Jira board id, used only for the active
    sprint's name, goal and dates on BOARD (the cards come from JQL). Empty:
    the sprint strip says `Active sprint` with no dates.
  - `planUrlPattern` (default empty): a regex (JavaScript syntax, no
    slashes); every match in an item's description and comments is a plan
    link. Empty: no plan detection, no PLAN section, Start dev hands over
    only the key.
- Opening shows what was cached on disk at once, then refreshes. While the
  window is shown, a list older than 60s reloads; nothing loads while it is
  hidden (window inactive, or its tab or space not shown). `r` forces a
  reload of the list and the open item; picking the current tab again does the
  same.
- Item details for the first 12 rows are fetched ahead, 6 at a time. Details
  stay fresh 5 minutes; opening the drawer refetches when older than 60s.
- `j`/`k` or arrows move; Enter or a click opens the drawer, a second click on
  the same row closes it; moving with the drawer open follows the selection.
  `/` focuses the filter; `1`-`7` switch view.
- `c` copies the key; `b` copies `feature/<KEY>-<slug>` (first 6 words of the
  summary, bracketed text dropped, at most 40 characters); `o` opens
  `https://<site>/browse/<KEY>`. These work on the selected row without the
  drawer; `t`, `a`, `m` need the drawer open.
- **Writes**: `t` loads the statuses seen on up to 100 items of the same
  project and type updated in the last 90 days; picking one, `a`, or Review on
  a comment shows the confirm card. Nothing runs until Confirm or Enter. Then
  a `running acli` spinner; on success a `Jira: <title>: done` toast, the list
  cache is dropped and the item and list reload. A failure stays on the card
  in red. Esc on a comment's confirm card goes back to editing. `a` assigns
  you, or unassigns when you are the assignee.
- **Board**: `h`/`j`/`k`/`l` or arrows move between lane headers and cards
  (keeping the column); Enter opens the drawer; `space` or `z` folds a lane,
  `Z` folds or unfolds all; clicking a lane header selects it and opens the
  story. `[` / `]` move the selected card one column left or right, and
  dragging a card (after 5px) to another column shows a ghost and a dashed
  `accent` target; both open the drawer on the status confirm card for that
  column. `L` puts focus on the filter chips (`h`/`l`/`tab` pick, `space` or
  Enter toggles, `x` clears, `u` mine, Esc leaves). Labels match the card's
  or its story's labels; text filtering matches the card or its story.
  `R` re-maps every story's sub-tasks.
- The board refreshes after 2 minutes; sub-task mapping is redone after 30
  minutes, on `R`, or when a sub-task shows up that no story claims.
- **Start dev** `d`: hands the key and the first plan link to the `team`
  mod's Start dev tab, opening the Team window when it is not open.
- Esc closes, in order: the action panel, a focused field, filter-chip focus,
  the drawer, the filter text, then the window.
- `cmd-enter` docks the window as a pane right of the focused pane (and
  floats it back); `cmd-shift-t` opens it as its own tab named `Jira`.
- Commands from `keys.json` (`jira.<name>`): `focus`, `refresh`, `escape`,
  `dock`, `float`, `tab`, `down`, `up`.
- The view, JQL, drawer width, selection, board filters and folded lanes are
  kept in shared state `jira.ui`; dragging the drawer edge resizes it (at
  least 360px), double-click resets it.

## Built from

- One mod, `mods/jira/`, no layout. `main.js` is the view; `views/` draw it
  (`header.js`, `table.js`, `drawer.js`, `drawer-body.js`,
  `action-panel.js`, `board.js`, `board-header.js`, `board-card.js`,
  `widgets.js`).
- `acli.js` runs every call as `exec("acli", args)`. Reads:
  - `acli jira auth status` (the `Site:` line gives the site);
  - `acli jira workitem search --jql <jql> --fields issuetype,key,assignee,priority,status,summary --json --limit <n>`;
  - `acli jira workitem view <KEY> --fields *navigable,comment --json`;
  - `acli jira board list-sprints --id <boardId> --state active --json`
    (skipped without `boardId`);
  - board items and per-story `parent = <KEY>` searches with
    `--fields issuetype,key,summary,status,assignee,priority,labels --limit 200`,
    20 at a time;
  - `acli jira workitem view <KEY> --web` to open an item when the site is
    unknown.
- View JQL (`queries.js`): MINE `assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`;
  IN PROGRESS / TO DO the same with `statusCategory = "In Progress"` / `"To Do"`;
  RECENT `issuekey in issueHistory() ORDER BY lastViewed DESC`;
  BOARD and SPRINT `project = <project> AND sprint in openSprints() ORDER BY Rank ASC`
  (limits 50, SPRINT 100, BOARD 200). An empty JQL field runs MINE's JQL.
  `settings.js` reads the settings file.
- Writes (`writes.js`), the only commands that change Jira:
  - `acli jira workitem transition --key <KEY> --status <name> --yes`
  - `acli jira workitem assign --key <KEY> --assignee @me --yes`
  - `acli jira workitem assign --key <KEY> --remove-assignee --yes`
  - `acli jira workitem comment create --key <KEY> --body <text>`

  The confirm card shows `argvText(plan)`, the same argv shell-quoted.
- `data.js` holds the in-memory caches (lists 60s, details 5 min, statuses
  10 min); `disk-cache.js` writes them to `data/jira/cache.json`
  (`version: 2`, newest 20 lists and 60 details, site, your display name, the
  board) at most once a second. `board-data.js`, `board-model.js`,
  `board-nav.js`, `board-layout.js`, `board-controller.js`, `board-keys.js`
  build and drive the board; `keys.js` the rest of the keys.
- `text.js`: Jira rich text to plain text, plan link detection, sprint and
  parent fields, branch names. `fuzzy.js`: the filter.
- `devlink.js`: sets shared `team.dev-request` to `{ jira, plan, at }`, runs
  `herdr-app status` and, if `team` is among its overlays, `run("team.dev-request")`;
  otherwise `openOverlay` for mod `team` (window `team-panel`, 55% x 80%) with
  props `section: "dev"`, `jira`, `plan`.
- `dock.js`: `pane.split` (right, weights 1 and 0.6), `pane.focus`,
  `tab.new`, `tab.select`, `mod.open`, `pane.close`, `closeOverlay`.
- Herdr functions: `exec`, `appHome`, `readTextFile`/`writeTextFile`,
  `shared`/`setShared`, `run`, `openOverlay`/`closeOverlay`, `notify`,
  `nextCommand`, `props`, `panes`, `spaces`, `focused`, `window`, `theme`,
  `settings`, `fonts`. Text uses JetBrainsMono Nerd Font when installed,
  otherwise the person's font.
- Art: Lucide icons in `mods/jira/icons/`, ISC license in
  `icons/LICENSE`.

## Watch out

- Requirement: the Atlassian CLI `acli`; it is the only network access.
  `acli` must be on the PATH Herdr's `exec` sees (the login shell's), and
  logged in with `acli jira auth login --web`. Without it the window shows
  `cannot run acli` or the login card. `o` uses macOS `open`.
- The Jira site is not in the code: it comes from `acli jira auth status`
  and is cached. Project, board id and plan link pattern come from the
  settings file. Still built in: the board's fixed columns `To Do`,
  `In Progress`, `CodeReview`, `PENDING RELEASE`, `Done` (`board-model.js`;
  other statuses get their own column), and the epic-link field
  `customfield_10014` as a fallback parent.
- `devlink.js` assumes the `team` mod from this folder: overlay key
  `team-panel`, a `dev-request` command, shared `team.dev-request`, and
  `herdr-app status` printing JSON with an `overlays` list. Without `team`,
  Start dev opens nothing useful.
- acli quirks the code handles: some errors are printed on stdout with exit
  code 0 (a line starting `✗ Error:` counts as a failure); JSON can follow
  other text (parsing starts at the first `[` or `{`); search output may be an
  array, `{issues}` or `{workItems}`. There is no transition list: the status
  picker offers statuses sampled from recent items, and Jira refuses a status
  the workflow cannot reach (the error shows on the confirm card).
- "You" are learned as the assignee name on the newest item assigned to
  `currentUser()`; with no such item, `Only mine` stays disabled and `a`
  always offers Assign me.
- First board open runs one `acli` search per story (20 in parallel).
- Outside its folder it reads `data/jira/settings.json` and writes
  `data/jira/cache.json` under the Herdr home, the clipboard, and shared
  state `jira.ui` and `team.dev-request`. The cache holds issue summaries,
  descriptions and comments.
- Limits: comments up to 30000 characters, plain text only; 300 table rows
  drawn; keys must match `^[A-Z][A-Z0-9]+-\d+$` before any write or view.
- Icons load from `mods/jira/icons/<name>.svg`: renaming the folder means
  changing that path in `views/widgets.js`.

## Done when

- `herdr-app check mods/jira` passes and `mod.open:jira` opens the window.
- With `acli` logged out, the login card shows `acli jira auth login --web`;
  after logging in and Retry, MINE lists items and the top bar shows the site.
- `t` on an item and a status shows a confirm card reading
  `acli jira workitem transition --key <KEY> --status <name> --yes`; Esc
  cancels and the item is unchanged in Jira.
- Without `project`, BOARD shows the "Set project" error and MINE still
  lists items; with `project` (and `boardId`) set,
  BOARD shows the active sprint's name, one lane per story with its
  sub-tasks in status columns; dragging a card to another column, or `]`,
  opens the same confirm card.
- Closing and reopening the window shows rows before the spinner finishes,
  and `data/jira/cache.json` exists.
- `d` opens the Team window on Start dev with the key filled in, and the
  plan link when `planUrlPattern` matches one in the item.
