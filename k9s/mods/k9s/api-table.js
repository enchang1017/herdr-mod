const MIN_WIDTH = 6;
const PADDING = 3;
const LINE_BREAK = /[\f\n\r]/;
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/g;

export function cellText(cell) {
  if (cell === null || cell === undefined) return "";
  const text = typeof cell === "string" ? cell : typeof cell === "object" ? JSON.stringify(cell) : String(cell);
  const at = text.search(LINE_BREAK);
  const cut = at >= 0 ? `${text.slice(0, at)}...` : text;
  return cut.replace(/\t/g, " ").replace(CONTROL, "");
}

function width(text) {
  return [...text].length;
}

export function tabulate(lines) {
  const count = Math.max(0, ...lines.map((cells) => cells.length));
  const widths = Array.from({ length: Math.max(0, count - 1) }, (_unused, index) =>
    Math.max(MIN_WIDTH, ...lines.map((cells) => width(cells[index] ?? "") + PADDING)));
  return lines.map((cells) => cells.map((cell, index) =>
    (index < cells.length - 1 ? cell + " ".repeat(Math.max(0, widths[index] - width(cell))) : cell)).join(""));
}

function shownColumns(definitions) {
  return definitions.map((column, index) => ({ ...column, index })).filter((column) => column.priority === 0);
}

function lastTimestamp(row) {
  return row.object?.lastTimestamp ?? "";
}

function sortedRows(rows, sortKey) {
  if (sortKey !== "lastTimestamp") return rows;
  return [...rows].sort((a, b) => (lastTimestamp(a) < lastTimestamp(b) ? -1 : lastTimestamp(a) > lastTimestamp(b) ? 1 : 0));
}

export function tablesToText(tables, withNamespace, sortKey) {
  const columns = shownColumns(tables[0]?.columnDefinitions ?? []);
  const rows = sortedRows(tables.flatMap((table) => table.rows ?? []), sortKey);
  if (rows.length === 0) return "";
  const header = [...(withNamespace ? ["NAMESPACE"] : []), ...columns.map((column) => column.name.toUpperCase())];
  const body = rows.map((row) => [
    ...(withNamespace ? [cellText(row.object?.metadata?.namespace)] : []),
    ...columns.map((column) => cellText(row.cells?.[column.index])),
  ]);
  return `${tabulate([header, ...body]).join("\n")}\n`;
}

export function emptyNotice(namespace) {
  return namespace ? `No resources found in ${namespace} namespace.` : "No resources found";
}

function readyPair(text) {
  const [ready, desired] = String(text ?? "").split("/").map(Number);
  return { ready: Number.isFinite(ready) ? ready : 0, desired: Number.isFinite(desired) ? desired : 0 };
}

export function tableTargets(tables, kind, context, namespaceByDefault) {
  return tables.flatMap((table) => {
    const readyAt = (table.columnDefinitions ?? []).findIndex((column) => column.name === "Ready");
    return (table.rows ?? []).flatMap((row) => {
      const namespace = row.object?.metadata?.namespace ?? "";
      const name = row.object?.metadata?.name ?? cellText(row.cells?.[0]);
      if (!namespace || !name) return [];
      return [{ context, namespace, name, kind, ...readyPair(row.cells?.[readyAt]), isDefaultNamespace: namespace === namespaceByDefault }];
    });
  });
}
