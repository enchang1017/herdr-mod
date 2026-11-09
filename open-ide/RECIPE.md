# open-ide

One key opens the focused terminal's folder in an IDE: Rider when the folder
(or its git root) holds a .NET solution or project, VS Code otherwise, and VS
Code Remote-SSH when the terminal runs on another machine. Nothing shows but a
toast saying what was opened.

![open-ide](preview.png)

## What you see

- No visible window: the mod is a 2x2px frameless overlay at the window's top
  left (`mod.json` overlay `window`, `frame: "none"`) that closes itself when
  done. Opened with `mod.open:open-ide` (`cmd-shift-e` in the
  shipped `keys.json`) or the Picker's
  "Open in IDE" row.
- A success toast for 4s: `Opened in Rider` / `Opened in VS Code` /
  `Opened in VS Code (Remote-SSH <target>)`, with the opened path as the body;
  remote adds `Remote machines open in VS Code Remote-SSH; Rider remote is not
  supported.`
- On failure an error toast for 6s: `Open in IDE failed` and the reason.

## How it behaves

- The folder is `props.folder` (and `props.machine`) when given, otherwise the
  focused pane's folder. Nothing focused, or a pane without a folder, is an
  error.
- Remote (the terminal address is `<machine>/…` or the space is on a machine):
  `code --remote ssh-remote+<target> <folder>`, the target being that
  machine's `target` or `host` in `hc machine ls --json`.
- Local: the folder must exist. It looks for `*.sln`, `*.slnx`, `*.csproj`
  directly in the folder, then directly in its git root.
  - Found: `open -na Rider --args <path>`. The path is the solution whose file
    name starts with the folder's name (case-insensitive), else the first
    solution by name, else the folder holding only `.csproj` files.
  - Not found: `code <folder>`.
- `props.dryRun: true` shows an info toast with the command it would run
  instead of running it.

## Built from

- `main.js` (runs once on open, toasts, closes the overlay), `ide.js` (finds
  the target, probes the folder, runs the command), `plan.js` (pure choice of
  IDE, command and arguments).
- Programs: `test -d`, `find <dir> -maxdepth 1 ( -name *.sln -o -name *.slnx
  -o -name *.csproj )`, `git -C <folder> rev-parse --show-toplevel`,
  `hc machine ls --json`, `open -na Rider --args …`, `code`.
- Herdr functions: `exec`, `hc`, `focused`, `panes`, `spaces`, `props`,
  `notify`, `closeOverlay`.

## Watch out

- macOS only: Rider is started with `open -na Rider`, so the app must be
  named `Rider.app`; `-n` starts a new Rider instance each time.
- VS Code needs the `code` command on the PATH Herdr runs with ("Shell
  Command: Install 'code' command in PATH"), and the Remote-SSH extension for
  remote machines. Rider is never used for remote folders.
- Only the folder and its git root are searched, one level deep; a solution
  in a subfolder is not found and the folder opens in VS Code.
- Reads nothing outside the target folder; it writes nothing.

## Done when

- In a terminal inside a repo with a `.sln` at its root, the key opens Rider on
  that solution and toasts `Opened in Rider`.
- In a folder without .NET files, it opens VS Code on the folder.
- With `props.dryRun: true` it only toasts the command.
- `herdr-app check mods/open-ide` passes.
