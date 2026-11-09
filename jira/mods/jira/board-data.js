import { acli, parseJson } from "./acli.js";
import { toRow, issuesOf, peekBoard, rememberBoard } from "./data.js";
import { project, boardId, NEED_PROJECT } from "./settings.js";
import { sprintJql } from "./queries.js";

const FIELDS = "issuetype,key,summary,status,assignee,priority,labels";
const LIMIT = "200";
const PARALLEL = 20;
const BOARD_TTL_MS = 120000;
const MAP_TTL_MS = 1800000;
const SUBTASK = /sub-?task/i;

export const isSubtask = (card) => SUBTASK.test(card?.type ?? "");

function toCard(issue) {
  return Object.freeze({ ...toRow(issue), labels: Object.freeze([...(issue?.fields?.labels ?? [])].map(String)) });
}

async function search(jql, what) {
  const out = await acli(["jira", "workitem", "search", "--jql", jql, "--fields", FIELDS, "--json", "--limit", LIMIT], what);
  return issuesOf(parseJson(out, what)).map(toCard).filter((one) => one.key);
}

function toSprint(one) {
  if (!one) return null;
  return Object.freeze({
    id: String(one.id ?? ""), name: one.name ?? "", goal: one.goal ?? "",
    start: Date.parse(one.startDate ?? "") || null, end: Date.parse(one.endDate ?? "") || null,
  });
}

async function activeSprint() {
  if (!boardId()) return null;
  const what = "acli jira board list-sprints";
  const out = await acli(["jira", "board", "list-sprints", "--id", boardId(), "--state", "active", "--json"], what);
  const data = parseJson(out, what);
  const list = Array.isArray(data) ? data : data?.sprints ?? [];
  return toSprint(list[0]);
}

async function childKeys(storyKey) {
  const cards = await search(`parent = ${storyKey}`, `acli jira workitem search parent = ${storyKey}`);
  return [storyKey, Object.freeze(cards.map((one) => one.key))];
}

async function pooled(keys, task, onEach) {
  const queue = [...keys];
  let finished = 0;
  const worker = async () => {
    let done = [];
    while (queue.length) {
      done = [...done, await task(queue.shift())];
      finished += 1;
      onEach(finished, keys.length);
    }
    return done;
  };
  const parts = await Promise.all(Array.from({ length: Math.min(PARALLEL, keys.length) }, worker));
  return parts.flat();
}

function needsMap(prev, items, force) {
  if (force === "remap" || !prev?.children || Date.now() - (prev.mappedAt ?? 0) > MAP_TTL_MS) return true;
  const mapped = new Set(Object.values(prev.children).flat());
  return items.some((one) => isSubtask(one) && !mapped.has(one.key));
}

export function isBoardFresh(entry) {
  return Boolean(entry) && Date.now() - entry.at < BOARD_TTL_MS;
}

const NO_STEP = () => {};

export async function fetchBoard(force, onStep = NO_STEP) {
  const prev = peekBoard();
  if (!force && isBoardFresh(prev)) return prev;
  if (!project()) throw new Error(NEED_PROJECT);
  const sprintCall = activeSprint().catch((e) => { console.log(`jira: active sprint failed: ${e.message ?? e}`); return prev?.sprint ?? null; });
  const items = await search(sprintJql(project()), "acli jira workitem search (sprint board)");
  const remap = needsMap(prev, items, force);
  const stories = items.filter((one) => !isSubtask(one)).map((one) => one.key);
  const partial = Object.freeze({ at: prev?.at ?? 0, mappedAt: prev?.mappedAt ?? 0, sprint: prev?.sprint ?? null, items: Object.freeze(items), children: prev?.children ?? Object.freeze({}) });
  onStep(partial, remap ? { done: 0, total: stories.length } : null);
  const mapping = remap ? pooled(stories, childKeys, (done, total) => onStep(null, { done, total })).then(Object.fromEntries) : Promise.resolve(prev.children);
  const [children, sprint] = await Promise.all([mapping, sprintCall]);
  const now = Date.now();
  const entry = Object.freeze({ at: now, mappedAt: remap ? now : prev.mappedAt, sprint, items: Object.freeze(items), children: Object.freeze(children) });
  rememberBoard(entry);
  return entry;
}
