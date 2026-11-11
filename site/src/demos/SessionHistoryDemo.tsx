import {Collapse, Roll, Stage, type Act} from '../stageshow/kit';
import {SearchField, HerdrWindow, Key} from './shared';

type S = {q: string; matched: boolean; resumed: boolean};

const initial: S = {q: '', matched: false, resumed: false};
const POSTER: S = {q: 'sso', matched: true, resumed: false};

async function script(a: Act<S>) {
  await a.wait(900);
  await a.type('q', 'sso', {interval: 140});
  await a.wait(300);
  a.mark('matched');
  await a.set({matched: true});
  await a.wait(1500);
  await a.key('enter');
  await a.set({resumed: true});
  await a.wait(2200);
  await a.key('escape');
  await a.set({q: '', matched: false, resumed: false});
  await a.wait(900);
}

const SESSIONS = [
  {id: 'a', tag: 'live', title: 'login flow with SSO', where: '~/code/api-service   feature/login', size: '2.1 MB', age: 'now', hit: ['…redirect to the ', 'SSO', ' callback after login'] as const},
  {id: 'b', tag: 'codex', title: 'fix flaky payment test', where: '~/code/web-app   main', size: '640 KB', age: '3h', hit: null},
  {id: 'c', tag: '', title: 'refactor auth middleware', where: '~/code/api-service   refactor/auth', size: '1.4 MB', age: '2d', hit: ['…keep the ', 'SSO', ' session cookie httpOnly'] as const},
  {id: 'd', tag: '', title: 'k8s ingress for staging', where: '~/code/infra   main', size: '310 KB', age: '5d', hit: null},
] as const;

export function SessionHistoryDemo() {
  return (
    <Stage<S> width={720} height={400} compact={{below: 600, width: 358, height: 400}} theme="dark" initial={initial} poster={POSTER} script={script} className="hdemo sh">
      {(s) => (
        <HerdrWindow title="Session history" hint="Close" keys="Esc">
          <div className="hd-pad sh-top">
            <SearchField value={s.q} placeholder="Search sessions: title, folder, then transcript text" />
            <div className="sh-status">
              <Roll>{s.matched ? '2 of 24 sessions   2 text matches' : '24 of 24 sessions'}</Roll>
            </div>
          </div>
          <div className="hd-list sh-list">
            {SESSIONS.map((x, i) => (
              <Collapse key={x.id} open={!s.matched || x.hit !== null}>
                <div className="hd-row sh-row" data-on={i === 0 || undefined}>
                  <span className="hd-row__main">
                    <span className="hd-row__title">
                      {x.tag && <span className="hd-chip" data-tone={x.tag === 'live' ? 'ok' : 'cool'}>{x.tag}</span>}
                      {x.title}
                    </span>
                    <span className="hd-row__sub">{x.where}</span>
                    {x.hit && (
                      <Collapse open={s.matched}>
                        <span className="sh-hit">
                          {x.hit[0]}<span className="hd-mark-hit">{x.hit[1]}</span>{x.hit[2]}
                        </span>
                      </Collapse>
                    )}
                  </span>
                  <span className="hd-meta">{x.size}</span>
                  <span className="hd-meta sh-age">{x.age}</span>
                </div>
              </Collapse>
            ))}
          </div>
          <footer className="hd-foot sh-foot">
            <Key>↑↓</Key> move <Key>Enter</Key> resume <Key>⌘Enter</Key> fork
          </footer>
          <div className="sh-toast" data-show={s.resumed || undefined}>
            <b>Resumed in a new tab</b>
            <span>api-service, login flow with SSO</span>
          </div>
        </HerdrWindow>
      )}
    </Stage>
  );
}
