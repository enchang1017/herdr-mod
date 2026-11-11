import {Collapse, Roll, Stage, type Act} from '../stageshow/kit';
import {HerdrWindow, Out, PaneHead, Tabs, Term, type Status} from './shared';

type S = {blocked: boolean; open: boolean; focus: boolean; count: number};

const initial: S = {blocked: false, open: false, focus: false, count: 1};
const POSTER: S = {blocked: true, open: true, focus: false, count: 2};
const REST = {wide: {x: 470, y: 352}, compact: {x: 200, y: 352}};

async function script(a: Act<S>) {
  await a.wait(1000);
  a.mark('blocked');
  await a.set({blocked: true, count: 2});
  await a.wait(1100);
  await a.move('peek');
  await a.set({open: true});
  await a.wait(1300);
  await a.move('row-web');
  await a.wait(250);
  await a.click();
  await a.set({focus: true, open: false});
  await a.wait(700);
  await a.key('y');
  await a.set({blocked: false, count: 1});
  await a.move('rest');
  await a.wait(2000);
  await a.set({focus: false});
  await a.wait(800);
}

function ApiPane() {
  return (
    <section className="ar-pane">
      <PaneHead name="api-service" status="working" />
      <Term>
        <Out tone="dim">claude</Out>
        <Out><b>●</b> Read src/auth/login.ts</Out>
        <Out><b>●</b> Edit src/auth/login.ts <span className="ar-add">+12</span> <span className="ar-del">−3</span></Out>
        <Out><b>●</b> Bash npm run lint</Out>
        <Out tone="ok">  ✓ 0 problems</Out>
        <Out><b>●</b> Write src/auth/callback.ts</Out>
        <Out tone="dim">  ⎿ 48 lines</Out>
        <Out><b>●</b> Bash npm test -- auth</Out>
        <Out tone="ok">  ✓ 14 passed</Out>
        <Out tone="cool">✻ Writing the SSO callback…</Out>
      </Term>
    </section>
  );
}

function WebPane({blocked, focus}: {blocked: boolean; focus: boolean}) {
  const status: Status = blocked ? 'blocked' : 'working';
  return (
    <section className="ar-pane">
      <PaneHead name="web-app" status={status} focused={focus} />
      <Term>
        <Out tone="dim">codex</Out>
        <Out><b>●</b> Updated checkout/form.tsx</Out>
        <Out><b>●</b> Updated checkout/total.ts</Out>
        <Out><b>●</b> Updated checkout/tax.ts</Out>
        <Out tone="dim">  3 files changed</Out>
        <Collapse open={blocked} reveal="drop">
          <div className="ar-ask">
            <Out tone="warn">Run npm test now?</Out>
            <Out>  1. Yes   2. No</Out>
          </div>
        </Collapse>
        <Out tone="cool">✻ Checking the totals…</Out>
      </Term>
    </section>
  );
}

function Drawer({s}: {s: S}) {
  return (
    <aside className="ar-drawer" data-open={s.open || undefined}>
      <div className="ar-col" data-target="peek">
        <span className="ar-count" data-blocked={s.blocked || undefined}>
          <Roll>{String(s.count)}</Roll>
        </span>
        <Collapse open={s.blocked}>
          <span className="ar-badge ar-badge--blocked">!</span>
        </Collapse>
        <span className="ar-badge ar-badge--done" />
      </div>
      <div className="ar-card">
        <header className="ar-card__head">
          <span className="hd-chip">All</span>
          <span className="hd-push" />
          <span className="ar-x">✕</span>
        </header>
        <Collapse open={s.blocked}>
          <div className="ar-row" data-target="row-web" data-cursor="pointer">
            <span className="ar-row__main">
              <span className="ar-row__name">codex</span>
              <span className="ar-row__where">web-app, review</span>
            </span>
            <span className="ar-row__age">12s</span>
          </div>
        </Collapse>
        <div className="ar-row">
          <span className="ar-row__main">
            <span className="ar-row__name">claude</span>
            <span className="ar-row__where">infra, Tab 2</span>
          </span>
          <span className="ar-row__age">4m</span>
        </div>
      </div>
    </aside>
  );
}

export function AgentRadarDemo() {
  return (
    <Stage<S>
      width={720}
      height={400}
      compact={{below: 600, width: 358, height: 400}}
      theme="dark"
      initial={initial}
      poster={POSTER}
      script={script}
      cursor={{at: REST}}
      keys="bottom-right"
      className="hdemo ar"
    >
      {(s, _rect, layout) => (
        <>
          <HerdrWindow>
              <Tabs items={['Tab 1', 'review', 'Tab 2']} active={0} />
              <div className="ar-panes">
                {layout === 'wide' && <ApiPane />}
                <WebPane blocked={s.blocked} focus={s.focus} />
              </div>
              <Drawer s={s} />
          </HerdrWindow>
          <i data-target="rest" className="ar-rest" />
        </>
      )}
    </Stage>
  );
}
