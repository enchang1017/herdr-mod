import {Bars, Box, Callouts, Dim, Label, SheetSvg, type Callout} from './parts';

interface DrawingProps {
  active: number | null;
}

const RADAR_CALLOUTS: readonly Callout[] = [
  {n: 1, x: 420, y: 40, tx: 284, ty: 32},
  {n: 2, x: -60, y: 150, tx: 40, ty: 132},
  {n: 3, x: -60, y: 30, tx: 24, ty: 26},
];

export function AgentRadarDrawing({active}: DrawingProps) {
  const rows = [0, 1, 2, 3];
  return (
    <SheetSvg viewBox="-110 -70 600 420" label="Diagram of the agent-radar drawer, 300 px wide, with a 32 px status column">
      <path className="dw-heavy" d="M300 -40V330" />
      <rect className="dw-sheet" x={0} y={0} width={300} height={250} />
      <path className="dw-faint" d="M268 0V250M0 50H268" />
      <Label x={16} y={30}>All</Label>
      <Label x={238} y={30} anchor="middle">✕</Label>
      <circle className="dw-line" cx={284} cy={32} r={11} />
      {rows.map((r) => (
        <g key={r}>
          <rect className="dw-line" x={16} y={66 + r * 44} width={20} height={20} />
          <Bars x={48} y={68 + r * 44} widths={[140 - r * 20, 96]} pitch={12} height={5} />
          <Bars x={212} y={68 + r * 44} widths={[30]} pitch={0} height={5} />
          <circle className={r < 2 ? 'dw-solid' : 'dw-faint'} cx={284} cy={76 + r * 44} r={5} />
        </g>
      ))}
      <Dim x1={0} y1={-34} x2={300} y2={-34} label="300" />
      <Dim x1={268} y1={286} x2={300} y2={286} label="32" side="below" />
      <Dim x1={264} y1={322} x2={300} y2={322} label="36 peek" side="below" />
      <Callouts items={RADAR_CALLOUTS} active={active} />
    </SheetSvg>
  );
}

const CHANGE_CALLOUTS: readonly Callout[] = [
  {n: 1, x: 930, y: 18, tx: 600, ty: 18},
  {n: 2, x: -60, y: 170, tx: 34, ty: 170},
  {n: 3, x: 930, y: 230, tx: 712, ty: 170},
];

export function ChangeRadarDrawing({active}: DrawingProps) {
  const rows = [0, 1, 2, 3, 4, 5];
  return (
    <SheetSvg viewBox="-110 -80 1100 900" label="Diagram of the change-radar window, 60 by 85 percent of the Herdr window">
      <rect className="dw-heavy" x={0} y={0} width={864} height={765} />
      <path className="dw-line" d="M0 36H864" />
      <Label x={16} y={24} size="md">Git</Label>
      <rect className="dw-solid-soft" x={70} y={6} width={130} height={24} />
      <Label x={135} y={23} anchor="middle">Change radar</Label>
      <Label x={250} y={23} anchor="middle">Graph</Label>
      <Label x={330} y={23} anchor="middle">Session</Label>
      <Label x={848} y={23} anchor="end">Dock ⌘↵</Label>
      <Label x={20} y={80} size="md">Change radar</Label>
      <rect className="dw-line" x={150} y={64} width={92} height={22} />
      <rect className="dw-faint" x={252} y={64} width={92} height={22} />
      <Box x={16} y={110} w={832} h={630} tone="faint" />
      {rows.map((r) => {
        const y = 150 + r * 92;
        return (
          <g key={r}>
            <circle className={r === 1 ? 'dw-solid' : 'dw-line'} cx={34} cy={y + 20} r={8} />
            <Bars x={56} y={y + 14} widths={[220 - r * 16]} pitch={0} height={8} />
            <Bars x={300} y={y + 15} widths={[110]} pitch={0} height={5} />
            <rect className="dw-line" x={672} y={y + 8} width={58} height={22} />
            <rect className={r === 2 ? 'dw-solid' : 'dw-line'} x={738} y={y + 8} width={34} height={22} />
            <Bars x={790} y={y + 15} widths={[40]} pitch={0} height={5} />
            <Bars x={56} y={y + 44} widths={[300]} pitch={0} height={5} />
            {r < 5 && <path className="dw-faint" d={`M16 ${y + 72}H848`} />}
          </g>
        );
      })}
      <Dim x1={0} y1={-40} x2={864} y2={-40} label="60%" />
      <Dim x1={-40} y1={0} x2={-40} y2={765} label="85%" side="left" />
      <Dim x1={884} y1={0} x2={884} y2={36} label="36" side="right" />
      <Callouts items={CHANGE_CALLOUTS} active={active} />
    </SheetSvg>
  );
}

const JIRA_CALLOUTS: readonly Callout[] = [
  {n: 1, x: 1140, y: 108, tx: 860, ty: 108},
  {n: 2, x: -60, y: 210, tx: 20, ty: 210},
  {n: 3, x: 1140, y: 360, tx: 1004, ty: 330},
];

const JIRA_COLUMNS = ['To do', 'In progress', 'Code review', 'Done'] as const;

export function JiraDrawing({active}: DrawingProps) {
  const colW = 260;
  const lanes = [0, 1];
  return (
    <SheetSvg viewBox="-110 -80 1320 900" label="Diagram of the jira sprint board, one lane per story and 86 px sub-task cards">
      <rect className="dw-heavy" x={0} y={0} width={1080} height={720} />
      <path className="dw-line" d="M0 44H1080M0 86H1080M0 122H1080M0 152H1080" />
      <rect className="dw-line" x={14} y={8} width={28} height={28} />
      <Label x={54} y={28} size="md">Jira</Label>
      {['Mine', 'Board', 'In progress', 'To do', 'Recent', 'Sprint', 'JQL'].map((t, i) => (
        <g key={t}>
          {i === 1 && <rect className="dw-solid-soft" x={14 + i * 110} y={52} width={100} height={26} />}
          <Label x={64 + i * 110} y={70} anchor="middle">{t}</Label>
        </g>
      ))}
      <Bars x={20} y={101} widths={[200]} pitch={0} height={6} />
      <rect className="dw-line" x={860} y={100} width={160} height={8} />
      <rect className="dw-solid" x={860} y={100} width={96} height={8} />
      {JIRA_COLUMNS.map((c, i) => (
        <Label key={c} x={20 + i * colW + 10} y={142}>{c}</Label>
      ))}
      {lanes.map((l) => {
        const y = 170 + l * 270;
        return (
          <g key={l}>
            <rect className="dw-faint" x={10} y={y} width={1060} height={34} />
            <Bars x={30} y={y + 14} widths={[320 - l * 60]} pitch={0} height={6} />
            {JIRA_COLUMNS.map((c, i) => {
              const cards = (l + i) % 3 === 0 ? 2 : 1;
              return Array.from({length: cards}, (_, k) => (
                <g key={`${c}-${k}`}>
                  <rect className={i === 3 ? 'dw-faint' : 'dw-line'} x={20 + i * colW} y={y + 46 + k * 98} width={colW - 20} height={86} />
                  <Bars x={34 + i * colW} y={y + 60 + k * 98} widths={[180, 130]} pitch={14} height={5} />
                  <rect className="dw-faint" x={colW - 20 + i * colW} y={y + 102 + k * 98} width={18} height={18} />
                </g>
              ));
            })}
          </g>
        );
      })}
      <Dim x1={0} y1={-40} x2={1080} y2={-40} label="75%" />
      <Dim x1={-40} y1={0} x2={-40} y2={720} label="80%" side="left" />
      <Dim x1={1100} y1={216} x2={1100} y2={302} label="86" side="right" />
      <Callouts items={JIRA_CALLOUTS} active={active} />
    </SheetSvg>
  );
}

const K9S_CALLOUTS: readonly Callout[] = [
  {n: 1, x: -60, y: 90, tx: 20, ty: 90},
  {n: 2, x: -60, y: 190, tx: 50, ty: 190},
  {n: 3, x: 1140, y: 300, tx: 600, ty: 300},
];

export function K9sDrawing({active}: DrawingProps) {
  const rows = Array.from({length: 18}, (_, i) => i);
  const drawerX = 1080 - 486;
  return (
    <SheetSvg viewBox="-110 -80 1320 900" label="Diagram of the k9s window: search field, deployment rows and a detail drawer 45 percent wide">
      <rect className="dw-heavy" x={0} y={0} width={1080} height={720} />
      <Label x={20} y={40} size="md">Find</Label>
      <rect className="dw-line" x={20} y={74} width={540} height={32} />
      <path className="dw-heavy" d="M20 74V106" />
      {rows.map((r) => {
        const y = 130 + r * 30;
        return (
          <g key={r}>
            <circle className={r === 4 ? 'dw-faint' : 'dw-solid'} cx={30} cy={y + 12} r={5} />
            <rect className={r % 5 === 1 ? 'dw-solid' : 'dw-line'} x={44} y={y + 3} width={60} height={18} />
            <Bars x={118} y={y + 9} widths={[200 - (r % 4) * 30]} pitch={0} height={5} />
            <Bars x={500} y={y + 9} widths={[34]} pitch={0} height={5} />
          </g>
        );
      })}
      <rect className="dw-sheet" x={drawerX} y={0} width={486} height={720} />
      <Label x={drawerX + 20} y={40} size="md">Detail</Label>
      {['Health', 'CPU', 'Memory'].map((t, i) => (
        <g key={t}>
          <Label x={drawerX + 20} y={96 + i * 36}>{t}</Label>
          <rect className="dw-line" x={drawerX + 110} y={88 + i * 36} width={110} height={8} />
          <rect className="dw-solid" x={drawerX + 110} y={88 + i * 36} width={40 + i * 22} height={8} />
        </g>
      ))}
      <Box x={drawerX + 20} y={210} w={446} h={490} tone="faint" />
      <Bars x={drawerX + 36} y={230} widths={[300, 220, 380, 180, 340, 260, 300, 200, 360, 240, 320, 160, 280, 220, 340]} pitch={30} height={5} />
      <Dim x1={drawerX} y1={-40} x2={1080} y2={-40} label="45%, 420 min" />
      <Dim x1={-40} y1={0} x2={-40} y2={720} label="80%" side="left" />
      <Dim x1={590} y1={74} x2={590} y2={106} label="32" side="left" />
      <Callouts items={K9S_CALLOUTS} active={active} />
    </SheetSvg>
  );
}
