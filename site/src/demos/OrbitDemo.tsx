import {Meter, Roll, Stage, type Act} from '../stageshow/kit';
import {HerdrWindow, Swap3} from './shared';

type S = {worker: 'starting' | 'healthy'; confirm: boolean};

const initial: S = {worker: 'starting', confirm: false};
const POSTER: S = {worker: 'healthy', confirm: false};
const REST = {wide: {x: 470, y: 352}, compact: {x: 200, y: 352}};

async function script(a: Act<S>) {
  await a.wait(1600);
  a.mark('healthy');
  await a.set({worker: 'healthy'});
  await a.wait(1800);
  await a.move({at: 'restart', x: 0.9, y: 0.85});
  await a.wait(200);
  await a.click();
  await a.set({confirm: true});
  await a.wait(1100);
  await a.move({at: 'restart-yes', x: 0.9, y: 0.85});
  await a.wait(200);
  await a.click();
  await a.set({confirm: false, worker: 'starting'});
  await a.move('rest');
  await a.wait(900);
}

const ROWS = [
  {name: 'api', kind: 'service', port: '8080', up: '2h'},
  {name: 'postgres', kind: 'container', port: '5432', up: '2h'},
  {name: 'redis', kind: 'container', port: '6379', up: '2h'},
] as const;

export function OrbitDemo() {
  return (
    <Stage<S> width={720} height={400} compact={{below: 600, width: 358, height: 400}} theme="dark" initial={initial} poster={POSTER} script={script} cursor={{at: REST}} className="hdemo ob">
      {(s) => {
        const healthy = s.worker === 'healthy' ? 4 : 3;
        return (
          <>
            <HerdrWindow title="Orbit" hint="Refresh" keys="r">
              <div className="hd-head">
                <span className="hd-title">Orbit</span>
                <span className="hd-meta">local</span>
                <span className="hd-chip" data-tone="ok">daemon running</span>
                <Meter value={healthy / 4} tone={healthy === 4 ? 'success' : 'warning'} className="ob-meter" />
                <span className="hd-meta"><Roll>{`${healthy}/4 healthy`}</Roll></span>
              </div>
              <div className="hd-tabs ob-tabs">
                {['Resources 1', 'Logs 2', 'Traces 3', 'DB 4'].map((t, i) => (
                  <span key={t} className="hd-tab" data-on={i === 0 || undefined}>{t}</span>
                ))}
              </div>
              <div className="ob-table">
                <span className="ob-th">name</span><span className="ob-th">kind</span><span className="ob-th">state</span><span className="ob-th ob-wide">ports</span><span className="ob-th ob-wide">uptime</span><span className="ob-th" />
                {ROWS.slice(0, 2).map((r) => <Line key={r.name} {...r} />)}
                <span className="ob-name"><i className="hd-dot" data-status={s.worker === 'healthy' ? 'done' : 'blocked'} /> worker</span>
                <span className="hd-meta">service</span>
                <span className="ob-state" data-state={s.worker}>
                  <Swap3 on={s.worker === 'healthy' ? 1 : 0} items={['starting  2/5', 'healthy']} />
                </span>
                <span className="hd-meta ob-wide">9090</span>
                <span className="hd-meta ob-wide"><Swap3 on={s.worker === 'healthy' ? 1 : 0} items={['-', '6s']} /></span>
                <span className="ob-act">
                  <span className="hd-chip" data-target="restart" data-cursor="pointer">Restart</span>
                </span>
                {ROWS.slice(2).map((r) => <Line key={r.name} {...r} />)}
              </div>
              <div className="ob-confirm" data-show={s.confirm || undefined}>
                <b>Restart worker?</b>
                <span className="hd-meta">orbit restart worker</span>
                <span className="hd-chip" data-tone="solid" data-target="restart-yes" data-cursor="pointer">Restart</span>
              </div>
            </HerdrWindow>
            <i data-target="rest" className="hd-rest" />
          </>
        );
      }}
    </Stage>
  );
}

function Line({name, kind, port, up}: {name: string; kind: string; port: string; up: string}) {
  return (
    <>
      <span className="ob-name"><i className="hd-dot" data-status="done" /> {name}</span>
      <span className="hd-meta">{kind}</span>
      <span className="ob-state" data-state="healthy">healthy</span>
      <span className="hd-meta ob-wide">{port}</span>
      <span className="hd-meta ob-wide">{up}</span>
      <span />
    </>
  );
}
