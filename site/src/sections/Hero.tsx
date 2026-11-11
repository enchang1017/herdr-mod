import {Heading} from '@astryxdesign/core/Heading';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {MODS, REPO_URL} from '../data/mods';
import {DEMOS} from '../demos';
import {InstallBox} from './InstallBox';

interface HeroProps {
  mod: string;
  onSelect: (name: string) => void;
}

export function Hero({mod, onSelect}: HeroProps) {
  const Demo = DEMOS[mod];
  const info = MODS.find((m) => m.name === mod);
  return (
    <header className="hero" id="demo">
      <section className="container stage-grid" aria-labelledby="hero-title">
        <article className="stage-copy">
          <Heading level={1} id="hero-title" className="title-display">
            Ten mods for the Herdr window
          </Heading>
          <Text as="p" type="large" className="lead">
            Agent status, git, CI, Kubernetes and Jira, inside the Herdr app.
          </Text>
          <InstallBox id="install-hero" mod={mod} onSelect={onSelect} />
          <Link href={REPO_URL} isStandalone hasUnderline>
            Read the source on GitHub
          </Link>
        </article>
        <section className="stage-fig" role="img" aria-label={`Animated demo of ${mod}: ${info?.does ?? ""}`}>
          <Demo key={mod} />
          {info && (
            <Text as="p" color="secondary" className="stage-caption">
              <b>{info.name}</b> {info.does} <Text type="code">{info.opens}</Text>
            </Text>
          )}
        </section>
      </section>
    </header>
  );
}
