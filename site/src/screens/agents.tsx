import {Bar, Chip, Dim, Foot, Frame, Kbd, Line, List, Meter, Push, Row, Search, Title} from './kit';

export function SpacesAgentsScreen() {
  return (
    <Frame kind="sidebar" dims="sidebar 268 px" label="spaces-agents sidebar: spaces, tabs and agents with status, then lost agents and Claude quota">
      <Bar>
        <Title>Spaces &amp; Agents</Title>
        <Push />
        <Kbd>+</Kbd>
      </Bar>
      <List>
        <Row><Dim>This computer</Dim></Row>
        <Row>
          <Kbd>A</Kbd> <b>api-service</b> <Dim>feature/login</Dim> <Push /> <Dim>↑2</Dim>
        </Row>
        <Row><Dim>▾</Dim> Tab 1</Row>
        <Row tall selected>
          <Line>├ <b>claude</b></Line>
          <Line><Chip solid>working</Chip> <Dim>ctx 42%</Dim> <Chip>CI ✓</Chip> <Push /> <Dim>3m</Dim></Line>
        </Row>
        <Row tall>
          <Line>└ <b>codex</b></Line>
          <Line><Chip>needs you</Chip> <Push /> <Dim>12m</Dim></Line>
        </Row>
        <Row>
          <Kbd>W</Kbd> <b>web-app</b> <Push /> <Dim>main</Dim>
        </Row>
        <Row><Dim>▸</Dim> review <Push /> <Dim>1 agent</Dim></Row>
        <Row>
          <Dim>Lost agents</Dim> <Dim>1</Dim> <Push /> <Chip>Revive all</Chip>
        </Row>
      </List>
      <Foot>
        <Line><Dim>Claude quota</Dim></Line>
        <Line>5h <Meter value={38} /> <Dim>38%</Dim> <Push /> <Dim>14:00</Dim></Line>
        <Line>week <Meter value={61} /> <Dim>61%</Dim> <Push /> <Dim>Fri 09:00</Dim></Line>
      </Foot>
    </Frame>
  );
}

const RADAR_ROWS = [
  {name: 'claude', where: 'api-service, Tab 1', age: '4m', mark: '!'},
  {name: 'codex', where: 'web-app, review', age: '12m', mark: '!'},
  {name: 'claude', where: 'infra, Tab 2', age: '1h', mark: '●'},
] as const;

export function AgentRadarScreen() {
  return (
    <Frame kind="drawer" dims="drawer 300 px, peeks 36 px" label="agent-radar drawer listing agents that are blocked or done">
      <Bar>
        <Chip>All</Chip>
        <Push />
        <Kbd>✕</Kbd>
        <b className="s-count">3</b>
      </Bar>
      <List>
        {RADAR_ROWS.map((r) => (
          <Row tall key={r.where}>
            <Line><b>{r.name}</b> <Push /> <Dim>{r.age}</Dim> <b className="s-badge">{r.mark}</b></Line>
            <Line><Dim>{r.where}</Dim></Line>
          </Row>
        ))}
      </List>
      <Foot>
        <Line><Dim>Click a row, or</Dim> <Kbd>⌘⇧U</Kbd> <Dim>jumps to the most urgent</Dim></Line>
      </Foot>
    </Frame>
  );
}

const SESSIONS = [
  {tag: 'live', title: 'login flow with SSO', where: '~/code/api-service  feature/login', size: '2.1 MB', age: 'now'},
  {tag: 'codex', title: 'fix flaky payment test', where: '~/code/web-app  main', size: '640 KB', age: '3h'},
  {tag: '', title: 'refactor auth middleware', where: '~/code/api-service  refactor/auth', size: '1.4 MB', age: '2d'},
  {tag: '', title: 'k8s ingress for staging', where: '~/code/infra  main', size: '310 KB', age: '5d'},
] as const;

export function SessionHistoryScreen() {
  return (
    <Frame dims="window 70 × 75%" label="session-history window: search past Claude Code and Codex sessions">
      <Bar><Title>Session history</Title></Bar>
      <Search>Search sessions: title, folder, then transcript text</Search>
      <Line><Dim>24 of 24 sessions</Dim></Line>
      <List>
        {SESSIONS.map((s, i) => (
          <Row tall selected={i === 0} key={s.title}>
            <Line>{s.tag && <Chip>{s.tag}</Chip>} <b>{s.title}</b></Line>
            <Line><Dim>{s.where}</Dim> <Push /> <Dim>{s.size}</Dim> <Dim>{s.age}</Dim></Line>
          </Row>
        ))}
      </List>
      <Foot>
        <Line><Kbd>↑↓</Kbd> <Dim>move</Dim> <Kbd>Enter</Kbd> <Dim>resume</Dim> <Kbd>⌘Enter</Kbd> <Dim>fork</Dim> <Kbd>Esc</Kbd> <Dim>close</Dim></Line>
      </Foot>
    </Frame>
  );
}

const PICKER_ROWS = [
  ['k9s', 'Kubernetes, read-only'],
  ['Orbit', 'local dev env: resources, logs, traces'],
  ['Git changes', 'change radar, graph'],
  ['Session history', 'past Claude sessions ⌘Y'],
  ['Team: Start dev', 'kick off a feature with a lead agent'],
  ['Jira', 'work items, status, assign ⌘⇧J'],
  ['Open in IDE', 'Rider (.NET) or VS Code ⌘⇧E'],
] as const;

export function PickerPlusScreen() {
  return (
    <Frame kind="popup" dims="popup 640 px, 40 px from the top" label="picker-plus popup: Go to picker with rows that open the other mods">
      <Bar>
        <Title>Go to…</Title>
        <Push />
        <Dim>Esc</Dim>
      </Bar>
      <Search>Go to a tab, space or agent…</Search>
      <List>
        {PICKER_ROWS.map(([label, hint], i) => (
          <Row selected={i === 0} key={label}>
            <b>▸</b> {label} <Push /> <Dim>{hint}</Dim>
          </Row>
        ))}
        <Row><Kbd>A</Kbd> <b>api-service</b></Row>
        <Row><Dim>●</Dim> Tab 1 <Chip>needs you</Chip> <Push /> <Dim>claude +2</Dim></Row>
      </List>
    </Frame>
  );
}
