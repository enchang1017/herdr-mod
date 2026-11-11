import {Bars, Dim, Label, SheetSvg} from './parts';

const ROWS = [
  {kind: 'machine', depth: 0},
  {kind: 'space', depth: 0},
  {kind: 'tab', depth: 1},
  {kind: 'agent', depth: 2},
  {kind: 'agent', depth: 2},
  {kind: 'tab', depth: 1},
  {kind: 'agent', depth: 2},
  {kind: 'space', depth: 0},
  {kind: 'tab', depth: 1},
  {kind: 'agent', depth: 2},
  {kind: 'lost', depth: 0},
  {kind: 'agent', depth: 1},
] as const;

const HEIGHT = {machine: 30, space: 30, tab: 24, agent: 28, lost: 30} as const;

export function SidebarDrawing() {
  let y = 31;
  const placed = ROWS.map((r) => {
    const top = y;
    y += HEIGHT[r.kind];
    return {...r, top};
  });
  return (
    <SheetSvg viewBox="-80 -70 440 640" label="Diagram of the spaces-agents sidebar, 268 px wide, with space, tab and agent rows and the quota block">
      <rect className="dw-heavy" x={0} y={0} width={268} height={520} />
      <path className="dw-line" d="M0 31H268M0 446H268" />
      <Label x={12} y={21}>Spaces &amp; Agents</Label>
      {placed.map((r, i) => {
        const x = 12 + r.depth * 18;
        const mid = r.top + HEIGHT[r.kind] / 2;
        return (
          <g key={i}>
            {r.kind === 'space' && <rect className="dw-line" x={x} y={mid - 9} width={18} height={18} />}
            {r.kind === 'agent' && <circle className={i === 4 ? 'dw-solid' : 'dw-faint'} cx={x + 6} cy={mid} r={4} />}
            {r.kind === 'machine' && <rect className="dw-faint" x={x} y={mid - 7} width={14} height={14} />}
            <Bars x={x + (r.kind === 'tab' ? 4 : 28)} y={mid - 3} widths={[r.kind === 'lost' ? 90 : 150 - r.depth * 26]} pitch={0} height={5} />
            {r.kind === 'agent' && <Bars x={232} y={mid - 3} widths={[22]} pitch={0} height={5} />}
          </g>
        );
      })}
      <Bars x={12} y={466} widths={[220, 160]} pitch={20} height={8} />
      <Dim x1={0} y1={-34} x2={268} y2={-34} label="268" />
      <Dim x1={292} y1={61} x2={292} y2={91} label="30" side="right" />
      <Dim x1={292} y1={91} x2={292} y2={115} label="24" side="right" />
      <Dim x1={292} y1={446} x2={292} y2={520} label="quota" side="right" />
    </SheetSvg>
  );
}
