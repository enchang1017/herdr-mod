import {Collapse, Roll, Stage, type Act} from '../stageshow/kit';
import {HerdrWindow, StatusChip} from './shared';

type S = {mr: boolean; mrDone: boolean; running: number};

const initial: S = {mr: false, mrDone: false, running: 2};
const POSTER: S = {mr: true, mrDone: true, running: 3};
const REST = {wide: {x: 470, y: 352}, compact: {x: 200, y: 352}};

async function script(a: Act<S>) {
  await a.wait(1000);
  a.mark('launch');
  await a.set({mr: true, running: 3});
  await a.wait(2200);
  await a.set({mrDone: true});
  await a.wait(2400);
  await a.move({at: 'dismiss', x: 0.7, y: 0.7});
  await a.wait(200);
  await a.click();
  await a.set({mr: false, running: 2});
  await a.move('rest');
  await a.wait(900);
  await a.snap({mrDone: false});
}

const TABS = ['Start dev', 'Review MR', 'Agents'] as const;

export function TeamDemo() {
  return (
    <Stage<S> width={720} height={400} compact={{below: 600, width: 358, height: 400}} theme="dark" initial={initial} poster={POSTER} script={script} cursor={{at: REST}} className="hdemo tm">
      {(s) => (
        <>
          <HerdrWindow title="Team" hint="Dock" keys="⌘↵">
            <div className="hd-tabs">
              {TABS.map((t) => (
                <span key={t} className="hd-tab">{t}</span>
              ))}
              <span className="hd-tab" data-on>
                Running <Roll>{String(s.running)}</Roll>
              </span>
            </div>
            <div className="hd-list">
              <div className="hd-row tm-row">
                <span className="hd-row__main">
                  <span className="hd-row__title">reviewer <span className="hd-chip">reviewer</span> <StatusChip status="working" /></span>
                  <span className="hd-row__sub">api-service   ~/code/api-service</span>
                </span>
                <span className="hd-meta">4m</span>
              </div>
              <div className="hd-row tm-row">
                <span className="hd-row__main">
                  <span className="hd-row__title">tester <span className="hd-chip">tester</span> <StatusChip status="idle" /></span>
                  <span className="hd-row__sub">web-app   worktree feat/checkout-tests</span>
                </span>
                <span className="hd-meta">22m</span>
              </div>
              <Collapse open={s.mr} reveal="drop">
                <div className="hd-row tm-row" data-on>
                  <span className="hd-row__main">
                    <span className="hd-row__title">
                      mr-142 <span className="hd-chip">mr-reviewer</span> <StatusChip status={s.mrDone ? 'done' : 'working'} />
                    </span>
                    <span className="hd-row__sub">group/web-app !142   Add annual plans</span>
                    <Collapse open={s.mrDone}>
                      <span className="tm-report">
                        <b>Report</b>
                        <span className="hd-chip" data-tone="bad">2 must fix</span>
                        <span className="hd-chip" data-tone="amber">3 suggestions</span>
                        <span className="hd-chip">Open</span>
                      </span>
                    </Collapse>
                  </span>
                  <span className="tm-x" data-target="dismiss" data-cursor="pointer">✕</span>
                </div>
              </Collapse>
            </div>
            <footer className="hd-foot tm-foot">
              <Roll>{`${s.mr && !s.mrDone ? 2 : 1} working   0 waiting`}</Roll>
            </footer>
          </HerdrWindow>
          <i data-target="rest" className="hd-rest" />
        </>
      )}
    </Stage>
  );
}
