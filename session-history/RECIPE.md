# session-history

A searchable list of every past Claude Code and Codex session on this
computer, newest first. Type to filter by title, folder or branch; after a
pause it also searches the transcript text and shows the matching line. Enter
jumps to a session that is still running, or resumes it in a new tab.

![session-history](preview.png)

## What you see

- A window 70% wide and 75% high (`mod.json` overlay `window`, key
  `session-history-panel`), opened with `mod.open:session-history` (`cmd-y` in the
  shipped `keys.json`) or the Picker's
  "Session history" row.
- A 30px title bar, `Session history` in 12px semibold muted text.
- A 34px search field with an accent border
  (`Search sessions: title, folder, then transcript text`); while transcripts
  are searched a braille spinner and `searching text` show on its right.
- A status line: `N of M sessions`, then `K text matches` (`(limited)` when
  cut short) and `indexing…` while the index runs; an error shows after it in
  `ansi1`.
- One 46px row per session:
  - first line: a `live` tag (border and text in the working color) when the
    session runs now, a `codex` tag in `ansi4` for Codex, an accent `✎` when the
    session has a name, then the name or first prompt (13px) or `(no prompt)`;
  - second line (11px, dim): the folder (`~` for home) and `· <repo>` when the
    git repo has another name, the branch (not `HEAD`, up to 180px), the
    matching transcript snippet when searching, the transcript size
    (`B`/`KB`/`MB`) and age (`now`, `5m`, `3h`, `2d`, `1mo`).
  - The selected row has the `selected` background.
- A footer: `↑↓ move`, `Enter resume / focus live`, `⌘Enter fork`,
  `Esc clear, then close`. An empty list says `Indexing transcripts…`,
  `No sessions found.` or `No session matches.`

## How it behaves

- The list re-indexes on open and every 30s; a run that hit its time budget
  re-runs 200ms later until done.
- Typing filters at once: every word must appear in the title, name, folder,
  repo, branch or session id. 300ms after the last key the whole query is
  searched as one case-insensitive phrase in the transcripts' user and
  assistant text (up to 50 sessions, 20s); those sessions join the list with a
  snippet of 70 characters each side of the match.
- `↑`/`↓` move, clicking the selected row again acts on it, `Esc` clears the
  search or else closes the window. Repeat presses within 500ms are ignored.
- Enter on a `live` session focuses the Herdr terminal that runs it
  (`agent.focus`); if it runs outside Herdr, the status line says so.
- Enter on any other session, or `cmd-enter` on any session, resumes it in a
  new tab of the focused space (or the first space on this computer):
  `claude --resume <id>` (`cmd-enter` adds `--fork-session`) or
  `codex resume <id>`. It starts in the session's folder if that still exists,
  else the focused folder, else home. The tab gets the session's title (28
  characters) and focus; if the tab has not shown after 10s, a warning toast
  says so. The window closes.
- Titles: a name wins (the transcript's `custom-title` or `agent-name`
  entry, or the live session's name unless Claude derived it); otherwise the first real prompt, skipping system text and
  stripping a teammate wrapper; a prompt that starts with a herdr-core
  template (`~/.config/herdr-core/templates/*.md`) is shown without the
  template text, or as the template's name; otherwise the slash command and
  its arguments.

## Built from

- `main.js` (state, keys, timers), `view.js` (layout, `v_virtual_list`),
  `data.js` (runs the indexer, filters, labels), `launch.js` (resume / focus).
- `index.py`, run as `python3 -I index.py index <cache>` and
  `python3 -I index.py search <query> <limit>`; prints JSON.
  - Index: every `*.jsonl` under `~/.claude/projects/*/` and (recursively)
    `~/.codex/sessions/`, newest first, within 18s. Reads only new lines of a
    file that grew; caches per file in `data/session-history/index.json`
    (version 3). Claude sessions with an empty file and Codex sessions without
    a prompt are left out. Live sessions come from `~/.claude/sessions/*.json`
    whose `pid` is alive; repo is the nearest parent folder with `.git`
    (Codex: the `repository_url` name).
  - Search: narrows files with `rg -l -i -F` when `rg` is installed, else reads
    them all.
- Herdr functions: `exec` (`python3`, `test -d`), `hc` (`run --bg --json
  --no-parent --name --cwd --label herdr.space=… --label herdr.tab=…`,
  `get --json` for the foreground pid), `run` (`tab.rename`, `tab.select`,
  `pane.focus`, `agent.focus`), `spaces`, `terminals`, `focused`, `notify`,
  `nextCommand` (`session-history.focus` focuses the search field),
  `appHome`, `home`, `props`, `closeOverlay`, `theme`.

## Watch out

- Reads every Claude and Codex transcript on the machine
  (`~/.claude/projects`, `~/.codex/sessions`), `~/.claude/sessions` and
  `~/.config/herdr-core/templates`; writes only its cache in
  `data/session-history/`. Transcripts can hold secrets pasted into a session;
  snippets show them.
- Runs `python3`, `rg` (optional), `test`, and starts `claude` or `codex` in a
  new terminal; both must be on the PATH Herdr runs with.
- Live detection is Claude-only; a running Codex session resumes a second copy.
  Fork applies to Claude only.
- The new tab is created by labelling the `hc run` terminal with a random
  `tb<32 hex>` tab id; it only appears once Herdr picks the terminal up.
- Spaces on other machines are never used; sessions there are not listed.
- A first index of many large transcripts takes more than one 18s run; the
  list fills in over several runs.

## Done when

- Opening the window lists recent sessions with folder, branch, size and age,
  and the current Claude session carries a `live` tag.
- Typing a word that only appears inside a transcript shows that session with
  a snippet after a short pause.
- Enter on an old Claude session opens a new tab named after it running
  `claude --resume <id>`; `cmd-enter` runs it with `--fork-session`.
- Enter on a `live` row focuses its terminal instead of starting another.
- `herdr-app check mods/session-history` passes.
