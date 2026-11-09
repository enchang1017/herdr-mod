# orbit

A k9s-style window onto the local orbit dev environment. A header shows the
environment, whether its daemon runs and how many resources are healthy; a
strip of instance pills switches between orbit instances, with live ones first
and leftover stale ones folded away. Four tabs list the RESOURCES, their LOGS,
the TRACES the daemon collected and the SQL Server DB projects with their drift.
Enter on a row slides a detail drawer in from the right. One key opens a
service's URL, another hands logs, a trace or a drifted database to a Claude
session, and a guarded button stops the daemon.

![orbit](preview.png)

## What you see

- A floating window, 75% wide and 80% high (`mod.json` overlay, key
  `orbit-panel`), opened with `mod.open:orbit` (`cmd-shift-o` in the shipped
  `keys.json`). Mono font: `JetBrainsMono Nerd Font` when installed, else the
  terminal font, else `JetBrains Mono`; 12.5px text on the `chrome` color.
- Title row, 42px on `surface`: a `boxes` icon in `accent`, `Orbit` in bold,
  the environment name in `ansi4` (tooltip: config path), a daemon badge
  (`daemon running` in `ansi2`, `checking` dim with a pulsing dot,
  `daemon not running` in `ansi1`), a health meter (64x5 bar plus
  `<healthy>/<total> healthy`, `ansi2` when all healthy, `ansi3` at half or
  more, else `ansi1`; tooltip names the starting and unhealthy counts),
  `selected env <name> not running` in `ansi3` when the chosen environment is
  not the one up, then on the right `updated HH:MM:SS`, an open-dashboard
  button (only while the daemon answers), Refresh `r`, Dock/Float `⌘↵`, and a
  red `Stop daemon` button with a `power` icon.
- Instance row: `INSTANCE` then one pill per orbit instance (state dot, name,
  and `<healthy>/<total>`, `stale` or `off`), the current one outlined in
  `accent`, live ones first. Stale instances hide behind a dashed
  `N stale` toggle with a chevron and show at 55% opacity when opened. A pill's
  tooltip says whether the daemon pid is alive and whether the dashboard port
  answers, plus env, config path and last active time. On the right, a 240px
  agent-name field (`new session` when empty) with a hint of the terminal the
  name matches (`→ <address> · <label>` or `not found: new session`).
- Tab bar: `RESOURCES 1`, `LOGS 2`, `TRACES 3`, `DB 4`, each with an icon and
  key cap; the active tab is filled with `solid`.
- When the daemon does not answer, a red banner: `Orbit daemon is not running
  ..., env <name>` with "Start it with `orbit up` in a terminal. This panel
  picks it up within a few seconds.", or, for a stale instance, that it is a
  leftover and can be removed with `orbit instance clean <name>`.
- **RESOURCES**: a table (name 160, kind 78, state 120, probe 84, ports 170,
  uptime 70, restarts 66, URL) with a state dot per row (green healthy, yellow
  and pulsing while starting, red unhealthy, dim stopped). The probe column is
  a small bar with `attempts/max` of the health probe; restarts above 0 show in
  `ansi3`. Hovering a row for 650ms shows a card with state, kind, image,
  ports, uptime, restarts, probe and URL.
- **LOGS**: a scrollable chip row of resources between `[` and `]` key caps, a
  filter field (`filter lines  /`), `N lines · updated HH:MM:SS`,
  Following/Paused `f`, Copy, and Ask agent `c`, over the last 1000 lines of
  the chosen resource in a virtual list (18px rows). Lines with fail, error,
  crit, fatal, exception, unhandled or err show in `ansi1`, warn/warning in
  `ansi3`.
- **TRACES**: toolbar with `All traces`/`Errors only` `e` and
  `No health checks`/`With health checks` `h`, and `<shown>/<total>`. Table of
  up to 100 traces: time, `ERROR` (`ansi1`) or `ok` (`ansi2`), root service in
  a per-service color, duration with a bar relative to the slowest trace, span
  count, and the root span name.
- **DB**: toolbar chips `<n>/<total> in sync`, `<n> drifted`,
  `<n> check failed`, and the SQL Server `service:port` on the right. Table:
  database 170, project 150, status 130 (`in sync`, `drifted · N` with ` !` for
  possible data loss, `check failed`, `not checked`), last publish 120, checked
  110.
- **Drawer**: a rounded card on `popover` that slides in from the right
  (180ms), 45% of the area wide (at least 420px), leaving the list visible
  beside it. A 32px tinted icon, title, subtitle and close `esc`; status chips;
  action buttons; then sections:
  - Resource: state and restart chips; Open `o`, Logs `l`, Restart `⇧R`,
    Stop `⇧S`; Overview (state, uptime, startup, restarts, role, kind), Health
    probe bar, Image, Ports, Links (URL and sidecar URLs, clickable).
  - Trace: status, duration and span chips; Ask agent `c`, Copy trace id,
    Reload; Summary, a Waterfall (service and span name indented by depth, a
    timing bar, failed spans in `ansi1`), and the log lines carrying the trace
    id (last 400).
  - Database: Run diff, Ask agent `c` (only when drifted); Overview (project,
    baseline, last publish, checked, last reset, path) and Drift (create /
    alter / drop counts, the schema operations grouped by action, changed
    source files).

## How it behaves

- Polls `GET /api/status` every 3s while the window is visible, traces every
  5s on the Traces tab, instances every 10s, and the DB tab every 15s. Hidden
  (inactive window, other tab or space) it stops polling and refreshes once
  when shown again.
- Live vs stale: an instance is live when its dashboard answers
  `/api/status`. A named instance whose pid fails `kill -0` is stale. The
  default instance is never stale.
- When the daemon does not answer, resources fall back to
  `orbit status --json` (retried every 15s) and the badge turns red. Logs,
  traces, DB, Restart and Stop then say they need the running daemon.
- `1`-`4` switch tabs, `r` refreshes, `j`/`k` or arrows move the cursor,
  `enter` opens the drawer for the row, clicking a row opens it and clicking
  the same row again closes it. With a trace drawer open, `j`/`k` open the next
  trace. The drawer's left edge drags to resize (double-click resets); the
  width is remembered. Under 760px the drawer covers the list and cannot be
  resized.
- Resources: `o` opens the URL in the browser, `l` jumps to its logs, `R` and
  `S` restart or stop it. Both ask first: the first press shows a red strip
  `Restart <name>? Press R again or confirm.` for 6s, and a second press or
  Confirm posts the action.
- Logs: `[`/`]` (also `j`/`k`) step through resources, `/` focuses the filter
  (200ms debounce), `f` toggles following (re-polls every 3s and sticks to the
  bottom). On the Traces tab, `o` opens the drawer.
- Stop daemon: the first click arms it (`Confirm?`) and shows a strip
  `Stop the Orbit daemon (<instance>)? Dev services stop, containers keep
  running.` with Stop daemon / Cancel; it disarms after 6s. Confirming runs
  `orbit daemon stop` for that instance.
- `escape` leaves a text field, else cancels a confirm, else closes the drawer,
  else clears the log filter, else closes the window.
- Ask (`c`) builds a prompt: the visible log lines, the trace summary,
  waterfall, error-span attributes and its logs, or the database drift. Each
  section is clipped at 12000 characters. A long prompt is saved to a file and
  the agent gets "Read <file> ... and do what it asks". It goes to the Claude
  terminal named in the agent field (matched by terminal name, address, Claude
  session name or tab name, and only if it runs `claude`). Otherwise a new
  `claude` tab opens with it in the focused folder. The window then docks
  beside that agent pane.
- `cmd-enter` docks the window beside the focused pane (right split, weight
  0.6) or floats it again; `cmd-shift-t` opens it as a tab named `Orbit`.
- Tab, selections, follow, the trace toggles, chosen instance and drawer width
  persist in shared state `orbit.ui`; the agent name in `orbit.agentTarget`.

## Built from

- `main.js` -> `panel.js` (state, timers, commands) with `keymap.js`,
  `actions.js` (status, logs, traces, confirm, ask), `selection.js`,
  `drawer-resize.js`, `daemon.js` (instances, stop daemon), `instances.js`,
  `db-api.js`, `db-actions.js`, `api.js` (HTTP and CLI), `model.js`,
  `ask.js`, `target.js`, `dock.js`, `ui-state.js`, `visibility.js`, and
  `views/` (`shell`, `header`, `instance-pills`, `resources`, `logs`,
  `traces`, `trace-drawer`, `db`, `db-drawer`, `drawer`, `row-hover`, `meter`,
  `parts`, `widgets`, `icons`, `tokens`).
- `nextCommand()` accepts `focus`, `escape`, `dock`, `float`, `tab`,
  `refresh`, `resources`, `logs`, `traces`, `db`.
- Daemon API (`fetch`): `GET /api/status`, `/api/logs/<name>?lines=1000`,
  `/api/traces?limit=100[&include_health=1]`, `/api/traces/<id>`,
  `/api/traces/<id>/logs`, `/api/devdb/meta`, `/api/devdb/projects`,
  `/api/db/drift`, `/api/db/reset-state`; `POST /api/restart/<name>`,
  `/api/stop/<name>`, `/api/db/diff` with
  `{db, script: false, fast_only: true}`.
- Programs: `orbit [--instance <name>] status --json | inspect --json |
  daemon stop`, `orbit instance list --json`, `/bin/kill -0 <pid>`,
  `hc get <address> --json`, `hc send <address> <text>`.
- Herdr functions: `exec`, `hc`, `fetch`, `readTextFile`, `writeTextFile`,
  `appHome`, `home`, `shared`/`setShared`, `terminals`, `spaces`, `panes`,
  `focused`, `window`, `props`, `closeOverlay`, `notify`, `theme`,
  `settings`, `fonts`, and `run` (`tab.new`, `tab.select`, `pane.split`,
  `pane.close`, `pane.focus`, `layout.resize`, `mod.open`).
- Art: 38 Lucide SVGs in `icons/` drawn with `svg()` and tinted by
  `text_color`. Lucide is ISC; the Feather-derived ones are MIT, both in
  `icons/LICENSE`.

## Watch out

- Requirements: an `orbit` local dev-environment CLI with a daemon that
  serves the dashboard API on localhost. The mod has no settings file.
- Built for that orbit CLI and its daemon's JSON shape (`resources`,
  `context.managed_selection`, `health_progress`, `sidecars`,
  `ok`/`data`/`error` from the CLI). Unknown fields are ignored and missing
  ones show as `-`.
- Default dashboard is `http://localhost:19800`. A named instance's port comes
  from `~/.orbit/instances/<name>/ports.json` (`ports.dashboard`); the default
  instance's from `~/.orbit/orbit.pid` (`pid`, `dashboard_port`). Network
  stays on `localhost`.
- Reads outside its folder: `~/.orbit/orbit.pid`,
  `~/.orbit/instances/<name>/ports.json`, `~/.orbit/db-state.json` and
  `~/.orbit/instances/<name>/db-state.json` (last publish/reset per DB), and
  `~/.claude/sessions/<pid>.json` (to match Claude session names).
- Writes outside its folder: long Ask prompts to
  `<Herdr app home>/data/orbit/ask-<timestamp>.md`, never cleaned up.
- Runs `orbit` from `PATH`, falling back to `~/.local/bin/orbit`.
- The DB tab assumes SQL Server database projects. Run diff is a read-only
  fast check; when it cannot decide it points at
  `orbit sqlserver diff --analyze`.
- Changes local state: Restart, Stop and Stop daemon act for real (each behind
  a 6s confirm). Nothing deletes stale instances; the panel only names
  `orbit instance clean`.
- `o` means open URL on Resources but open drawer on Traces.

## Done when

- With the daemon running the badge reads `daemon running`, the meter shows
  `N/N healthy`, and `o` on a service with a URL opens it in the browser.
- `enter` on a resource, trace or database row slides the drawer in; `esc`
  closes it; dragging its edge resizes it and the width survives reopening.
- `⇧R` twice within 6s restarts the selected service; once does nothing after
  6s.
- Stop daemon asks to confirm and, confirmed, the badge turns to
  `daemon not running` and the red banner appears with resources from
  `orbit status --json`.
- An instance whose daemon died shows under the `N stale` toggle, dimmed.
- `c` on a log tail, an open trace or a drifted database reaches the named
  Claude terminal or opens a new `claude` tab.
- `herdr-app check mods/orbit` passes.
