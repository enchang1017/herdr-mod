# Agent Radar

A drawer that pops out of the right edge only when an agent needs you (blocked) or finished
while you weren't looking (done), plus a panel window listing every agent by status. Click a
row, or press a key, to jump straight to that agent.

**What you see:**
- Drawer (floating on `work-body`, `edge: right`, `align: start`, `peek: 36`): hidden when
  nothing needs you. Otherwise a 300px card whose right 32px column shows a count circle
  (`blocked` red, else `done` green) and a status badge per row (pulsing `!` for blocked, dot
  for done). Hovering slides it out: each row has the program icon, a name (named tab, else
  the agent's title, else the program name), age, and `space · tab`. Up to 6 rows, then `+N more`.
  Header buttons: `All` opens the panel, `✕` hides the drawer until the set of waiting agents changes.
- Panel (`mod.open agent-radar`, a window 55% × 75%): change-radar's look (JetBrainsMono Nerd Font,
  `chrome` background, lucide icons copied into `icons/`). A 36px header: radar icon, "Agent radar",
  tinted chips `N need you` / `N done`, outlined `N working`, `N agents` on the right. Below, one card
  per status (32px `surface` header: status icon, title in the status color, count). Each row: status
  icon, program icon, bold name, program name dim, age, ghost `Go 1..9`; second line: outlined
  `folder` space chip, tab chip, machine/pinned chips, terminal address dim. Selected row: 2px accent
  left border, `selected` background. Footer legend: status icons + labels, key hints.

**How it behaves:** clicking a row runs `pane.focus {pane}` (switches space and tab), or
`terminal.peek` for a sub-agent with no pane; the panel window then closes. Panel keys: ↑↓/j k,
Enter, 1–9, Esc. The focused agent never shows in the drawer.

**Built from:** one mod, `props.float` selects the drawer; otherwise it's the panel. `agents()`,
`terminals()` (sub-agents via `parent`), `spaces()` (tab `changed_at` for age), `setAgentOrder`,
`nextCommand` (`jump`: focus the most urgent waiting agent).
Keys: `cmd-shift-a` → `mod.open:agent-radar`, `cmd-shift-u` → `agent-radar.jump`.

**Watch out:** write `mod.json` before `main.js`, or Herdr docks a copy into the layout on first
sight. `pane.focus` must get the pane id; `agent.focus` does not switch tabs. Claude Code does
not report OSC 7501, so `claude.js` finds it like `spaces-agents` does: `hc get <t> --json`
foreground argv `claude*` (re-checked every 3s for every local terminal; a Claude foreground overrides a stale report from another agent that ran there before, e.g. Antigravity's leftover `idle`), then
`~/.claude/sessions/<pid>.json` (`busy` working, `waiting` blocked, `idle` idle; watched with
`watchFolder`). A Claude that goes working → idle while its terminal isn't focused is `done`
until you focus it (kept in shared `agent-radar.unseen`). Test a blocked
agent with `printf '\033]7501;:state=blocked\007'` in a tab.

**Done when:** `herdr-app check` passes; a tab printing the blocked OSC shows the drawer badge;
`cmd-shift-u` switches to it; `cmd-shift-a` opens the panel and Enter jumps.
