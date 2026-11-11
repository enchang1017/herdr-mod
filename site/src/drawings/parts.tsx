import type {ReactNode} from 'react';

interface DimProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  side?: 'above' | 'below' | 'left' | 'right';
}

const TICK = 7;

export function Dim({x1, y1, x2, y2, label, side = 'above'}: DimProps) {
  const vertical = x1 === x2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const tick = (x: number, y: number) => `M${x - TICK} ${y + TICK}L${x + TICK} ${y - TICK}`;
  const offset = 14;
  const tx = vertical ? (side === 'left' ? mx - offset : mx + offset) : mx;
  const ty = vertical ? my : side === 'below' ? my + offset + 8 : my - offset + 4;
  const anchor = vertical ? (side === 'left' ? 'end' : 'start') : 'middle';
  return (
    <g className="dw-dim">
      <path d={`M${x1} ${y1}L${x2} ${y2}`} />
      <path d={tick(x1, y1)} />
      <path d={tick(x2, y2)} />
      <text x={tx} y={ty} textAnchor={anchor} dominantBaseline={vertical ? 'middle' : 'auto'}>
        {label}
      </text>
    </g>
  );
}

interface BoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
  tone?: 'line' | 'faint' | 'dash' | 'solid';
}

export function Box({x, y, w, h, tone = 'line'}: BoxProps) {
  return <rect className={`dw-${tone}`} x={x} y={y} width={w} height={h} />;
}

interface BarsProps {
  x: number;
  y: number;
  widths: readonly number[];
  pitch: number;
  height?: number;
}

export function Bars({x, y, widths, pitch, height = 6}: BarsProps) {
  return (
    <g className="dw-text">
      {widths.map((w, i) => (
        <rect key={i} x={x} y={y + i * pitch} width={w} height={height} />
      ))}
    </g>
  );
}

interface LabelProps {
  x: number;
  y: number;
  children: ReactNode;
  anchor?: 'start' | 'middle' | 'end';
  size?: 'sm' | 'md';
}

export function Label({x, y, children, anchor = 'start', size = 'sm'}: LabelProps) {
  return (
    <text className={`dw-label dw-label-${size}`} x={x} y={y} textAnchor={anchor}>
      {children}
    </text>
  );
}

interface MarkProps {
  x: number;
  y: number;
  n: number;
  active: boolean;
}

export function Mark({x, y, n, active}: MarkProps) {
  return (
    <g className="dw-mark" data-active={active || undefined}>
      <circle cx={x} cy={y} r={15} />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central">
        {n}
      </text>
    </g>
  );
}

interface LeaderProps {
  d: string;
  active: boolean;
}

export function Leader({d, active}: LeaderProps) {
  return <path className="dw-leader" pathLength={1} d={d} data-active={active || undefined} />;
}

export interface Callout {
  n: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
}

interface CalloutsProps {
  items: readonly Callout[];
  active: number | null;
}

export function Callouts({items, active}: CalloutsProps) {
  return (
    <g>
      {items.map((c) => (
        <g key={c.n}>
          <Leader d={`M${c.x} ${c.y}L${c.tx} ${c.ty}`} active={active === c.n} />
          <circle className="dw-target" cx={c.tx} cy={c.ty} r={4} data-active={active === c.n || undefined} />
        </g>
      ))}
      {items.map((c) => (
        <Mark key={c.n} x={c.x} y={c.y} n={c.n} active={active === c.n} />
      ))}
    </g>
  );
}

interface SheetSvgProps {
  label: string;
  viewBox: string;
  children: ReactNode;
}

export function SheetSvg({label, viewBox, children}: SheetSvgProps) {
  return (
    <svg className="diagram" viewBox={viewBox} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {children}
    </svg>
  );
}
