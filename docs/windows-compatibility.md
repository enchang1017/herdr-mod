# Windows compatibility

`agent-radar`, `spaces-agents`, `picker-plus` and `jira` work with native
Windows Herdr. The existing macOS/Unix implementations are retained; process
and shell helpers switch on `window().platform`.

## Requirements and installation

- PowerShell 7 (`pwsh`) for the Spaces & Agents Windows helper.
- Python 3 (`python3`) for optional Codex/Grok quota probes. Windows npm
  `.cmd` launchers are supported; the probe cleans up its launcher process tree.
- Git on PATH for branch information.
- Atlassian CLI (`acli`) on PATH and `acli jira auth login --web` for Jira.
- Claude usage/context still requires the optional statusline setup described
  in `spaces-agents/INSTALL.md`. A missing usage/session directory is normal;
  the watchers wait for it to appear instead of showing an installation error.

Install mod folders as described by Herdr's generated `AGENTS.md`. Keep
personal layouts, shortcuts and Jira settings in the app home; they are not
part of the mod source. On Windows, use Ctrl bindings in your own `keys.json`,
after checking for conflicts. For example:

```json
{
  "global": {
    "ctrl-p": "mod.open:picker-plus",
    "ctrl-shift-a": "mod.open:agent-radar",
    "ctrl-shift-u": "agent-radar.jump",
    "ctrl-shift-j": "mod.open:jira",
    "ctrl-shift-r": "spaces-agents.reopen-tab"
  },
  "mod:jira": {
    "ctrl-enter": "jira.dock",
    "ctrl-shift-enter": "jira.tab"
  }
}
```

`jira.dock` toggles between docked and floating copies. Jira's Start dev
requires the optional `team` mod; without it, the action shows an explanation.
The picker includes fixed entries for companion mods: remove rows for mods
you have not installed as documented in `picker-plus/RECIPE.md`.

On Windows, Spaces & Agents uses `windows.ps1` for core document reads,
process/working-set samples, lost-session liveness and upstream snapshots.
Snapshot replacement is restricted to the app's
`data/spaces-agents/upstream/` subtree. Its Windows hashes are deterministic
but use their own format; do not copy an upstream baseline between operating
systems. macOS/Unix continue to use the original `sh`, `ps` and `rsync` paths.
Jira launches HTTP(S) links using the system browser command for each OS.

## Validation

From the repository root:

```text
node --experimental-vm-modules --test tests/mod-compatibility.test.mjs
python -m unittest discover -s tests -p test_windows_helpers.py -v
```

The JS tests load the real module graphs with a stubbed Herdr host and cover
check-mode side effects, Windows/Unix paths, URL launching, overlay closing, CRLF
process-check output and the missing Team dependency. The Python tests run
real Windows subprocesses against isolated temporary files, including paths
with spaces, apostrophes and ampersands. They skip on non-Windows systems.

Also run `herdr-app check` for every changed mod and inspect it in the running
window. A check renders only the initial state; it does not validate later
async states, actual account authorization or native keyboard interactions.
Use disposable data when testing Jira write confirmation; do not modify real
work items merely to validate installation.
