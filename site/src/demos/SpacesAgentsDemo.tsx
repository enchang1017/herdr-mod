import {Collapse, Meter, Roll, Stage, Window, type Act} from '../stageshow/kit';
import {Out, PaneHead, StatusChip, Term, WinBar, type Status} from './shared';

type S = {codex: Status; focus: 'claude' | 'codex'; quota: number};

const initial: S = {codex: 'working', focus: 'claude', quota: 38};
const POSTER: S = {codex: 'blocked', focus: 'claude', quota: 41};
const REST = {wide: {x: 470, y: 352}, compact: {x: 200, y: 352}};

async function script(a: Act<S>) {
  await a.wait(1000);
  a.mark('blocked');
  await a.set({codex: 'blocked', quota: 41});
  await a.wait(1300);
  await a.move('agent-codex');
  await a.wait(200);
  await a.click();
  await a.set({focus: 'codex'});
  await a.move('rest');
  await a.wait(800);
  await a.key('1');
  await a.set({codex: 'working'});
  await a.wait(1800);
  await a.move('agent-claude');
  await a.wait(200);
  await a.click();
  await a.set({focus: 'claude', quota: 38});
  await a.move('rest');
  await a.wait(600);
}

function Agent({name, status, ctx, age, on, target}: {name: string; status: Status; ctx: string; age: string; on: boolean; target: string}) {
  return (
    <div className="sa-agent" data-on={on || undefined} data-target={target} data-cursor="pointer">
      <span className="sa-agent__name">{name}</span>
      <span className="sa-agent__meta">
        <StatusChip status={status} />
        <span className="hd-meta">{ctx}</span>
        <span className="hd-push" />
        <span className="hd-meta">{age}</span>
      </span>
    </div>
  );
}

function Sidebar({s}: {s: S}) {
  return (
    <nav className="sa-side">
      <div className="sa-head">
        <b>Spaces &amp; Agents</b>
        <span className="hd-push" />
        <span className="hd-meta">+</span>
      </div>
      <div className="sa-space"><span className="sa-badge">A</span><b>api-service</b><span className="hd-push" /><span className="sa-ahead">↑2</span></div>
      <div className="sa-tab">▾ Tab 1</div>
      <Agent name="claude" status="working" ctx="ctx 42%" age="3m" on={s.focus === 'claude'} target="agent-claude" />
      <Agent name="codex" status={s.codex} ctx="ctx 18%" age={s.codex === 'blocked' ? '<1m' : '12m'} on={s.focus === 'codex'} target="agent-codex" />
      <div className="sa-space"><span className="sa-badge sa-badge--w">W</span><b>web-app</b><span className="hd-push" /><span className="hd-meta">main</span></div>
      <div className="sa-lost"><span>Lost agents 1</span><span className="hd-push" /><span className="hd-chip">Revive all</span></div>
            <div className="sa-quota">
        <span className="sa-q">quota 5h <Meter value={s.quota / 100} tone="success" className="sa-meter" /> <Roll>{`${s.quota}%`}</Roll></span>
        <span className="sa-q">quota wk <Meter value={0.61} tone="success" className="sa-meter" /> 61%</span>
      </div>
    </nav>
  );
}

export function SpacesAgentsDemo() {
  return (
    <Stage<S> width={720} height={400} compact={{below: 600, width: 358, height: 400}} theme="dark" initial={initial} poster={POSTER} script={script} cursor={{at: REST}}
      keys="bottom-right" className="hdemo sa">
      {(s, _r, layout) => (
        <>
          <Window title="api-service" toolbar={<WinBar />} sidebar={<Sidebar s={s} />} sidebarWidth={layout === 'compact' ? 200 : 250} className="hd-win">
            <div className="hd-body sa-body">
              <section className="sa-pane">
                <PaneHead name="claude" status="working" focused={s.focus === 'claude'} />
                <Term>
                  <Out><b>●</b> Read src/auth/login.ts</Out>
                  <Out><b>●</b> Edit src/auth/login.ts <span className="sa-add">+12</span></Out>
                  <Out><b>●</b> Bash npm test -- auth</Out>
                  <Out tone="ok">  ✓ 14 passed</Out>
                  <Out tone="cool">✻ Writing the SSO callback…</Out>
                </Term>
              </section>
              <section className="sa-pane">
                <PaneHead name="codex" status={s.codex} focused={s.focus === 'codex'} />
                <Term>
                  <Out><b>●</b> Updated src/session.ts</Out>
                  <Out><b>●</b> Updated src/session.test.ts</Out>
                  <Collapse open={s.codex === 'blocked'}>
                    <div className="sa-ask">
                      <Out tone="warn">Apply the migration to the dev DB?</Out>
                      <Out>  1. Yes   2. No</Out>
                    </div>
                  </Collapse>
                  <Out tone="cool">✻ Running the migration…</Out>
                </Term>
              </section>
            </div>
          </Window>
          <i data-target="rest" className="hd-rest" />
        </>
      )}
    </Stage>
  );
}
