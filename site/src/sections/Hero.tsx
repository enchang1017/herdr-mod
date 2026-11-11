import {Heading} from '@astryxdesign/core/Heading';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {GeneralArrangement} from '../drawings/GeneralArrangement';
import {REPO_URL} from '../data/mods';
import {InstallBox} from './InstallBox';

export function Hero() {
  return (
    <header className="hero">
      <section className="container stage-grid" aria-labelledby="hero-title">
        <article className="stage-copy">
          <Heading level={1} id="hero-title" className="title-display">
            Ten mods for the Herdr window
          </Heading>
          <Text as="p" type="large" className="lead">
            Agent status, git, CI, Kubernetes and Jira, inside the Herdr app.
          </Text>
          <InstallBox id="install-hero" initial="agent-radar" />
          <Link href={REPO_URL} isStandalone hasUnderline>
            Read the source on GitHub
          </Link>
        </article>
        <figure className="fig stage-fig">
          <GeneralArrangement />
          <figcaption className="visually-hidden">General arrangement of the Herdr window</figcaption>
        </figure>
      </section>
    </header>
  );
}
