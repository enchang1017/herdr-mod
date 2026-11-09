export const MAX_ROWS = 400;
const COLUMN_GAP = /\S+(?: \S+)*/g;

const BAD_STATUS = /error|crashloop|backoff|failed|oomkilled|notready|evicted|unknown|invalid|lost/i;
const PENDING_STATUS = /pending|creating|terminating|init|waiting|schedulingdisabled|containercreating|podinitializing/i;
const GOOD_STATUS = /^(running|ready|active|bound|succeeded)$/i;
const DONE_STATUS = /^completed$/i;

const ERROR_LINE = /\b(error|err|fatal|panic|exception|failed|failure|unhealthy|backoff|oomkilled)\b/i;
const WARNING_LINE = /\b(warn|warning)\b/i;

const ELLIPSIS = "…";
const COMPACT_GAP = 2;
const MIN_NAME_WIDTH = 8;
const COMPACT_NAME_WIDTH = 16;

const COMPACT_COLUMNS = [
  ["STATUS", "RESTARTS"], ["STATUS"], ["READY"], ["TYPE", "REASON"], ["TYPE", "CLUSTER-IP"], ["HOSTS"], ["CLUSTER-IP"],
];
const EXTRA_COLUMNS = ["AGE", "LAST SEEN"];
const COLUMN_LABELS = { RESTARTS: "RST", "LAST SEEN": "SEEN" };
const COLUMN_LIMITS = { STATUS: 16, RESTARTS: 3, REASON: 18, HOSTS: 28 };

export function columnStarts(header) {
  return [...header.matchAll(COLUMN_GAP)].map((match) => match.index ?? 0);
}

function statusTone(value) {
  if (BAD_STATUS.test(value)) return "error";
  if (PENDING_STATUS.test(value)) return "warning";
  if (GOOD_STATUS.test(value)) return "success";
  if (DONE_STATUS.test(value)) return "subtle";
  return "plain";
}

function readyTone(value) {
  const [have, want] = value.split("/").map(Number);
  if (have === undefined || want === undefined || Number.isNaN(have) || Number.isNaN(want)) return "plain";
  if (want === 0 || have === want) return "success";
  return have === 0 ? "error" : "warning";
}

function restartsTone(value) {
  const count = Number.parseInt(value, 10);
  if (Number.isNaN(count) || count === 0) return "dim";
  return count >= 10 ? "error" : "warning";
}

export function cellTone(column, value) {
  const trimmed = value.trim();
  switch (column) {
    case "STATUS": return statusTone(trimmed);
    case "READY": return readyTone(trimmed);
    case "RESTARTS": return restartsTone(trimmed);
    case "TYPE": return trimmed === "Warning" ? "warning" : "subtle";
    case "NAMESPACE":
    case "AGE":
    case "LAST SEEN": return "dim";
    default: return "plain";
  }
}

export function splitCells(header, line) {
  const starts = columnStarts(header);
  return starts.map((start, index) => {
    const end = starts[index + 1];
    const column = header.slice(start, end).trim();
    const text = line.slice(start, end);
    return { column, text, tone: cellTone(column, text) };
  });
}

export function displayWidth(text) {
  return [...text].length;
}

function truncateWidth(text, max) {
  return [...text].slice(0, Math.max(0, max)).join("");
}

function padWidth(text, width) {
  return text + " ".repeat(Math.max(0, width - displayWidth(text)));
}

function ellipsize(text, max) {
  return displayWidth(text) <= max ? text : `${truncateWidth(text, max - 1)}${ELLIPSIS}`;
}

export function middleEllipsize(text, max) {
  const chars = [...text];
  if (chars.length <= max) return text;
  const keep = Math.max(0, max - 1);
  const head = Math.floor(keep / 2);
  return `${chars.slice(0, head).join("")}${ELLIPSIS}${chars.slice(chars.length - (keep - head)).join("")}`;
}

function headerColumns(header) {
  return columnStarts(header).map((start, index, starts) => header.slice(start, starts[index + 1]).trim());
}

function compactColumns(header) {
  const available = headerColumns(header);
  const preferred = COMPACT_COLUMNS.find((group) => group.every((column) => available.includes(column)));
  const base = preferred ? [...preferred] : available.slice(1, 2);
  return [...base, ...EXTRA_COLUMNS.filter((column) => available.includes(column) && !base.includes(column))];
}

function compactValue(column, text) {
  const value = text.trim();
  return column === "RESTARTS" ? value.split(" ")[0] ?? value : value;
}

export function compactTable(header, rows) {
  const columns = compactColumns(header);
  const compact = rows.map((row) => {
    const cells = splitCells(header, row.line);
    const named = cells.find((cell) => cell.column === "OBJECT");
    const hasNameColumn = cells.some((cell) => cell.column === "NAME");
    const base = !hasNameColumn && named ? named.text.trim() : row.name;
    const values = columns.map((column) => {
      const text = compactValue(column, cells.find((cell) => cell.column === column)?.text ?? "");
      return { column, text, tone: cellTone(column, text) };
    });
    return { id: row.id, name: row.namespace ? `${row.namespace}/${base}` : base, values, health: cellsHealth(cells) };
  });
  return { columns, rows: compact };
}

function columnWidth(table, column, index) {
  const label = COLUMN_LABELS[column] ?? column;
  const widest = Math.max(displayWidth(label), ...table.rows.map((row) => displayWidth(row.values[index]?.text ?? "")));
  return Math.min(COLUMN_LIMITS[column] ?? Infinity, widest);
}

function fittingCount(widths, width, wanted) {
  const fixedFor = (count) => widths.slice(0, count).reduce((sum, value) => sum + value + COMPACT_GAP, 0);
  let count = widths.length;
  while (count > 0 && width - fixedFor(count) - COMPACT_GAP < wanted) count -= 1;
  return { count, fixed: fixedFor(count) };
}

export function layoutCompact(table, width) {
  const widths = table.columns.map((column, index) => columnWidth(table, column, index));
  const longest = Math.max(displayWidth("NAME"), ...table.rows.map((row) => displayWidth(row.name)));
  const { count, fixed } = fittingCount(widths, width, Math.min(longest, COMPACT_NAME_WIDTH));
  const nameWidth = Math.max(MIN_NAME_WIDTH, Math.min(longest, width - fixed - COMPACT_GAP));
  const gap = " ".repeat(COMPACT_GAP);
  const columns = table.columns.slice(0, count);
  const header = [padWidth("NAME", nameWidth), ...columns.map((column, index) => padWidth(COLUMN_LABELS[column] ?? column, widths[index]))].join(gap);
  const rows = table.rows.map((row) => ({
    id: row.id,
    health: row.health,
    cells: [
      { column: "NAME", text: `${padWidth(middleEllipsize(row.name, nameWidth), nameWidth)}${gap}`, tone: "plain" },
      ...row.values.slice(0, count).map((value, index) => ({ ...value, text: `${padWidth(ellipsize(value.text, widths[index]), widths[index])}${gap}` })),
    ],
  }));
  return { header, rows };
}

export function lineTone(line) {
  if (ERROR_LINE.test(line)) return "error";
  if (WARNING_LINE.test(line)) return "warning";
  return "plain";
}

const HEALTH_RANK = { none: 0, success: 1, warning: 2, error: 3 };

function toneHealth(tone) {
  return tone === "error" || tone === "warning" || tone === "success" ? tone : "none";
}

function worse(left, right) {
  return HEALTH_RANK[right] > HEALTH_RANK[left] ? right : left;
}

function statusHealth(status, ready) {
  if (status !== "success") return status;
  return ready === "error" || ready === "warning" ? "warning" : "success";
}

export function cellsHealth(cells) {
  const tones = new Map(cells.map((cell) => [cell.column, cell.tone]));
  const ready = toneHealth(tones.get("READY"));
  const base = tones.has("STATUS")
    ? statusHealth(toneHealth(tones.get("STATUS")), ready)
    : worse(ready, toneHealth(tones.get("TYPE")));
  return tones.get("RESTARTS") === "error" ? "error" : base;
}

export function countHealth(healths) {
  return healths.reduce((counts, health) => ({ ...counts, [health]: counts[health] + 1 }), { error: 0, warning: 0, success: 0, none: 0 });
}

export function capLines(text, max, keep) {
  const lines = text.replace(/\n+$/, "").split("\n");
  if (lines.length <= max) return { lines, hidden: 0 };
  return { lines: keep === "tail" ? lines.slice(-max) : lines.slice(0, max), hidden: lines.length - max };
}

const HEALTHY_STATUS = /^(running|completed|ready|succeeded|active|bound)$/i;

function readyShort(text) {
  const [have, want] = text.trim().split("/").map(Number);
  return Number.isFinite(have) && Number.isFinite(want) && have < want;
}

export function isFailingRow(header, row) {
  const cells = new Map(splitCells(header, row.line).map((cell) => [cell.column, cell.text.trim()]));
  if (cells.get("TYPE") === "Warning") return true;
  if (cells.has("STATUS") && !HEALTHY_STATUS.test(cells.get("STATUS") ?? "")) return true;
  if ((Number.parseInt(cells.get("RESTARTS") ?? "0", 10) || 0) > 0) return true;
  return cells.has("READY") && cells.get("STATUS") !== "Completed" && readyShort(cells.get("READY") ?? "");
}

export function visibleRows(listing, filter, failingOnly) {
  const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return listing.rows.filter((row) => {
    const name = `${row.namespace ?? ""}/${row.name}`.toLowerCase();
    if (!words.every((word) => name.includes(word))) return false;
    return !failingOnly || isFailingRow(listing.header, row);
  });
}

export function fullWidth(header, rows) {
  return Math.max(displayWidth(header), ...rows.map((row) => displayWidth(row.line)));
}

export function layoutFull(header, rows) {
  const width = fullWidth(header, rows);
  return {
    header: padWidth(header, width),
    rows: rows.map((row) => {
      const cells = splitCells(header, padWidth(row.line, width));
      return { id: row.id, health: cellsHealth(cells), cells };
    }),
  };
}
