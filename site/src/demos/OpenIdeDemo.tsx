import {Stage, type Act} from '../stageshow/kit';
import {HerdrWindow, Out, Swap3, Term} from './shared';

type S = {tab: 0 | 1; toast: 1 | 2; show: boolean};

const initial: S = {tab: 0, toast: 1, show: false};
const POSTER: S = {tab: 0, toast: 1, show: true};
const REST = {wide: {x: 470, y: 352}, compact: {x: 200, y: 352}};

async function script(a: Act<S>) {
  await a.wait(900);
  await a.key('cmd+shift+e');
  a.mark('rider');
  await a.set({toast: 1, show: true});
  await a.wait(2000);
  await a.set({show: false});
  await a.move('tab-web');
  await a.wait(200);
  await a.click();
  await a.set({tab: 1});
  await a.move('rest');
  await a.wait(500);
  await a.key('cmd+shift+e');
  await a.set({toast: 2, show: true});
  await a.wait(2000);
  await a.set({show: false});
  await a.move('tab-billing');
  await a.wait(200);
  await a.click();
  await a.set({tab: 0});
  await a.move('rest');
  await a.snap({toast: 1});
  await a.wait(400);
}

const TOASTS = [
  {title: 'Opened in Rider', body: '~/code/billing-service/Billing.sln'},
  {title: 'Opened in VS Code', body: '~/code/web-app'},
] as const;

export function OpenIdeDemo() {
  return (
    <Stage<S> width={720} height={400} compact={{below: 600, width: 358, height: 400}} theme="dark" initial={initial} poster={POSTER} script={script} cursor={{at: REST}} className="hdemo oi">
      {(s) => {
        const toast = TOASTS[s.toast - 1];
        return (
          <>
            <HerdrWindow hint="Open in IDE" keys="⌘⇧E">
              <div className="hd-tabs">
                <span className="hd-tab" data-on={s.tab === 0 || undefined} data-target="tab-billing" data-cursor="pointer">billing-service</span>
                <span className="hd-tab" data-on={s.tab === 1 || undefined} data-target="tab-web" data-cursor="pointer">web-app</span>
              </div>
              <div className="oi-term">
                <Swap3
                  on={s.tab}
                  items={[
                    <Term>
                      <Out tone="cool">~/code/billing-service <span className="oi-git">main</span></Out>
                      <Out>$ ls</Out>
                      <Out tone="dim">Billing.sln   src/   tests/   README.md</Out>
                      <Out>$ dotnet test</Out>
                      <Out tone="ok">Passed!  Failed: 0, Passed: 212</Out>
                      <Out>$ <i className="hd-caret" /></Out>
                    </Term>,
                    <Term>
                      <Out tone="cool">~/code/web-app <span className="oi-git">feat/checkout</span></Out>
                      <Out>$ ls</Out>
                      <Out tone="dim">package.json   src/   vite.config.ts</Out>
                      <Out>$ npm run test</Out>
                      <Out tone="ok">✓ 48 tests passed</Out>
                      <Out>$ <i className="hd-caret" /></Out>
                    </Term>,
                  ]}
                />
              </div>
              <div className="oi-toast" data-show={s.show || undefined}>
                <b className="oi-check">✓</b>
                <span className="oi-text">
                  <b>{toast.title}</b>
                  <span>{toast.body}</span>
                </span>
              </div>
            </HerdrWindow>
            <i data-target="rest" className="hd-rest" />
          </>
        );
      }}
    </Stage>
  );
}
