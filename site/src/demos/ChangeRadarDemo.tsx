import {Roll, Stage, type Act} from '../stageshow/kit';
import {HerdrWindow, Swap3, Tabs} from './shared';

type S = {ci: 'running' | 'passed'; reviewed: boolean; toReview: number};

const initial: S = {ci: 'running', reviewed: false, toReview: 2};
const POSTER: S = {ci: 'passed', reviewed: true, toReview: 1};
const REST = {wide: {x: 470, y: 352}, compact: {x: 200, y: 352}};

async function script(a: Act<S>) {
  await a.wait(1400);
  a.mark('passed');
  await a.set({ci: 'passed'});
  await a.wait(900);
  await a.move('review-api');
  await a.wait(200);
  await a.click();
  await a.set({reviewed: true, toReview: 1});
  await a.move('rest');
  await a.wait(2200);
  await a.set({reviewed: false, ci: 'running', toReview: 2});
  await a.wait(900);
}

const OTHERS = [
  {icon: '✓', tone: 'ok', name: 'web-app', branch: 'main', mr: '', age: '1h', counts: '1 uncommitted   1 file   +4 −1'},
  {icon: '○', tone: 'cool', name: 'infra/charts', branch: 'fix/ingress', mr: '!17 draft', age: '3h', counts: '4 unpushed   1 unmerged   9 files'},
] as const;

function Repo({s}: {s: S}) {
  return (
    <div className="hd-row cr-row" data-on>
      <span className="cr-icon" data-target="review-api" data-cursor="pointer">
        <Swap3 on={s.reviewed ? 1 : 0} items={[<b className="cr-changed">▲</b>, <b className="cr-ok">✓</b>]} />
      </span>
      <span className="hd-row__main">
        <span className="hd-row__title">
          api-service <span className="hd-meta">feature/login</span>
        </span>
        <span className="hd-row__sub">2 uncommitted   3 unpushed   6 files   +120 −34</span>
      </span>
      <span className="hd-chip">!42 open</span>
      <span className="hd-chip cr-ci" data-tone={s.ci === 'passed' ? 'ok' : 'cool'}>
        <Swap3 on={s.ci === 'passed' ? 1 : 0} items={['◌ CI running', '✓ CI passed']} />
      </span>
      <span className="hd-meta">5m</span>
    </div>
  );
}

export function ChangeRadarDemo() {
  return (
    <Stage<S> width={720} height={400} compact={{below: 600, width: 358, height: 400}} theme="dark" initial={initial} poster={POSTER} script={script} cursor={{at: REST}} className="hdemo cr">
      {(s) => (
        <>
          <HerdrWindow title="Git" hint="Dock" keys="⌘↵">
            <Tabs items={['Change radar', 'Graph', 'Session']} active={0} />
            <div className="hd-head">
              <span className="hd-title">Change radar</span>
              <span className="hd-chip" data-tone="amber">
                <Roll>{`${s.toReview} to review`}</Roll>
              </span>
              <span className="hd-chip">3 changed</span>
              <span className="hd-meta cr-hide">12 repos</span>
              <span className="hd-push" />
              <span className="hd-chip cr-hide">Refresh</span>
            </div>
            <div className="cr-root">~/code   space api-service</div>
            <div className="hd-list cr-list">
              <Repo s={s} />
              {OTHERS.map((r) => (
                <div className="hd-row cr-row" key={r.name}>
                  <span className="cr-icon"><b className={r.tone === 'ok' ? 'cr-ok' : 'cr-todo'}>{r.icon}</b></span>
                  <span className="hd-row__main">
                    <span className="hd-row__title">
                      {r.name} <span className="hd-meta">{r.branch}</span>
                    </span>
                    <span className="hd-row__sub">{r.counts}</span>
                  </span>
                  {r.mr && <span className="hd-chip">{r.mr}</span>}
                  <span className="hd-meta">{r.age}</span>
                </div>
              ))}
            </div>
            <footer className="hd-foot cr-foot">
              <span>○ to review</span>
              <span>✓ reviewed</span>
              <span>▲ changed since review</span>
            </footer>
          </HerdrWindow>
          <i data-target="rest" className="hd-rest" />
        </>
      )}
    </Stage>
  );
}
