import {useState} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {consoleTheme} from './themes/console.js';
import {SiteFooter, SiteNav} from './sections/Chrome';
import {Closing, Guards} from './sections/Closing';
import {Hero} from './sections/Hero';
import {Register} from './sections/Register';

export default function App() {
  const [mod, setMod] = useState('agent-radar');
  return (
    <Theme theme={consoleTheme}>
      <SiteNav />
      <main id="top">
        <Hero mod={mod} onSelect={setMod} />
        <Register onSelect={setMod} />
        <Guards />
        <Closing />
      </main>
      <SiteFooter />
    </Theme>
  );
}
