import { project, NEED_PROJECT } from "./settings.js";

const MINE = "assignee = currentUser()";
const LIMIT = 50;

export const VIEWS = Object.freeze([
  { key: "mine", label: "MINE", icon: "user", limit: LIMIT, jql: `${MINE} AND statusCategory != Done ORDER BY updated DESC` },
  { key: "board", label: "BOARD", icon: "square-kanban", limit: 200, jql: null, sprint: true },
  { key: "progress", label: "IN PROGRESS", icon: "loader", limit: LIMIT, jql: `${MINE} AND statusCategory = "In Progress" ORDER BY updated DESC` },
  { key: "todo", label: "TO DO", icon: "list-todo", limit: LIMIT, jql: `${MINE} AND statusCategory = "To Do" ORDER BY updated DESC` },
  { key: "recent", label: "RECENT", icon: "history", limit: LIMIT, jql: "issuekey in issueHistory() ORDER BY lastViewed DESC" },
  { key: "sprint", label: "SPRINT", icon: "zap", limit: 100, jql: null, sprint: true },
  { key: "jql", label: "JQL", icon: "filter", limit: LIMIT, jql: null },
]);

export const DEFAULT_JQL = VIEWS[0].jql;

export const sprintJql = (key) => `project = ${key} AND sprint in openSprints() ORDER BY Rank ASC`;

export function viewOf(key) {
  return VIEWS.find((one) => one.key === key) ?? VIEWS[0];
}

export function queryOf(key, customJql) {
  const view = viewOf(key);
  if (view.sprint) return project() ? { jql: sprintJql(project()), limit: view.limit } : { jql: "", limit: view.limit, problem: NEED_PROJECT };
  return { jql: view.jql ?? (customJql.trim() || DEFAULT_JQL), limit: view.limit };
}
