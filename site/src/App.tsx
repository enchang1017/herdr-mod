import {Theme} from '@astryxdesign/core/theme';
import {blueprintTheme} from './themes/blueprint.js';
import {SiteFooter, SiteNav} from './sections/Chrome';
import {Closing, Guards} from './sections/Closing';
import {Hero} from './sections/Hero';
import {Register} from './sections/Register';
import {Sheets} from './sections/Sheets';

export default function App() {
  return (
    <Theme theme={blueprintTheme}>
      <SiteNav />
      <main id="top">
        <Hero />
        <Register />
        <Sheets />
        <Guards />
        <Closing />
      </main>
      <SiteFooter />
    </Theme>
  );
}
