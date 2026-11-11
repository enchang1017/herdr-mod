import {Collapse, Stage, type Act} from '../stageshow/kit';
import {SearchField, HerdrWindow, Out, PaneHead, Tabs, Term} from './shared';

type S = {q: string; show: boolean};

const initial: S = {q: '', show: true};
const POSTER: S = {q: 'git', show: true};

async function script(a: Act<S>) {
  await a.wait(900);
  await a.type('q', 'git', {interval: 150});
  a.mark('filtered');
  await a.wait(1600);
  await a.key('enter');
  await a.set({show: false});
  await a.wait(1400);
  await a.snap({q: ''});
  await a.key('cmd+p');
  await a.set({show: true});
  await a.wait(900);
}

const ROWS = [
  ['k9s', 'Kubernetes, read-only'],
  ['Orbit', 'local dev env'],
  ['Git changes', 'change radar, graph'],
  ['Git: session changes', 'what this session changed'],
  ['Session history', 'past sessions   ⌘Y'],
  ['Jira', 'status, assign, comment   ⌘⇧J'],
  ['Open in IDE', 'Rider or VS Code   ⌘⇧E'],
] as const;

export function PickerPlusDemo() {
  return (
    <Stage<S> width={720} height={400} compact={{below: 600, width: 358, height: 400}} theme="dark" initial={initial} poster={POSTER} script={script} className="hdemo pp">
      {(s) => {
        const rows = ROWS.filter(([label]) => label.toLowerCase().includes(s.q));
        const first = rows[0]?.[0];
        return (
          <HerdrWindow>
            <Tabs items={['Tab 1', 'review']} active={0} />
            <PaneHead name="api-service" status="working" />
            <Term>
              <Out tone="dim">claude</Out>
              <Out><b>●</b> Read src/auth/login.ts</Out>
              <Out><b>●</b> Edit src/auth/login.ts</Out>
              <Out><b>●</b> Bash npm test -- auth</Out>
              <Out tone="ok">  ✓ 14 passed</Out>
              <Out tone="cool">✻ Writing the SSO callback…</Out>
            </Term>
            <section className="pp-pop" data-show={s.show || undefined}>
              <div className="pp-head">
                <span className="hd-title">Go to…</span>
                <span className="hd-push" />
                <span className="hd-meta">Esc</span>
              </div>
              <SearchField value={s.q} placeholder="Go to a tab, space or agent…" />
              <div className="pp-list">
                {ROWS.map(([label, hint]) => (
                  <Collapse key={label} open={label.toLowerCase().includes(s.q)}>
                    <div className="pp-row" data-on={label === first || undefined}>
                      <b className="pp-arrow">▸</b>
                      <span className="pp-label">{label}</span>
                      <span className="hd-push" />
                      <span className="hd-meta pp-hint">{hint}</span>
                    </div>
                  </Collapse>
                ))}
              </div>
            </section>
          </HerdrWindow>
        );
      }}
    </Stage>
  );
}
