# Optional: quota statusline

The quota block and `ctx %` need Claude Code's statusline to tee its input.
It changes `~/.claude/settings.json`: ask first and back it up.

1. Copy `statusline/statusline-herdr-tee.sh` to `~/.claude/statusline-herdr-tee.sh`.
2. If `statusLine.command` is set and is not the tee, write it verbatim as one
   line to `~/.claude/herdr-usage/next-statusline`; the tee runs it and prints its output.
3. Set `statusLine` to
   `{"type": "command", "command": "/bin/sh \"$HOME/.claude/statusline-herdr-tee.sh\""}`
   and check the JSON parses.

Undo: restore the backup and delete `next-statusline`.
