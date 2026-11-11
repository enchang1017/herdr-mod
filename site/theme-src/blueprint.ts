import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

const sheet = 'oklch(35% 0.105 256)';
const sheet2 = 'oklch(31% 0.10 257)';
const sheet3 = 'oklch(26.5% 0.095 258)';
const ink = 'oklch(97% 0.012 240)';
const ink2 = 'oklch(90% 0.025 242)';
const muted = 'oklch(80% 0.045 244)';
const rule = 'oklch(93% 0.02 240 / 0.85)';
const rule2 = 'oklch(93% 0.02 240 / 0.32)';
const onInk = 'oklch(33% 0.105 256)';

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
    '--color-overlay-hover': both('oklch(97% 0.012 240 / 0.08)'),
    '--color-overlay-pressed': both('oklch(97% 0.012 240 / 0.14)'),
    '--color-tint-hover': both('oklch(97% 0.012 240 / 0.08)'),
    '--color-syntax-background': both(sheet3),
  },
});

export default blueprintTheme;
