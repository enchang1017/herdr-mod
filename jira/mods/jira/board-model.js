import { isSubtask } from "./board-data.js";
import { fuzzyRows } from "./fuzzy.js";

export const OTHER_LANE = "other";
const FLAT_LANE = "all";
export const NO_EPIC = "none";
const NO_EPIC_REF = Object.freeze({ key: NO_EPIC, summary: "No epic" });
const FIXED = Object.freeze([
  ["To Do", "new"], ["In Progress", "indeterminate"], ["CodeReview", "indeterminate"], ["PENDING RELEASE", "indeterminate"], ["Done", "done"],
]);

const norm = (text) => String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();

export function columnsOf(items) {
  const seen = new Map(items.map((one) => [norm(one.status), one]));
  const fixed = FIXED.map(([status, category]) => {
    const live = seen.get(norm(status));
    return Object.freeze({ id: norm(status), status: live?.status ?? status, category: live?.category ?? category });
  });
  const known = new Set(fixed.map((one) => one.id));
  const extra = [...seen.entries()].filter(([id]) => id && !known.has(id))
    .map(([id, one]) => Object.freeze({ id, status: one.status, category: one.category }));
  return Object.freeze([...fixed.slice(0, -1), ...extra, fixed[fixed.length - 1]]);
}

export const isKanbanEntry = (entry) => entry?.mode === "kanban";

function epicOwners(entry) {
  const epics = new Map((entry.epics ?? []).map((one) => [one.key, Object.freeze({ key: one.key, summary: one.summary })]));
  return new Map(Object.entries(entry.children ?? {})
    .flatMap(([epic, keys]) => keys.map((key) => [key, epics.get(epic)]))
    .filter(([, epic]) => epic));
}

function flatLane(entry) {
  if (!entry.items.length) return [];
  const owners = epicOwners(entry);
  const cards = entry.items.map((card) => Object.freeze({ ...card, epic: owners.get(card.key) ?? NO_EPIC_REF }));
  return [Object.freeze({ id: FLAT_LANE, story: null, flat: true, hasChildren: true, cards: Object.freeze(cards) })];
}

export function lanesOf(entry) {
  if (!entry) return [];
  if (isKanbanEntry(entry)) return flatLane(entry);
  const byKey = new Map(entry.items.map((one) => [one.key, one]));
  const children = entry.children ?? {};
  const stories = entry.items.filter((one) => !isSubtask(one));
  const lanes = stories.map((story) => {
    const kids = (children[story.key] ?? []).map((key) => byKey.get(key)).filter(Boolean);
    return Object.freeze({ id: story.key, story, hasChildren: kids.length > 0, cards: Object.freeze(kids.length ? kids : [story]) });
  });
  const mapped = new Set(Object.values(children).flat());
  const orphans = entry.items.filter((one) => isSubtask(one) && !mapped.has(one.key));
  return orphans.length ? [...lanes, Object.freeze({ id: OTHER_LANE, story: null, hasChildren: true, cards: Object.freeze(orphans) })] : lanes;
}

const textHit = (row, text) => Boolean(row) && fuzzyRows([row], text).length > 0;
const epicRow = (epic) => epic && { key: epic.key, summary: epic.summary, status: "", assignee: "", type: "", priority: "" };

function cardMatches(card, lane, filters) {
  const labels = [...card.labels, ...(lane.story?.labels ?? [])];
  if (filters.labels.length && !labels.some((one) => filters.labels.includes(one))) return false;
  if (filters.epics?.length && !filters.epics.includes(card.epic?.key)) return false;
  if (filters.assignees.length && !filters.assignees.includes(card.assignee)) return false;
  if (filters.onlyMine && (!filters.me || card.assignee !== filters.me)) return false;
  return !filters.text || textHit(card, filters.text) || textHit(lane.story, filters.text) || textHit(epicRow(card.epic), filters.text);
}

export function isFiltering(filters) {
  return Boolean(filters.labels.length || filters.epics?.length || filters.assignees.length || filters.onlyMine || filters.text);
}

export function visibleLanes(lanes, filters) {
  if (!isFiltering(filters)) return lanes;
  return lanes.map((lane) => ({ ...lane, cards: lane.cards.filter((card) => cardMatches(card, lane, filters)) }))
    .filter((lane) => lane.cards.length > 0);
}

export function cellsOf(lane, columns) {
  return columns.map((column) => lane.cards.filter((card) => norm(card.status) === column.id));
}

export function columnIndexOf(columns, status) {
  return columns.findIndex((one) => one.id === norm(status));
}

const countBy = (values) => [...values.reduce((map, one) => map.set(one, (map.get(one) ?? 0) + 1), new Map()).entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

export function labelsOf(entry) {
  return countBy((entry?.items ?? []).flatMap((one) => one.labels)).map(([name, count]) => Object.freeze({ name, count }));
}

export function epicsOf(entry) {
  if (!isKanbanEntry(entry)) return [];
  const cards = lanesOf(entry).flatMap((lane) => lane.cards);
  const count = (key) => cards.filter((card) => card.epic.key === key).length;
  return [...(entry.epics ?? []), NO_EPIC_REF]
    .map((epic) => Object.freeze({ key: epic.key, name: epic.summary || epic.key, count: count(epic.key) }))
    .filter((one) => one.count > 0);
}

export function assigneesOf(entry) {
  return countBy((entry?.items ?? []).map((one) => one.assignee).filter(Boolean)).map(([name, count]) => Object.freeze({ name, count }));
}

export function progressOf(entry) {
  const subs = (entry?.items ?? []).filter(isSubtask);
  const counted = subs.length ? subs : entry?.items ?? [];
  return { done: counted.filter((one) => one.category === "done").length, total: counted.length, unit: subs.length ? "sub-tasks" : "cards" };
}

export function daysLeft(sprint, now = Date.now()) {
  if (!sprint?.end) return null;
  return Math.ceil((sprint.end - now) / 86400000);
}
