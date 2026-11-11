import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {SidebarDrawing} from '../drawings/SidebarDrawing';
import {InstallBox} from './InstallBox';

const GUARDS = [
  {mod: 'jira', text: 'Moving, assigning or commenting first shows a card with the exact acli command it will run.'},
  {mod: 'k9s', text: 'Read-only unless you list a context in its settings. Delete, restart and scale ask, then go to an audit log.'},
  {mod: 'change-radar', text: 'Reads merge requests and pipelines through glab. It never writes to GitLab.'},
] as const;

const STEPS = [
  'Copies the folder into ~/.config/herdr-app/mods.',
  'Merges keys.json, asking before it takes one of yours.',
  'Runs herdr-app check.',
] as const;

export function Guards() {
  return (
    <section className="section band guards" aria-labelledby="guards-title">
      <header className="container">
        <Heading level={2} id="guards-title">
          Writes ask first
        </Heading>
      </header>
      <dl className="container rows">
        {GUARDS.map((g) => (
          <article className="row" key={g.mod}>
            <dt>
              <Heading level={3}>{g.mod}</Heading>
            </dt>
            <dd>
              <Text as="p" type="large">{g.text}</Text>
            </dd>
          </article>
        ))}
      </dl>
    </section>
  );
}

export function Closing() {
  return (
    <section className="section closing" id="install" aria-labelledby="install-title">
      <section className="container closing-grid">
        <figure className="fig closing-fig">
          <SidebarDrawing />
          <figcaption>
            <Text type="code" color="secondary">Sheet 06, spaces-agents</Text>
          </figcaption>
        </figure>
        <article className="closing-copy">
          <Heading level={2} id="install-title">
            Start with the sidebar
          </Heading>
          <Text as="p" type="large" color="secondary" className="lead">
            Its layout comes with it. Add the other nine one at a time.
          </Text>
          <InstallBox id="install-close" initial="spaces-agents" hasPicker={false} />
          <ol className="steps-list">
            {STEPS.map((s) => (
              <li key={s}>
                <Text>{s}</Text>
              </li>
            ))}
          </ol>
        </article>
      </section>
    </section>
  );
}
