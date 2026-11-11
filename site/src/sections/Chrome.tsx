import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {REPO_URL} from '../data/mods';

export function SiteNav() {
  return (
    <nav className="masthead" aria-label="Site">
      <section className="container masthead-row">
        <a className="wordmark" href="#top" aria-label="herdr-mod, back to top">
          herdr-mod
        </a>
        <ul className="masthead-links">
          <li>
            <Link href="#register">Register</Link>
          </li>
          <li>
            <Link href="#sheets">Sheets</Link>
          </li>
          <li>
            <Link href="#install">Install</Link>
          </li>
          <li>
            <Link href={REPO_URL}>GitHub</Link>
          </li>
        </ul>
      </section>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="colophon">
      <section className="container colophon-grid">
        <a className="wordmark wordmark-lg" href="#top" aria-label="herdr-mod, back to top">
          herdr-mod
        </a>
        <Text as="p" color="secondary" className="colophon-text">
          Mods and a layout for <Link href="https://herdr.dev">Herdr</Link>. Icons in the mods are Lucide, ISC licence.
          Source at <Link href={REPO_URL}>github.com/enchang1017/herdr-mod</Link>.
        </Text>
      </section>
    </footer>
  );
}
