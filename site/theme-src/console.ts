import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

const sheet = 'oklch(17% 0.008 250)';
const sheet2 = 'oklch(21% 0.009 250)';
const sheet3 = 'oklch(13.5% 0.007 250)';
const ink = 'oklch(95% 0.005 250)';
const ink2 = 'oklch(83% 0.008 250)';
const muted = 'oklch(71% 0.01 250)';
const rule = 'oklch(42% 0.012 250)';
const rule2 = 'oklch(31% 0.01 250)';
const onInk = 'oklch(18% 0.04 75)';

const both = (v: string): [string, string] => [v, v];

export const consoleTheme = defineTheme({
  name: 'console',
  extends: neutralTheme,
  typography: {
    scale: {base: 16, ratio: 1.25},
    body: {family: 'Host Grotesk', fallbacks: 'ui-sans-serif, system-ui, sans-serif'},
    heading: {family: 'Host Grotesk', fallbacks: 'ui-sans-serif, system-ui, sans-serif'},
    code: {family: 'Atkinson Hyperlegible Mono', fallbacks: 'ui-monospace, monospace'},
  },
  radius: {base: 6, multiplier: 1},
  tokens: {
    '--color-background-body': both(sheet),
    '--color-background-surface': both(sheet2),
    '--color-background-card': both(sheet2),
    '--color-background-popover': both(sheet3),
    '--color-background-muted': both(sheet3),
    '--color-text-primary': both(ink),
    '--color-text-secondary': both(muted),
    '--color-text-accent': both('oklch(82% 0.15 80)'),
    '--color-text-disabled': both(rule2),
    '--color-icon-primary': both(ink),
    '--color-icon-secondary': both(muted),
    '--color-icon-accent': both(ink),
    '--color-border': both(rule2),
    '--color-border-emphasized': both(rule),
    '--color-accent': both('oklch(82% 0.15 80)'),
    '--color-accent-muted': both(ink2),
    '--color-on-accent': both(onInk),
    '--color-overlay-hover': both('oklch(95% 0.005 250 / 0.06)'),
    '--color-overlay-pressed': both('oklch(95% 0.005 250 / 0.12)'),
    '--color-tint-hover': both('oklch(95% 0.005 250 / 0.06)'),
    '--color-syntax-background': both(sheet3),
  },
});

export default consoleTheme;
