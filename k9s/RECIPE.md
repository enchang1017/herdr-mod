# k9s

A Kubernetes window in the style of k9s. Type part of a deployment name to
find it in any kube context and press Enter to follow its logs live across all
its pods. You can also browse pods, deployments, services, nodes, events and
ingresses in one context and namespace, and open a row in a sliding drawer
that shows its health, CPU and memory, events, YAML, logs and describe output.
Every context is read-only unless you list it in the mod's settings file
(none by default). On a listed context the drawer can also delete a pod,
restart or scale a workload, or open a shell. Each of these
asks you to confirm first (Shell opens without a confirm step) and is written
to an audit log.

![k9s](preview.png)

## What you see

- A floating window, 75% wide and 80% high (`mod.json` overlay, key
  `k9s-panel`), opened with `mod.open:k9s` (`cmd-shift-k` in the shipped
  `keys.json`). The text is 12.5px in `JetBrainsMono Nerd Font` when that font
  is installed, otherwise the terminal font.
- **Live card** (top, only while streams run): one row per running follow with
  its context, `namespace/name`, Show and Stop.
- **Find view** (default): a card titled Find with `<n> targets`, Browse
  (`tab`), Reload and Dock buttons; a 32px search field with an accent border;
  a freshness line (`<context> <age>` per context, `✕` and the error in a
  tooltip when one failed, a `refreshing` spinner); then up to 200 rows of
  Deployments and StatefulSets from every context. Each row shows a state glyph
  (`●` up in `ansi2`, `◐` partial in `ansi3`, `✕` down in `ansi1`, `·` scaled to
  zero, `?` unreachable in dim), a context chip (solid `ansi1` with a warning
  glyph when the name contains `prod`, otherwise `ansi4`), the name, the
  namespace when it is not the context's default, an `sts` chip, a history
  glyph for the 50 most recently followed, and `ready/desired`. The top row is
  highlighted. A legend sits at the bottom.
- **Browse view**:
  - On a context whose name contains `prod`, a solid `ansi1` 28px banner reads
    `PRODUCTION <cluster> read-only`.
  - A card titled Browse holds `updated HH:MM:SS` and a via hint (`proxy` in
    `ansi2`, `kubectl` in dim), hidden below 560px. A spinner replaces them
    while loading and a `stale since` chip after a failed refresh. The card's
    buttons are Find `g`, Refresh `r`, Dock/Float `⌘↵` and `?`.
  - A scope row: `ctx <cluster>` (red on prod), `ns <namespace>`, All `a`, and
    Row ns `n` when the selected row has a namespace.
  - A resource bar of six tabs (`PODS`, `DEPLOYMENTS`, `SERVICES`, `NODES`,
    `EVENTS`, `INGRESSES`), each 26px tall and at most 150px wide, with a 13px
    Lucide icon and its number 1-6. The active tab is a solid chip.
  - A filter field and an `All rows` / `Failing only` toggle (`f`).
- **Table**: a header with health chips (`✕ n`, `◐ n`, `● n`) and the row
  count. It shows kubectl's own columns in full when they fit; otherwise a
  compact NAME + STATUS/RESTARTS/READY/... layout. Rows are 24px, with a health
  glyph and a tinted STATUS chip. The selected row has a 2px accent left
  border. At most 400 rows are drawn.
- **Hover card** (pods and deployments): after 650ms on a row, a 280px card
  with the row's columns. For a pod whose details are loaded, it also shows the
  node and CPU and memory usage against the request or limit, with 110px
  meters.
- **Detail drawer**: a 12px-rounded card that slides in from the right over
  the table. It is 45% of the area wide (at least 420px) and leaves 300px of
  table. You can drag it to any width from 360px; the width is kept and a
  double-click resets it. Below 760px it covers the full width and cannot be
  resized. From top to bottom:
  - A header with a 32px kind icon, the name, the kind, and close (`esc`).
  - Chips for the context, the namespace and the mode: `PRODUCTION · read-only`
    (solid red), `writable` (`ansi3`, lock-open icon) or `read-only` (shield).
  - Icon buttons: Follow `w`, Ask `c`, Loki, Copy, Reload `r`. On the writable
    context they are followed by Delete pod `⇧D` (red), Rollout restart `⇧R`,
    Scale `⇧S` and Shell `s` (`ansi3`).
  - A 34px tab bar: Overview, Events, YAML, Logs (pods and deployments only),
    Describe, with a 2px accent underline that slides between them.
  - The body, then a footer with the agent-name field and a `proxy`/`kubectl`
    indicator.
- **Overview tab**:
  - Pod: a tinted hero card with the state, the reason and the restart count;
    a fact grid; the owner chain (a Deployment link jumps to it); CPU and
    Memory meters; one card per container with its state, image, last exit,
    ports and per-container meters; and the conditions.
  - Deployment: a hero card, Ready/Updated/Available replica bars, facts,
    images, the last 5 rollouts and the conditions.
  - Service, ingress, node: a hero card, facts and lists. A node also gets
    meters against allocatable.
  - Meters are 6px. They are green up to 70% of the limit (or of the request
    when there is no limit), `ansi3` above 70% and `ansi1` above 90%, with a
    request marker on the limit bar. They fill in 520ms.
  - On a writable context a `Danger zone · <cluster>` section lists the
    same write actions.
- **Write panel**: opens above the drawer tabs. It is tinted red for delete
  and `ansi3` for restart and scale. It shows the exact `$ kubectl ...` command
  and a confirm step:
  - Delete and restart: "Type `<name>` to confirm". The border turns green when
    the text matches and red when it is wrong.
  - Scale: `now → [number]` for 0-50 replicas, with the change shown (`+2
    replicas`).
  - The submit button lights up only when the confirm step is complete.
    Cancel is `esc`.
- **Live window**: a second overlay (`k9s-follow`, 62% x 62%). A 32px bar
  (`live`/`ended`/`gone`, context, `ns/name`, kind, Ask, Restart, Loki, Stop)
  sits over the terminal that runs the log stream.

## How it behaves

- Find: words must all appear in `context namespace/name`. Results rank by
  exact name, then recency, then default namespace, then shorter names. Enter
  or a click follows. `tab` or `v` switches to Browse, which opens the top
  match's context and namespace on DEPLOYMENTS.
- The index reloads when the window opens if it is older than 60s, every 10
  min while the window shows, and failed contexts retry after 2 min. If a
  context forbids listing every namespace, only its default namespace is
  indexed.
- Browse keys:
  - `j`/`k` or the arrows move the selection, and an open drawer follows it.
  - `enter` opens the drawer. `o`/`e`/`y`/`l`/`d` open it on a tab.
  - `1`-`6` switch resource, or pick a drawer tab while the drawer is open.
    `tab`/`shift-tab` cycle the drawer tabs.
  - `w` follow, `c` ask the agent, `f` failing only, `/` filter, `r` refresh,
    `g` back to Find, `?` keys.
  - `a` all namespaces. On a prod context it asks first with a red "All
    namespaces on production?" card.
  - `n` jumps to the selected row's namespace.
- Clicking a row selects it and opens the drawer. Clicking it again closes the
  drawer.
- `escape` does one thing per press: leaves the agent field, cancels a write,
  closes the drawer, the confirm, the picker or the help, clears the filter or
  the query, then closes the window.
- The list re-polls every 15s, backing off 5s/15s/30s after failures. It
  pauses while a write, picker or confirm is open. Overview data is reused for
  10s.
- When the window is hidden (a background tab or space, an unfocused app
  window), the list, the index and the clock stop polling. They catch up when
  it shows again.
- Writes work only on contexts in `writeContexts`. On any other context Shift-D/R/S say
  "This context is read-only." When a write finishes, a toast shows the result
  (5s on success, 12s on failure, with any audit-log error), and the list and
  the drawer reload.
- Shell runs `kubectl exec -it <pod> -c <container> -- /bin/sh` in a new
  background terminal. Its tab is renamed `sh <pod>` and selected. `s` uses
  the first container; the button on a container card uses that container.
- Follow: one terminal (labels `k9s=follow`, `k9s.context`, `k9s.namespace`,
  `k9s.kind`, `k9s.name`) runs `kubectl logs --follow --prefix --timestamps`.
  It follows one pod, or the workload's label selector across up to 20 pods.
  The first run starts with `--tail=50 --since=10m`; a reconnect takes
  `--tail=1000 --since-time=<when it dropped>`. The wait between reconnects
  starts at 2s and doubles up to 30s. After 10 short-lived runs in a row
  (under 30s each) it gives up and waits for Enter. Starting a new follow
  stops the old one, and Stop or closing the live window kills it.
- Ask agent: from a text tab it sends that text (clipped to 8000 characters).
  Otherwise it sends a triage snapshot: describe, the last 120 log lines, the
  previous container's logs, the events and the Loki URL. The snapshot goes to
  the Claude terminal named in the agent field. If no such terminal runs
  `claude`, it opens a new `claude` tab named `k9s <cluster>/<name>`. A message
  longer than 400 characters or more than one line goes to
  `data/k9s/ask-<ms>.md`, and the agent is told to read that file. From the
  floating window, k9s then docks itself to the right of the agent's pane
  (weight 0.6).
- `cmd-enter` docks the window as a pane to the right of the focused pane, or
  floats it again. `cmd-shift-t` opens it as its own tab.

## Built from

- `main.js` picks the role: `props.role === "live"` renders the live bar
  (`roles.js`); otherwise it renders the panel (`panel.js`, `panel-keys.js`,
  `browse-actions.js`, `drawer-actions.js`, `drawer-resize.js`,
  `write-actions.js`, and `views/*`).
- **Read path, proxy first** (`proxy.js`, `proxy-guard.js`, `api*.js`,
  `source.js`, `overview-source.js`):
  - Each context gets one `kubectl proxy`, started by `hc run --bg --rm
    --no-parent --no-notify` (labels `k9s=proxy`, `k9s.context`, `k9s.flags`,
    `k9s.port`) with fixed flags: `--address=127.0.0.1 --port=0`,
    `--reject-methods` for everything except GET, and `--accept-paths` for
    `/version`, nodes and namespaces, pods, services, events, pod `log`,
    `apps/v1` deployments and statefulsets, `networking.k8s.io/v1` ingresses,
    and `metrics.k8s.io/v1beta1` pods and nodes. `--reject-paths` blocks
    exec, attach, portforward and `/proxy`.
  - `proxyStartRefusal` refuses any proxy argv that differs from that set.
    `requestRefusal` checks every request before it is sent: method `GET`, a
    known context, a port from 1024 to 65535, path segments against an
    allowlist (no `exec`, `attach`, `proxy`, `token`...), and query keys
    against fixed patterns.
  - Lists are read as server-side Tables (`as=Table`) in pages of 500, up to
    40 pages. YAML is rendered locally from JSON, without `managedFields`.
  - A proxy that sits idle for 10 min is killed, and `close()` kills them
    all. Until a proxy serves, and whenever a request fails, the call falls
    back to `kubectl`.
- **kubectl path**: `kubectl.js` builds the argv and `guard.js`
  (`readOnlyRefusal`) checks it before `exec("kubectl", ...)`. The verbs
  allowed are `get`, `describe`, `logs`, `top`, `api-resources`, `version`,
  and three `config` subcommands. Every call names an explicit `--context=`.
  A blocklist of flags applies (`-f`, `--watch`, `--raw`, `--kubeconfig`,
  `--as`, `--token`, `--server`, `--follow` outside the live stream...), and
  every token must match a safe-character regex. Describe, events,
  ReplicaSets, `top` and the triage snapshot always use kubectl.
- **Write path** (`write-guard.js`, `writes.js`, `write-actions.js`,
  `views/write-panel.js`):
  - `settings.js` loads `writeContexts` into a frozen list (module state,
    replaced on each load, empty until the first load finishes). `canWrite`
    is true only for an exact member that is not a `prod` context.
    `writeRefusal` accepts four exact argv shapes, each with exactly one
    `--context=` whose value passes `canWrite`:
    - `kubectl delete pod <name> -n <ns>`
    - `kubectl rollout restart deployment|statefulset/<name> -n <ns>`
    - `kubectl scale deployment|statefulset/<name> --replicas=<0-50> -n <ns>`
    - `kubectl exec -it <pod> -c <container> -n <ns> -- /bin/sh|/bin/bash|sh|bash`
  - Names must be Kubernetes object names. `runWrite` runs
    `exec("kubectl", ...)`; `openShell` runs `hc run --bg --keep` and then
    `tab.rename` and `tab.select`. Both append
    `{at, context, argv, code, stderr}` to `<appHome>/data/k9s/audit.jsonl`.
- `finder.js` holds the index and recents in mod `localStorage` (`index`,
  `recent`). The view (`view`, `scope`, `selectedName`, `filter`,
  `failingOnly`, `drawerWidth`) is kept in shared state `k9s.ui`, and the
  agent name in `k9s.agentTarget`.
- `live.js` runs the follow as `hc run --bg --keep --no-parent -- sh -c
  <reconnect script> ...` and opens the live window with `openOverlay`.
  `ask.js` and `target.js` use `hc get`, `hc send` and `hc read`, and
  `tab.new` with `argv: ["claude"]`. `grafana.js` builds the Loki explore URL.
  `dock.js` uses `pane.split`, `layout.resize`, `tab.new`, `mod.open` and
  `pane.close`. `visibility.js` checks `window()`, `spaces()` and `panes()`
  to decide whether the window shows.
- UI pieces: gpui-base `HoverCard`, `Progress`, `Editor` (read-only, YAML
  syntax colors from `ansi1-6`), `Input` and `NumberInput`. There are 40
  Lucide SVGs in `icons/` (ISC license in `icons/LICENSE`), drawn with
  `svg("mods/k9s/icons/<name>.svg")`, plus Nerd Font glyphs for card titles
  and markers.
- Herdr functions: `exec`, `hc`, `shared`/`setShared`, `terminals`, `spaces`,
  `panes`, `focused`, `window`, `run`, `openOverlay`/`closeOverlay`, `notify`,
  `nextCommand`, `appHome`, `home`, `readTextFile`, `writeTextFile`, `theme`,
  `settings`, `fonts`, and `fs/promises`.

### Settings

`<appHome>/data/k9s/settings.json` (read when the window opens; missing means
the defaults). Nothing company-specific lives in the code.

```json
{
  "writeContexts": [],
  "grafana": {
    "serviceNamespaces": [],
    "targets": [
      { "context": "prod", "namespace": "payments", "url": "https://grafana-a.example.com", "lokiUid": "loki-a" },
      { "context": "stag|stg", "url": "https://grafana.example.com", "lokiUid": "loki-staging" }
    ]
  }
}
```

- `writeContexts` (default `[]`): exact kube context names that may run the
  four write actions. Compared as exact strings (no trimming, no patterns,
  case-sensitive). Non-string, empty or oddly-charactered entries are dropped;
  a non-list, invalid JSON or an unreadable file means `[]`. A context whose
  name contains `prod` never writes, even when listed. Empty means read-only
  everywhere.
- `grafana.targets` (default `[]`, Loki buttons hidden): first match wins.
  `context` is a case-insensitive regex tested against the context name,
  `namespace` (optional) must equal the row's namespace, `url` is the Grafana
  base URL, `lokiUid` the Loki datasource uid. Invalid entries are dropped.
- `grafana.serviceNamespaces` (default `[]`): namespaces whose logs carry
  `service_name="<ns>/<workload>"`; others are queried with
  `service_name=~".*/<workload>"`.

## Watch out

- Fresh installs are read-only everywhere and show no Loki links until
  `data/k9s/settings.json` names write contexts and Grafana targets. A bad
  settings file never widens access: it falls back to the defaults and logs
  why.
- "Production" means the context name contains `prod`.
- Requirements: `kubectl` with a working kubeconfig, herdr-core `hc`, and
  `claude` on PATH for Ask agent.
- Programs it runs: `kubectl` (get, describe, logs, top, config, proxy,
  and the four write verbs on the listed contexts), `hc` (run, kill, read, label,
  get, send), `sh -c` for the follow loop, and `claude` in new tabs.
- Outside its folder:
  - It uses the person's kubeconfig and cloud exec plugins (aws, gcloud).
  - It reads `~/.claude/sessions/<pid>.json` for session names.
  - It writes `<appHome>/data/k9s/` (`ask-*.md` and `audit.jsonl`). The audit
    file is read whole and rewritten on each entry, and it never rotates.
  - It reaches the network only through the local proxy (`127.0.0.1`) and
    `cx.open_url` for Grafana.
- `kubectl proxy` terminals belong to the app, not the window: the window
  adopts them by label, and labels from an older flag set are killed and
  restarted. Forget `--port=0` plus reading `Starting to serve on` from
  `hc read` and two contexts fight over a port.
- `--follow` is allowed only through `followArgv` with `canFollow`. Anything
  else that adds it is refused, which keeps a list call from hanging.
- Writes go through `exec` directly, not through `readOnlyRefusal`. The guard
  for them is `writeRefusal` alone, so keep its shapes exact.
- Shell has no confirm step: `s` opens it at once, but it is still audited.
  Restart and scale need the owning Deployment or StatefulSet, which the
  overview resolves through the ReplicaSet. Until it loads, the action says
  "Still loading the details".
- Ask agent sends to a terminal only when its name, address, Claude session
  name or tab name matches the field and its foreground program is `claude`.

## Done when

- Find lists deployments from at least two contexts, and Enter opens the live
  window streaming `[k9s] following: kubectl logs ...` lines.
- Browse shows `proxy` in green after the first refresh. `hc ls` shows one
  `k9s=proxy` terminal per visited context, and closing the window removes
  them.
- `readOnlyRefusal(["kubectl","delete","pod","x","--context=c"])` and
  `requestRefusal({method:"POST",...})` both return refusal strings. A `get`
  without `--context=` is refused.
- `writeRefusal` refuses `kubectl delete pod x -n ns --context=<any other
  context>` and accepts the same argv on a context listed in `writeContexts`;
  with no settings file it refuses every write.
- On a `prod` context the red PRODUCTION banner and the `PRODUCTION ·
  read-only` badge show, and Shift-D answers "This context is read-only."
- On a listed write context, Delete pod stays disabled until the pod name is typed. After
  it runs, one line is added to `data/k9s/audit.jsonl`.
- Dragging the drawer edge changes its width, and the width survives closing
  and reopening the window.
- `herdr-app check mods/k9s` passes.
