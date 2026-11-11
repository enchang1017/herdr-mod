import {Bar, Chip, Dim, Foot, Frame, Kbd, Line, List, Meter, Push, Row, Search, Tabs, Title} from './kit';

const COLUMNS = ['TO DO', 'IN PROGRESS', 'CODEREVIEW', 'DONE'] as const;

const LANES = [
  {
    key: 'PROJ-120',
    title: 'Login with SSO',
    done: '2/5',
    cards: [
      ['PROJ-124 Session refresh'],
      ['PROJ-121 Callback route', 'PROJ-122 Token storage'],
      ['PROJ-123 Login button'],
      ['PROJ-125 SSO config'],
    ],
  },
  {
    key: 'PROJ-130',
    title: 'Export invoices as CSV',
    done: '0/2',
    cards: [['PROJ-131 CSV writer'], ['PROJ-132 Export endpoint'], [], []],
  },
] as const;

export function JiraScreen() {
  return (
    <Frame dims="window 75 × 80%" label="jira window: the sprint board with one lane per story and sub-task cards">
      <Bar>
        <Kbd>J</Kbd>
        <Title>Jira</Title>
        <Dim>acli</Dim>
        <Meter value={40} />
        <Push />
        <Dim>updated 12:04</Dim>
        <Chip>Refresh r</Chip>
      </Bar>
      <Tabs items={['MINE 1', 'BOARD 2', 'IN PROGRESS 3', 'TO DO 4', 'RECENT 5', 'SPRINT 6', 'JQL 7']} active={1} />
      <Line>
        <b>Sprint 14</b> <Chip>4d left</Chip> <Dim>Ship SSO login to staging</Dim> <Push /> <Meter value={40} />
      </Line>
      <table className="s-board">
        <thead>
          <tr>{COLUMNS.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        {LANES.map((lane) => (
          <tbody key={lane.key}>
            <tr className="s-lane">
              <th colSpan={4}>▾ <b>{lane.key}</b> {lane.title} <Dim>{lane.done}</Dim></th>
            </tr>
            <tr>
              {lane.cards.map((col, i) => (
                <td key={i}>
                  {col.map((card) => (
                    <p className={i === 3 ? 's-card s-card-done' : 's-card'} key={card}>{card}</p>
                  ))}
                </td>
              ))}
            </tr>
          </tbody>
        ))}
      </table>
      <Foot><Line><Dim>t status   a assign me   m comment: each shows the exact acli command first</Dim></Line></Foot>
    </Frame>
  );
}

const TARGETS = [
  {glyph: '●', ctx: 'prod-eu ⚠', prod: true, name: 'payments-api', ns: '', ready: '3/3'},
  {glyph: '◐', ctx: 'staging', prod: false, name: 'payments-worker', ns: 'jobs', ready: '1/2'},
  {glyph: '●', ctx: 'staging', prod: false, name: 'payments-api', ns: '', ready: '2/2'},
  {glyph: '✕', ctx: 'dev', prod: false, name: 'payments-mock', ns: '', ready: '0/1'},
] as const;

export function K9sScreen() {
  return (
    <Frame dims="window 75 × 80%" label="k9s window: find a deployment in any kube context and follow its logs">
      <Bar>
        <Title>Find</Title>
        <Dim>214 targets</Dim>
        <Push />
        <Chip>Browse tab</Chip>
        <Chip>Reload</Chip>
        <Dim>Dock ⌘↵</Dim>
      </Bar>
      <Search>payments</Search>
      <Line><Dim>prod-eu 12s   staging 15s   dev 9s</Dim></Line>
      <List>
        {TARGETS.map((t, i) => (
          <Row selected={i === 0} key={`${t.ctx}-${t.name}`}>
            <b>{t.glyph}</b> <Chip solid={t.prod}>{t.ctx}</Chip> <b>{t.name}</b> {t.ns && <Dim>{t.ns}</Dim>} <Push /> <Dim>{t.ready}</Dim>
          </Row>
        ))}
      </List>
      <Foot>
        <Line><Kbd>Enter</Kbd> <Dim>follow logs across all pods</Dim> <Push /> <Dim>● up  ◐ partial  ✕ down</Dim></Line>
      </Foot>
    </Frame>
  );
}
