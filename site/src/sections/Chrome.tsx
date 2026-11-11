import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {REPO_URL} from '../data/mods';

export function SiteNav() {
  return (
    <nav className="masthead" aria-label="Site">
      <section className="container masthead-row">
        <span className="masthead-brand">
          <a className="wordmark" href="#top" aria-label="herdr-mod, back to top">
            herdr-mod
          </a>
          <a className="herdr-link" href="https://herdr.dev" target="_blank" rel="noopener">
            <img src="/herdr-icon.svg" alt="" width="22" height="22" />
            for Herdr
          </a>
        </span>
        <ul className="masthead-links">
          <li>
            <Link href="#register">Register</Link>
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
          Mods and a layout for <Link href="https://herdr.dev">Herdr</Link> (<Link href="https://github.com/herdrdev/herdr-app">github.com/herdrdev/herdr-app</Link>). An unofficial community project, not made by the Herdr team. The Herdr icon comes from herdrdev/herdr-app under Apache-2.0. Icons in the mods are Lucide, ISC licence. Source at <Link href={REPO_URL}>github.com/enchang1017/herdr-mod</Link>.
        </Text>
      </section>
    </footer>
  );
}
