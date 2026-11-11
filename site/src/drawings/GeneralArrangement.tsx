import {Bars, Box, Dim, Label, Mark, SheetSvg} from './parts';

const W = 1440;
const H = 900;
const SIDEBAR = 268;
const TABS = 42;
const STATUS = 28;
const DRAWER = 300;
const PICKER = 640;
const PICKER_TOP = 40;
const PICKER_H = 304;

const pickerX = (W - PICKER) / 2;
const drawerX = W - DRAWER;

const terminalLines = [420, 300, 360, 180, 460, 240, 390, 140, 330, 280, 410, 220, 300, 160, 370, 260, 340, 200];

function Sidebar() {
  const spaces = [0, 1, 2];
  return (
    <g>
      <Box x={0} y={0} w={SIDEBAR} h={H} />
      <path className="dw-faint" d={`M0 46H${SIDEBAR}M0 77H${SIDEBAR}M0 ${H - 69}H${SIDEBAR}`} />
      <Label x={16} y={67}>Spaces &amp; Agents</Label>
      {spaces.map((s) => {
        const y = 96 + s * 168;
        return (
          <g key={s}>
            <rect className="dw-line" x={16} y={y} width={18} height={18} />
            <Bars x={46} y={y + 6} widths={[110 - s * 18]} pitch={0} />
            <Bars x={46} y={y + 40} widths={[90, 120]} pitch={24} />
            <g className="dw-faint">
              <circle cx={58} cy={y + 99} r={4} />
              <circle cx={58} cy={y + 123} r={4} />
            </g>
            <Bars x={72} y={y + 96} widths={[130, 100]} pitch={24} />
          </g>
        );
      })}
      <Bars x={16} y={H - 50} widths={[200, 150]} pitch={22} height={8} />
    </g>
  );
}

function Workspace() {
  const paneW = 560;
  const pane2X = SIDEBAR + 8 + paneW + 8;
  const paneTop = TABS + 8;
  const paneH = H - STATUS - 8 - paneTop;
  return (
    <g>
      <path className="dw-line" d={`M${SIDEBAR} ${TABS}H${W}M${SIDEBAR} ${H - STATUS}H${W}`} />
      {[0, 1, 2].map((t) => (
        <rect key={t} className={t === 0 ? 'dw-line' : 'dw-faint'} x={SIDEBAR + 12 + t * 132} y={9} width={120} height={24} />
      ))}
      <Box x={SIDEBAR + 8} y={paneTop} w={paneW} h={paneH} tone="faint" />
      <Box x={pane2X} y={paneTop} w={W - pane2X - 8} h={paneH} tone="faint" />
      <path className="dw-faint" d={`M${SIDEBAR + 8} ${paneTop + 30}h${paneW}M${pane2X} ${paneTop + 30}H${W - 8}`} />
      <Bars x={SIDEBAR + 24} y={paneTop + 48} widths={terminalLines} pitch={22} height={5} />
      <Bars x={pane2X + 16} y={paneTop + 48} widths={terminalLines.slice(4).map((w) => w * 0.8)} pitch={22} height={5} />
      <Bars x={SIDEBAR + 16} y={H - 17} widths={[180]} pitch={0} height={5} />
    </g>
  );
}

function Drawer() {
  const top = TABS + 14;
  const rows = [0, 1, 2];
  return (
    <g>
      <rect className="dw-sheet" x={drawerX} y={top} width={DRAWER} height={196} />
      <path className="dw-faint" d={`M${W - 32} ${top}v196M${drawerX} ${top + 40}H${W - 32}`} />
      <circle className="dw-line" cx={W - 16} cy={top + 20} r={10} />
      <Label x={drawerX + 14} y={top + 25}>All</Label>
      {rows.map((r) => (
        <g key={r}>
          <rect className="dw-line" x={drawerX + 14} y={top + 56 + r * 46} width={20} height={20} />
          <Bars x={drawerX + 46} y={top + 58 + r * 46} widths={[150 - r * 30, 90]} pitch={12} height={5} />
          <circle className={r === 0 ? 'dw-solid' : 'dw-faint'} cx={W - 16} cy={top + 66 + r * 46} r={5} />
        </g>
      ))}
    </g>
  );
}

function Picker() {
  return (
    <g>
      <rect className="dw-sheet" x={pickerX} y={PICKER_TOP} width={PICKER} height={PICKER_H} />
      <Label x={pickerX + 20} y={PICKER_TOP + 30} size="md">Go to…</Label>
      <rect className="dw-line" x={pickerX + 20} y={PICKER_TOP + 46} width={PICKER - 40} height={36} />
      {[0, 1, 2, 3, 4, 5].map((r) => (
        <g key={r}>
          <rect className={r === 0 ? 'dw-faint' : 'dw-none'} x={pickerX + 20} y={PICKER_TOP + 94 + r * 32} width={PICKER - 40} height={32} />
          <Bars x={pickerX + 36} y={PICKER_TOP + 107 + r * 32} widths={[220 - r * 14]} pitch={0} height={5} />
          <Bars x={pickerX + PICKER - 90} y={PICKER_TOP + 107 + r * 32} widths={[50]} pitch={0} height={5} />
        </g>
      ))}
    </g>
  );
}

export function GeneralArrangement() {
  return (
    <SheetSvg viewBox="-70 -70 1580 1050" label="Diagram of the Herdr window with the spaces-agents sidebar, the agent-radar drawer and the picker-plus popup at their shipped sizes">
      <g>
        <rect className="dw-heavy" x={0} y={0} width={W} height={H} />
        <Workspace />
        <Sidebar />
        <Drawer />
        <Picker />
      </g>
      <Dim x1={0} y1={-34} x2={SIDEBAR} y2={-34} label="268" />
      <Dim x1={pickerX} y1={-34} x2={pickerX + PICKER} y2={-34} label="640" />
      <Dim x1={drawerX} y1={-34} x2={W} y2={-34} label="300" />
      <Dim x1={W + 34} y1={0} x2={W + 34} y2={TABS} label="42" side="right" />
      <Dim x1={W + 34} y1={H - STATUS} x2={W + 34} y2={H} label="28" side="right" />
      <Dim x1={pickerX + PICKER + 28} y1={0} x2={pickerX + PICKER + 28} y2={PICKER_TOP} label="40" side="right" />
      <Mark x={SIDEBAR / 2} y={H - 120} n={1} active={false} />
      <Mark x={drawerX + DRAWER / 2} y={TABS + 290} n={2} active={false} />
      <Mark x={W / 2} y={PICKER_TOP + PICKER_H + 40} n={5} active={false} />
      <Label x={0} y={H + 46}>Herdr window, px. Numbers refer to the register.</Label>
    </SheetSvg>
  );
}
