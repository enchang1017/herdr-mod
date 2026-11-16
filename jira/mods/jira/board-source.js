import { acli, parseJson, errorText } from "./acli.js";
import { knownIdentity, rememberIdentity } from "./data.js";
import { boardId, useDetected } from "./settings.js";

const LIST_TTL_MS = 600000;
const DETECT_TTL_MS = 86400000;
const BOARD_LIMIT = "500";
const PROJECT_IN_LOCATION = /\(([A-Z][A-Z0-9_]*)\)\s*$/;
const NO_SPRINTS = /does not support sprints/i;

let listed = null;

function toBoard(one) {
  const location = String(one?.location ?? "");
  return Object.freeze({
    id: String(one?.id ?? ""), name: String(one?.name ?? ""), type: String(one?.type ?? "").toLowerCase(),
    location, project: location.match(PROJECT_IN_LOCATION)?.[1] ?? "",
  });
}

export async function listBoards(force) {
  if (!force && listed && Date.now() - listed.at < LIST_TTL_MS) return listed.boards;
  const what = "acli jira board search";
  const data = parseJson(await acli(["jira", "board", "search", "--json", "--limit", BOARD_LIMIT], what), what);
  const values = Array.isArray(data) ? data : data?.values ?? data?.boards ?? [];
  const boards = Object.freeze(values.map(toBoard).filter((one) => one.id).sort((a, b) => a.name.localeCompare(b.name)));
  listed = Object.freeze({ at: Date.now(), boards });
  return boards;
}

async function boardOf(id) {
  const what = `acli jira board view ${id}`;
  return toBoard(parseJson(await acli(["jira", "board", "view", "--id", id, "--json"], what), what));
}

async function projectOf(id, fallback) {
  const what = `acli jira board list-projects ${id}`;
  try {
    const data = parseJson(await acli(["jira", "board", "list-projects", "--id", id, "--json"], what), what);
    const list = Array.isArray(data) ? data : data?.projects ?? data?.values ?? [];
    return String(list[0]?.key ?? "") || fallback;
  } catch (e) {
    console.log(`jira: ${what} failed, using ${fallback || "no project"}: ${errorText(e)}`);
    return fallback;
  }
}

async function sprintsSupported(id) {
  try {
    await acli(["jira", "board", "list-sprints", "--id", id, "--state", "active", "--json"], `acli jira board list-sprints ${id}`);
    return true;
  } catch (e) {
    if (NO_SPRINTS.test(errorText(e))) return false;
    throw e;
  }
}

async function modeOf(board) {
  if (board.type === "scrum" || board.type === "kanban") return board.type;
  return (await sprintsSupported(board.id)) ? "scrum" : "kanban";
}

async function detectBoard(id) {
  const board = await boardOf(id);
  const [project, mode] = await Promise.all([projectOf(id, board.project), modeOf(board)]);
  return Object.freeze({ id, name: board.name, type: board.type, project, mode, at: Date.now() });
}

const isFreshFor = (info, id) => Boolean(info) && info.id === id && Date.now() - (info.at ?? 0) < DETECT_TTL_MS;

export async function resolveBoard(force) {
  const id = boardId();
  if (!id) {
    useDetected(null);
    return null;
  }
  const known = knownIdentity().boardInfo;
  if (!force && isFreshFor(known, id)) {
    useDetected(known);
    return known;
  }
  useDetected(known?.id === id ? known : null);
  const info = await detectBoard(id);
  rememberIdentity({ boardInfo: info });
  useDetected(info);
  return info;
}

export function matchBoards(boards, filter) {
  const terms = String(filter ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return boards;
  return boards.filter((one) => {
    const hay = `${one.name} ${one.location} ${one.project} ${one.type} ${one.id}`.toLowerCase();
    return terms.every((term) => hay.includes(term));
  });
}
