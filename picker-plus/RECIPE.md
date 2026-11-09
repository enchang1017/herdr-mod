# picker-plus

Herdr's "Go to…" picker with the other windows of this setup on top. One
`cmd-p` popup jumps to a tab, a space or an agent, starts a new one, or opens
k9s, Orbit, Git changes, this session's changes, Session history, the four
Team tabs, Jira or Open in IDE.

![picker-plus](preview.png)

## What you see

- A popup at the top of the window, 640px wide, 40px from the top, up to 80%
  high (`mod.json` overlay `popup`, `at: "top"`, `offset: 40`), opened with
  `mod.open:picker-plus` (`cmd-p` in the shipped `keys.json`).
- `Go to…` (15px, semibold) and a dim `Esc` on the first line, then a 36px
  search field with an accent border and a search icon
  (`Go to a tab, space or agent…`).
- Eleven fixed rows first, 32px each: an accent `▸`, the label, and a dim 11px
  hint on the right.

  | Label | Hint | Opens |
  |---|---|---|
  | `k9s` | Kubernetes, read-only | `k9s` |
  | `Orbit` | local dev env: resources, logs, traces | `orbit` |
  | `Git changes` | change radar, graph | `change-radar` |
  | `Git · Session changes` | what this Claude session changed | `change-radar`, session tab |
  | `Session history` | past Claude sessions · ⌘Y | `session-history` |
  | `Team · Start dev` | kick off a feature with a lead agent | `team`, section `dev` |
  | `Team · Review MR` | a colleague's merge request | `team`, section `mr` |
  | `Team · Agents` | launch a template agent | `team`, section `agents` |
  | `Team · Running` | live team agents: read, focus, kill | `team`, section `running` |
  | `Jira` | work items: status, assign, comment, start dev · ⌘⇧J | `jira` |
  | `Open in IDE` | focused folder: Rider (.NET) or VS Code · ⌘⇧E | `open-ide` |

- Then Herdr's own picker: a heading per space (an 18px rounded badge in the
  space's color with its first letter, then its name), its tabs with a status
  glyph (a spinning arc while working, `●` in the status color, `○` idle, `·`
  none), `needs you` / `finished` on blocked / done tabs, and the agents'
  program names plus `+N` for their team. Spaces with an agent running come
  first, blocked ones on top; quiet spaces fold into
  `earlier: N quiet spaces ▾`. Last: `+ new tab`, `+ new space`, and
  `+ new space on <machine>` per connected machine.
- The list is at most 320px high and scrolls.

## How it behaves

- It opens with the current tab selected. Typing filters everything: the
  eleven rows by label plus keywords (for example `kubectl`, `traces`,
  `transcript`, `acli`, `rider`), tabs by space, tab and program name. Typing
  also unfolds `earlier`.
- `↑`/`↓` move (wrapping), Enter or a click goes, `ctrl-d` closes the selected
  tab, `Esc` closes the popup. The wheel scrolls and drags the selection along.
- `k9s`, `Orbit`, `Git changes`, `Session history`, `Jira`, `Open in IDE` close
  the popup and run `mod.open` for that mod.
- A Team row: if the Team window is open (checked with `herdr-app status`) it
  runs `team.section-<name>`, otherwise it opens the Team window
  (`team-panel`, 55% x 80%) with `props.section`.
- `Git · Session changes`: finds the Claude session in the focused terminal
  (its foreground program starts with `claude`; the id comes from
  `~/.claude/sessions/<pid>.json`). If the change-radar window is open it runs
  `change-radar.session-<id>` (or `change-radar.session` without an id),
  otherwise it opens it (`change-radar-panel`, 60% x 85%) with
  `props.tab: "session"` and `sessionId`.

## Built from

- A clone of Herdr's shipped `picker` mod (`cloned_from` picker 0.1.12).
  `main.js` is the picker with a `mod` row kind added; `extras.js` holds the
  `MOD_ENTRIES` table, its rows, its 32px row height and `goExtra()`.
- Programs: `herdr-app status` (which windows are open), `hc machine ls --json`
  (connected machines), `hc get <terminal> --json` (focused foreground process).
- Herdr functions: `agents`, `spaces`, `terminals`, `panes`, `focused`, `run`
  (`mod.open`, `tab.select`, `tab.new`, `tab.close`, `space.new`,
  `team.section-*`, `change-radar.session*`), `openOverlay`, `closeOverlay`,
  `shared` / `setShared` (`space.colors`), `readTextFile`, `home`, `theme`,
  `settings`, `props`, `exec`, `hc`.
- Art: `search.svg`, `spinner.svg`.

## Watch out

- The rows name the mods `k9s`, `orbit`, `change-radar`, `session-history`,
  `team`, `jira`, `open-ide`. If one was renamed on install, rename it in
  `MOD_ENTRIES`, `TEAM_WINDOW` and `GIT_WINDOW`. The Team rows' own `mod`
  values (`team-dev` and so on) are only row ids; they open `team`.
- The rows are a fixed list: a row for a mod that isn't installed still shows.
  Install the companion mods from this repo (`k9s`, `orbit`, `change-radar`,
  `session-history`, `team`, `jira`, `open-ide`) or delete their rows from
  `MOD_ENTRIES`.
- The Team and change-radar commands (`team.section-<name>`,
  `change-radar.session-<id>`) must exist in those mods.
- Reads `~/.claude/sessions/<pid>.json` outside its folder.
- The `⌘Y`, `⌘⇧J`, `⌘⇧E` hints are text only; the keys come from the
  person's `keys.json`.
- Herdr updates to its own picker are not merged into the clone.

## Done when

- `cmd-p` shows the eleven rows above the tabs; typing `orbit` leaves only the
  Orbit row and matching tabs; Enter opens the Orbit window.
- `Team · Review MR` opens the Team window on the Review MR tab, and picking it
  again while the window is open switches its tab instead of opening another.
- `Git · Session changes` from a Claude terminal opens change-radar on that
  session.
- `herdr-app check mods/picker-plus` passes.
