import {Bar, Chip, Dim, Foot, Frame, Kbd, Line, List, Meter, Push, Row, Tabs, Title} from './kit';

const REPOS = [
  {state: '○', path: 'api-service', branch: 'feature/login', mr: '!42 open', ci: 'CI ✓', age: '5m', counts: '2 uncommitted  3 unpushed  6 files  +120 −34'},
  {state: '✓', path: 'web-app', branch: 'main', mr: '', ci: '', age: '1h', counts: '1 uncommitted  1 file  +4 −1'},
  {state: '▲', path: 'infra/charts', branch: 'fix/ingress', mr: '!17 draft', ci: 'CI ✕', age: '3h', counts: '4 unpushed  1 unmerged  9 files  +210 −88'},
] as const;

export function ChangeRadarScreen() {
  return (
    <Frame dims="window 60 × 85%" label="change-radar window: repos with uncommitted, unpushed or unmerged work, with MR and CI">
      <Bar>
        <Title>Git</Title>
        <Tabs items={['Change radar', 'Graph', 'Session']} active={0} />
        <Push />
        <Dim>Dock ⌘↵</Dim>
      </Bar>
      <Line>
        <b>Change radar</b> <Chip solid>2 to review</Chip> <Chip>3 changed</Chip> <Dim>12 repos</Dim> <Push /> <Chip>Refresh</Chip>
      </Line>
      <Line><Dim>~/code  space api-service</Dim></Line>
      <List>
        {REPOS.map((r, i) => (
          <Row tall selected={i === 0} key={r.path}>
            <Line>
              <b>{r.state}</b> <b>{r.path}</b> <Dim>{r.branch}</Dim> <Push />
              {r.mr && <Chip>{r.mr}</Chip>} {r.ci && <Chip solid={r.ci.includes('✕')}>{r.ci}</Chip>} <Dim>{r.age}</Dim> <Dim>Graph</Dim>
            </Line>
            <Line><Dim>{r.counts}</Dim></Line>
          </Row>
        ))}
      </List>
      <Foot>
        <Line><Dim>○ to review   ✓ reviewed   ▲ changed since review</Dim></Line>
      </Foot>
    </Frame>
  );
}

const MEMBERS = [
  {name: 'reviewer', tpl: 'reviewer', status: 'working', repo: 'api-service', age: '4m'},
  {name: 'mr-142', tpl: 'mr-reviewer', status: 'done', repo: 'group/web-app', age: '18m'},
] as const;

export function TeamScreen() {
  return (
    <Frame dims="window 55 × 80%" label="team window: start dev, review a merge request, launch template agents, see running agents">
      <Bar>
        <Title>Team</Title>
        <Dim>esc closes</Dim>
        <Push />
        <Chip>Reload</Chip>
        <Dim>Dock ⌘↵</Dim>
      </Bar>
      <Tabs items={['Start dev', 'Review MR', 'Agents', 'Running 2']} active={0} />
      <Line><Dim>New tab running claude /dev-lead with the Jira key and plan link.</Dim></Line>
      <dl className="s-form">
        <dt>JIRA</dt><dd>PROJ-123 (optional)</dd>
        <dt>PLAN</dt><dd>https://… plan link (optional)</dd>
        <dt>FOLDER</dt><dd>~/code</dd>
        <dt>MACHINE</dt><dd>This Mac</dd>
      </dl>
      <Line><Chip solid>Start dev</Chip></Line>
      <List>
        {MEMBERS.map((m) => (
          <Row key={m.name}>
            <b>{m.name}</b> <Chip>{m.tpl}</Chip> <Chip solid={m.status === 'working'}>{m.status}</Chip> <Dim>{m.repo}</Dim> <Push /> <Dim>{m.age}</Dim>
          </Row>
        ))}
      </List>
      <Foot><Line><Dim>2 running   0 waiting</Dim></Line></Foot>
    </Frame>
  );
}

export function OpenIdeScreen() {
  return (
    <Frame kind="toast" dims="no window, a 4 s toast" label="open-ide toasts saying which IDE opened the folder">
      <List>
        <Row tall>
          <Line><b>✓</b> <b>Opened in Rider</b></Line>
          <Line><Dim>~/code/billing-service</Dim></Line>
        </Row>
        <Row tall>
          <Line><b>✓</b> <b>Opened in VS Code</b></Line>
          <Line><Dim>~/code/web-app</Dim></Line>
        </Row>
        <Row tall>
          <Line><b>✓</b> <b>Opened in VS Code (Remote-SSH build-box)</b></Line>
          <Line><Dim>~/src/infra</Dim></Line>
        </Row>
      </List>
      <Foot><Line><Kbd>⌘⇧E</Kbd> <Dim>on the focused terminal: .NET goes to Rider, the rest to VS Code</Dim></Line></Foot>
    </Frame>
  );
}

export function OrbitScreen() {
  const rows = [
    ['●', 'api', 'service', 'healthy', '8080', '2h', '0'],
    ['●', 'postgres', 'container', 'healthy', '5432', '2h', '0'],
    ['◐', 'worker', 'service', 'starting', '', '12s', '1'],
    ['●', 'redis', 'container', 'healthy', '6379', '2h', '0'],
  ] as const;
  return (
    <Frame dims="window 75 × 80%" label="orbit window: local dev environment resources, logs, traces and DB drift">
      <Bar>
        <Title>Orbit</Title>
        <Dim>local</Dim>
        <Chip solid>daemon running</Chip>
        <Meter value={75} />
        <Dim>3/4 healthy</Dim>
        <Push />
        <Dim>updated 12:04:31</Dim>
        <Chip>Stop daemon</Chip>
      </Bar>
      <Line><Dim>INSTANCE</Dim> <Chip solid>● default 3/4</Chip> <Chip>2 stale</Chip></Line>
      <Tabs items={['RESOURCES 1', 'LOGS 2', 'TRACES 3', 'DB 4']} active={0} />
      <table className="s-table">
        <thead><tr><th /><th>name</th><th>kind</th><th>state</th><th>ports</th><th>uptime</th><th>restarts</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[1]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </Frame>
  );
}
