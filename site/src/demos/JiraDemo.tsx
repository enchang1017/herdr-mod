import {Collapse, Stage, type Act} from '../stageshow/kit';
import {HerdrWindow} from './shared';

type S = {drawer: boolean; confirm: boolean; moved: boolean};

const initial: S = {drawer: false, confirm: false, moved: false};
const POSTER: S = {drawer: true, confirm: true, moved: false};
const REST = {wide: {x: 470, y: 352}, compact: {x: 200, y: 352}};

async function script(a: Act<S>) {
  await a.wait(800);
  await a.move({at: 'card-121', x: 0.85, y: 0.8});
  await a.wait(200);
  await a.click();
  await a.set({drawer: true});
  await a.wait(900);
  await a.move({at: 'status', x: 0.85, y: 0.8});
  await a.wait(200);
  await a.click();
  a.mark('confirm');
  await a.set({confirm: true});
  await a.wait(2000);
  await a.move({at: 'confirm-btn', x: 0.88, y: 0.8});
  await a.wait(200);
  await a.click();
  await a.set({confirm: false});
  await a.wait(250);
  await a.set({drawer: false, moved: true});
  await a.move('rest');
  await a.wait(2400);
  await a.set({moved: false});
  await a.wait(900);
}

function Card({id, title, done, target}: {id: string; title: string; done?: boolean; target?: string}) {
  return (
    <div className="jr-card" data-done={done || undefined} data-target={target} data-cursor={target ? 'pointer' : undefined}>
      <span className="jr-key">{done ? '✓ ' : ''}{id}</span>
      <span className="jr-title">{title}</span>
    </div>
  );
}

function Board({s}: {s: S}) {
  return (
    <div className="jr-board">
      {['To do', 'In progress', 'Code review', 'Done'].map((c) => (
        <span key={c} className="jr-colhead">{c}</span>
      ))}
      <div className="jr-lane">
        <b>▾ PROJ-120</b> Login with SSO <span className="hd-meta">2/5</span>
      </div>
      <div className="jr-col">
        <Card id="PROJ-124" title="Session refresh" />
      </div>
      <div className="jr-col">
        <Collapse open={!s.moved}>
          <Card id="PROJ-121" title="Callback route" target="card-121" />
        </Collapse>
        <Card id="PROJ-122" title="Token storage" />
      </div>
      <div className="jr-col">
        <Collapse open={s.moved} reveal="drop">
          <Card id="PROJ-121" title="Callback route" />
        </Collapse>
        <Card id="PROJ-123" title="Login button" />
      </div>
      <div className="jr-col">
        <Card id="PROJ-125" title="SSO config" done />
      </div>
    </div>
  );
}

function Drawer({s}: {s: S}) {
  return (
    <aside className="jr-drawer" data-open={s.drawer || undefined}>
      <div className="jr-drawer__head">
        <b className="jr-drawer__key">PROJ-121</b>
        <span className="hd-meta">Sub-task</span>
      </div>
      <div className="jr-drawer__title">Callback route</div>
      <div className="jr-chips">
        <span className="hd-chip" data-tone="cool">In progress</span>
        <span className="hd-chip">Sprint 14</span>
      </div>
      <div className="jr-actions">
        <span className="hd-chip jr-btn" data-tone="amber" data-target="status" data-cursor="pointer">Status t</span>
        <span className="hd-chip jr-btn">Assign me a</span>
      </div>
      <Collapse open={s.confirm} reveal="drop">
        <div className="jr-confirm">
          <b>Move to CodeReview</b>
          <span className="hd-meta">Runs exactly</span>
          <code className="jr-cmd">acli jira workitem transition --key PROJ-121 --status "CodeReview"</code>
          <div className="jr-confirm__btns">
            <span className="hd-chip">Cancel esc</span>
            <span className="hd-chip" data-tone="solid" data-target="confirm-btn" data-cursor="pointer">Confirm ↵</span>
          </div>
        </div>
      </Collapse>
    </aside>
  );
}

export function JiraDemo() {
  return (
    <Stage<S> width={720} height={400} compact={{below: 600, width: 358, height: 400}} theme="dark" initial={initial} poster={POSTER} script={script} cursor={{at: REST}} className="hdemo jr">
      {(s) => (
        <>
          <HerdrWindow title="Jira" hint="Refresh" keys="r">
            <div className="hd-tabs">
              {['Mine 1', 'Board 2', 'In progress 3', 'Sprint 6', 'JQL 7'].map((t, i) => (
                <span key={t} className="hd-tab" data-on={i === 1 || undefined}>{t}</span>
              ))}
            </div>
            <div className="jr-sprint">
              <b>Sprint 14</b>
              <span className="hd-chip">4d left</span>
              <span className="hd-meta">Ship SSO login to staging</span>
            </div>
            <Board s={s} />
            <Drawer s={s} />
          </HerdrWindow>
          <i data-target="rest" className="hd-rest" />
        </>
      )}
    </Stage>
  );
}
