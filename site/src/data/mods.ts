export const REPO_URL = 'https://github.com/enchang1017/herdr-mod';
export const REPO_PATH = 'github.com/enchang1017/herdr-mod';

export interface Mod extends Record<string, unknown> {
  no: string;
  name: string;
  does: string;
  opens: string;
}

export const MODS: readonly Mod[] = [
  {
    no: '01',
    name: 'spaces-agents',
    does: 'One sidebar for spaces, tabs and agents.',
    opens: '⌘⌥T reopens a tab',
  },
  {
    no: '02',
    name: 'agent-radar',
    does: 'Slides out when an agent needs you.',
    opens: '⌘⇧A, ⌘⇧U',
  },
  {
    no: '03',
    name: 'change-radar',
    does: 'Unpushed work, merge requests and pipelines.',
    opens: 'mod.open',
  },
  {
    no: '04',
    name: 'session-history',
    does: 'Search and resume past agent sessions.',
    opens: '⌘Y',
  },
  {
    no: '05',
    name: 'picker-plus',
    does: 'Go to picker that opens these windows.',
    opens: '⌘P',
  },
  {
    no: '06',
    name: 'team',
    does: 'Start and review agent teams.',
    opens: 'mod.open',
  },
  {
    no: '07',
    name: 'jira',
    does: 'Your work items and the sprint board.',
    opens: '⌘⇧J',
  },
  {
    no: '08',
    name: 'k9s',
    does: 'Find a deployment, follow its logs.',
    opens: '⌘⇧K',
  },
  {
    no: '09',
    name: 'orbit',
    does: 'Resources, logs and traces of orbit.',
    opens: '⌘⇧O',
  },
  {
    no: '10',
    name: 'open-ide',
    does: 'This folder in Rider or VS Code.',
    opens: '⌘⇧E',
  },
];

export const installPrompt = (name: string): string =>
  `Read ~/.config/herdr-app/AGENTS.md, then add ${name} from ${REPO_PATH}`;
