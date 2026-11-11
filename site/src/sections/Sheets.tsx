import {useState, type ComponentType} from 'react';
import {Heading} from '@astryxdesign/core/Heading';
import {Tab, TabList} from '@astryxdesign/core/TabList';
import {Text} from '@astryxdesign/core/Text';
import {AgentRadarDrawing, ChangeRadarDrawing, JiraDrawing, K9sDrawing} from '../drawings/details';

interface Note {
  n: number;
  title: string;
  text: string;
}

interface Sheet {
  id: string;
  label: string;
  Drawing: ComponentType<{active: number | null}>;
  notes: readonly Note[];
}

const SHEETS: readonly Sheet[] = [
  {
    id: 'agent-radar',
    label: 'agent-radar',
    Drawing: AgentRadarDrawing,
    notes: [
      {n: 1, title: 'Count circle', text: 'Agents waiting on you: blocked first, then done.'},
      {n: 2, title: 'One row per agent', text: 'Program, name, age, space and tab. Click to jump there.'},
      {n: 3, title: 'All and close', text: 'All opens the full panel. Close hides it until the set changes.'},
    ],
  },
  {
    id: 'change-radar',
    label: 'change-radar',
    Drawing: ChangeRadarDrawing,
    notes: [
      {n: 1, title: 'Three tabs', text: 'Change radar, Graph, and Session for one Claude session.'},
      {n: 2, title: 'Review state', text: 'To review, reviewed, or changed since you reviewed it.'},
      {n: 3, title: 'MR and CI chips', text: 'From glab, polled every 20 s while a pipeline runs.'},
    ],
  },
  {
    id: 'jira',
    label: 'jira',
    Drawing: JiraDrawing,
    notes: [
      {n: 1, title: 'Sprint strip', text: 'Days left, the goal, and sub-tasks done as a bar.'},
      {n: 2, title: 'One lane per story', text: 'Sub-tasks sit in the lane as 86 px cards.'},
      {n: 3, title: 'Cards open a drawer', text: 'Description, links, comments, and a status change.'},
    ],
  },
  {
    id: 'k9s',
    label: 'k9s',
    Drawing: K9sDrawing,
    notes: [
      {n: 1, title: 'Find', text: 'Type part of a deployment name, Enter follows its logs.'},
      {n: 2, title: 'Context chip', text: 'Turns solid red when the context name holds prod.'},
      {n: 3, title: 'Detail drawer', text: 'Health, CPU and memory, events, YAML, logs.'},
    ],
  },
];

function SheetPanel({sheet, index}: {sheet: Sheet; index: number}) {
  const [active, setActive] = useState<number | null>(null);
  const {Drawing} = sheet;
  return (
    <section className="sheet" id={`sheet-${sheet.id}`} role="tabpanel" aria-label={`${sheet.label} detail sheet`}>
      <figure className="fig sheet-fig">
        <Drawing active={active} />
        <figcaption>
          <Text type="code" color="secondary">Sheet {String(index + 2).padStart(2, '0')}, {sheet.label}</Text>
        </figcaption>
      </figure>
      <ol className="notes" onMouseLeave={() => setActive(null)}>
        {sheet.notes.map((note) => (
          <li key={note.n}>
            <button
              type="button"
              className="note"
              aria-pressed={active === note.n}
              onMouseEnter={() => setActive(note.n)}
              onFocus={() => setActive(note.n)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(active === note.n ? null : note.n)}>
              <Text type="code" className="note-n">{note.n}</Text>
              <Heading level={3}>{note.title}</Heading>
              <Text as="p" color="secondary">{note.text}</Text>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Sheets() {
  const [current, setCurrent] = useState(SHEETS[0].id);
  const index = SHEETS.findIndex((s) => s.id === current);
  return (
    <section className="section sheets" id="sheets" aria-labelledby="sheets-title">
      <header className="container head-split">
        <Heading level={2} id="sheets-title">
          Drawn at their shipped sizes
        </Heading>
        <TabList value={current} onChange={setCurrent} role="tablist" size="lg" hasDivider>
          {SHEETS.map((s) => (
            <Tab key={s.id} value={s.id} label={s.label} panelId={`sheet-${s.id}`} />
          ))}
        </TabList>
      </header>
      <section className="container">
        <SheetPanel key={current} sheet={SHEETS[index]} index={index} />
      </section>
    </section>
  );
}
