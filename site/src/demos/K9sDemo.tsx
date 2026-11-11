import {Collapse, Stage, type Act} from '../stageshow/kit';
import {SearchField, HerdrWindow, Key} from './shared';

type S = {q: string; follow: boolean; lines: number};

const initial: S = {q: '', follow: false, lines: 0};
const POSTER: S = {q: 'pay', follow: true, lines: 4};

async function script(a: Act<S>) {
  await a.wait(900);
  await a.type('q', 'pay', {interval: 150});
  await a.wait(900);
  await a.key('enter');
  a.mark('follow');
  await a.set({follow: true});
  for (let n = 1; n <= 4; n++) {
    await a.wait(450);
    a.put({lines: n});
  }
  await a.wait(2000);
  await a.key('escape');
  await a.set({follow: false, q: ''});
  await a.wait(700);
  await a.snap({lines: 0});
  await a.wait(300);
}

const TARGETS = [
  {glyph: '●', tone: 'ok', ctx: 'prod-eu', prod: true, name: 'payments-api', ns: '', ready: '3/3'},
  {glyph: '◐', tone: 'amber', ctx: 'staging', prod: false, name: 'payments-worker', ns: 'jobs', ready: '1/2'},
  {glyph: '●', tone: 'ok', ctx: 'staging', prod: false, name: 'search-api', ns: '', ready: '2/2'},
  {glyph: '●', tone: 'ok', ctx: 'staging', prod: false, name: 'payments-api', ns: '', ready: '2/2'},
  {glyph: '✕', tone: 'bad', ctx: 'dev', prod: false, name: 'auth-mock', ns: '', ready: '0/1'},
] as const;

const LOG = [
  'payments-api-7d9f  GET  /health        200   3ms',
  'payments-api-k2x8  POST /v1/charges    201  84ms',
  'payments-api-7d9f  POST /v1/refunds    200  61ms',
  'payments-api-m4qz  GET  /v1/charges/ch 200  12ms',
] as const;

export function K9sDemo() {
  return (
    <Stage<S> width={720} height={400} compact={{below: 600, width: 358, height: 400}} theme="dark" initial={initial} poster={POSTER} script={script} className="hdemo ks">
      {(s) => {
        const hits = TARGETS.filter((t) => t.name.includes(s.q));
        return (
          <HerdrWindow title="k9s" hint="Browse" keys="tab">
            <div className="hd-head">
              <span className="hd-title">Find</span>
              <span className="hd-meta">214 targets</span>
              <span className="hd-push" />
              <span className="hd-meta ks-fresh">prod-eu 12s   staging 15s   dev 9s</span>
            </div>
            <div className="ks-search">
              <SearchField value={s.q} placeholder="deployment or statefulset name" />
            </div>
            <div className="hd-list ks-list">
              {TARGETS.map((t, i) => (
                <Collapse key={`${t.ctx}-${t.name}`} open={t.name.includes(s.q)}>
                  <div className="hd-row ks-row" data-on={(s.q ? hits[0] === t : i === 0) || undefined}>
                    <b className="ks-glyph" data-tone={t.tone}>{t.glyph}</b>
                    <span className="hd-chip ks-ctx" data-tone={t.prod ? 'bad' : undefined}>{t.ctx}{t.prod ? ' ⚠' : ''}</span>
                    <span className="hd-row__title">{t.name}</span>
                    {t.ns && <span className="hd-meta">{t.ns}</span>}
                    <span className="hd-push" />
                    <span className="hd-meta">{t.ready}</span>
                  </div>
                </Collapse>
              ))}
            </div>
            <Collapse open={s.follow} solid className="ks-logs-wrap">
              <div className="ks-logs">
                <div className="ks-logs__head">
                  <b>Following payments-api</b> <span className="hd-meta">prod-eu, 3 pods</span>
                  <span className="hd-push" />
                  <Key>Esc</Key>
                </div>
                {LOG.map((l, i) => (
                  <div key={l} className="ks-line" data-on={i < s.lines || undefined}>{l}</div>
                ))}
              </div>
            </Collapse>
          </HerdrWindow>
        );
      }}
    </Stage>
  );
}
