import { acli, parseJson, KEY } from "./acli.js";
import { plainText, planUrls, sprintOf, epicOf } from "./text.js";
import { diskSnapshot, markDiskDirty } from "./disk-cache.js";

const LIST_FIELDS = "issuetype,key,assignee,priority,status,summary";
const VIEW_FIELDS = "*navigable,comment";
const STATUS_FIELDS = "status";
const STATUS_SAMPLE = 100;
const LIST_TTL_MS = 60000;
const DETAIL_TTL_MS = 300000;
const STATUS_TTL_MS = 600000;
const MAX_LISTS = 20;
const MAX_DETAILS = 60;
const MAX_STATUS_SETS = 20;

export const CACHE_MS = LIST_TTL_MS;

let lists = new Map();
let details = new Map();
let statusSets = new Map();
let identity = { site: null, me: null };
let board = null;

function newestOf(entries, limit) {
  return new Map([...entries].sort((a, b) => (a[1]?.at ?? 0) - (b[1]?.at ?? 0)).slice(-limit));
}

function withEntry(map, key, value, limit) {
  const rest = [...map].filter(([one]) => one !== key);
  return new Map([...rest, [key, value]].slice(-limit));
}

const touched = () => markDiskDirty(diskSnapshot(lists, details, { ...identity, board }));

export function hydrate(data) {
  if (!data) return;
  lists = newestOf(new Map([...Object.entries(data.lists ?? {}), ...lists]), MAX_LISTS);
  details = newestOf(new Map([...Object.entries(data.details ?? {}), ...details]), MAX_DETAILS);
  identity = { site: data.site ?? identity.site, me: data.me ?? identity.me };
  board = board ?? data.board ?? null;
}

export const peekBoard = () => board;

export function rememberBoard(entry) {
  board = entry;
  touched();
}

export function rememberIdentity(patch) {
  identity = { ...identity, ...patch };
  touched();
}

export const knownIdentity = () => identity;

export const peekList = (jql) => lists.get(jql) ?? null;

const fresh = (entry, ttl, force) => Boolean(entry) && !force && Date.now() - entry.at < ttl;
const when = (text) => Date.parse(text ?? "") || null;

function statusOf(fields) {
  return { status: fields?.status?.name ?? "", category: fields?.status?.statusCategory?.key ?? "" };
}

export function toRow(issue) {
  const f = issue?.fields ?? {};
  return Object.freeze({
    key: String(issue?.key ?? ""), type: f.issuetype?.name ?? "", summary: f.summary ?? "", ...statusOf(f),
    priority: f.priority?.name ?? "", assignee: f.assignee?.displayName ?? "",
  });
}

function toRef(issue) {
  return Object.freeze({ key: String(issue?.key ?? ""), summary: issue?.fields?.summary ?? "", type: issue?.fields?.issuetype?.name ?? "", ...statusOf(issue?.fields) });
}

function toLink(link) {
  const outward = Boolean(link?.outwardIssue);
  const other = outward ? link.outwardIssue : link?.inwardIssue;
  const label = (outward ? link?.type?.outward : link?.type?.inward) ?? link?.type?.name ?? "linked";
  return Object.freeze({ ...toRef(other), label });
}

function toComment(comment) {
  return Object.freeze({ id: String(comment?.id ?? ""), author: comment?.author?.displayName ?? "someone", at: when(comment?.created), text: plainText(comment?.body) });
}

function toDetail(issue) {
  const f = issue?.fields ?? {};
  const comments = Array.isArray(f.comment?.comments) ? f.comment.comments : [];
  return Object.freeze({
    ...toRow(issue), project: f.project?.key ?? String(issue?.key ?? "").split("-")[0],
    created: when(f.created), updated: when(f.updated), reporter: f.reporter?.displayName ?? "", labels: Object.freeze([...(f.labels ?? [])]),
    sprint: sprintOf(f), epic: epicOf(f), description: plainText(f.description),
    comments: Object.freeze(comments.map(toComment)), subtasks: Object.freeze((f.subtasks ?? []).map(toRef)),
    links: Object.freeze((f.issuelinks ?? []).map(toLink).filter((one) => one.key)),
    plan: Object.freeze(planUrls([f.description, f.comment])),
  });
}

export function issuesOf(data) {
  return Array.isArray(data) ? data : data?.issues ?? data?.workItems ?? [];
}

export async function searchIssues(jql, limit, force) {
  const hit = lists.get(jql);
  if (fresh(hit, LIST_TTL_MS, force)) return hit;
  const what = "acli jira workitem search";
  const out = await acli(["jira", "workitem", "search", "--jql", jql, "--fields", LIST_FIELDS, "--json", "--limit", String(limit)], what);
  const entry = Object.freeze({ at: Date.now(), rows: Object.freeze(issuesOf(parseJson(out, what)).map(toRow).filter((one) => one.key)) });
  lists = withEntry(lists, jql, entry, MAX_LISTS);
  touched();
  return entry;
}

export async function viewIssue(key, force, maxAge = DETAIL_TTL_MS) {
  if (!KEY.test(key)) throw new Error(`Not a Jira key: ${key}`);
  const hit = details.get(key);
  if (fresh(hit, maxAge, force)) return hit.detail;
  const what = `acli jira workitem view ${key}`;
  const data = parseJson(await acli(["jira", "workitem", "view", key, "--fields", VIEW_FIELDS, "--json"], what), what);
  const detail = toDetail(Array.isArray(data) ? data[0] : data);
  details = withEntry(details, key, Object.freeze({ at: Date.now(), detail }), MAX_DETAILS);
  touched();
  return detail;
}

export function cachedDetail(key) {
  return details.get(key)?.detail ?? null;
}

export function needsDetail(key) {
  return !fresh(details.get(key), DETAIL_TTL_MS, false);
}

export function forgetLists() {
  lists = new Map();
}

const quote = (text) => `"${String(text).replace(/["\\]/g, "")}"`;

export async function knownStatuses(project, type) {
  const id = `${project}/${type}`;
  const hit = statusSets.get(id);
  if (fresh(hit, STATUS_TTL_MS, false)) return hit.list;
  const jql = `project = ${quote(project)} AND issuetype = ${quote(type)} AND updated >= -90d ORDER BY updated DESC`;
  const what = "acli jira workitem search (statuses)";
  const out = await acli(["jira", "workitem", "search", "--jql", jql, "--fields", STATUS_FIELDS, "--json", "--limit", String(STATUS_SAMPLE)], what);
  const seen = new Map(issuesOf(parseJson(out, what)).map((one) => statusOf(one?.fields)).filter((one) => one.status).map((one) => [one.status, one]));
  const list = Object.freeze([...seen.values()].map((one) => Object.freeze(one)));
  statusSets = withEntry(statusSets, id, Object.freeze({ at: Date.now(), list }), MAX_STATUS_SETS);
  return list;
}

export async function whoAmI() {
  const entry = await searchIssues("assignee = currentUser() ORDER BY updated DESC", 1, false);
  return entry.rows[0]?.assignee || null;
}
