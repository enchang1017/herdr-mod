import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

const sheet = 'oklch(97.5% 0.006 240)';
const sheet2 = 'oklch(95% 0.011 244)';
const sheet3 = 'oklch(92% 0.016 248)';
const ink = 'oklch(35% 0.105 256)';
const ink2 = 'oklch(42% 0.09 256)';
const muted = 'oklch(45% 0.075 255)';
const rule = 'oklch(35% 0.105 256 / 0.7)';
const rule2 = 'oklch(35% 0.105 256 / 0.22)';
const onInk = 'oklch(97.5% 0.006 240)';

const both = (v: string): [string, string] => [v, v];

export const blueprintTheme = defineTheme({
  name: 'blueprint',
  extends: neutralTheme,
  typography: {
    scale: {base: 16, ratio: 1.25},
    body: {family: 'IBM Plex Sans', fallbacks: 'ui-sans-serif, sans-serif'},
    heading: {family: 'Chakra Petch', fallbacks: 'ui-sans-serif, sans-serif'},
    code: {family: 'IBM Plex Mono', fallbacks: 'ui-monospace, monospace'},
  },
  radius: {base: 0, multiplier: 0},
  tokens: {
    '--color-background-body': both(sheet),
    '--color-background-surface': both(sheet2),
    '--color-background-card': both(sheet2),
    '--color-background-popover': both(sheet3),
    '--color-background-muted': both(sheet3),
    '--color-text-primary': both(ink),
    '--color-text-secondary': both(muted),
    '--color-text-accent': both(ink),
    '--color-text-disabled': both(rule2),
    '--color-icon-primary': both(ink),
    '--color-icon-secondary': both(muted),
    '--color-icon-accent': both(ink),
    '--color-border': both(rule2),
    '--color-border-emphasized': both(rule),
    '--color-accent': both(ink),
    '--color-accent-muted': both(ink2),
    '--color-on-accent': both(onInk),
    '--color-overlay-hover': both('oklch(35% 0.105 256 / 0.06)'),
    '--color-overlay-pressed': both('oklch(35% 0.105 256 / 0.12)'),
    '--color-tint-hover': both('oklch(35% 0.105 256 / 0.06)'),
    '--color-syntax-background': both(sheet3),
  },
});

export default blueprintTheme;
