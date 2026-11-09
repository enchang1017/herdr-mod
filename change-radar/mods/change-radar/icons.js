import { svg } from "gpui-kit";

export const ICONS = Object.freeze({
  radar: "radar", repo: "folder-git-2", branch: "git-branch", commit: "git-commit-horizontal", graph: "git-graph", compare: "git-compare",
  summary: "lightbulb", file: "file", folder: "folder", folderOpen: "folder-open", agent: "square-terminal", error: "circle-alert",
  tag: "tag", check: "check", cloud: "cloud", diff: "file-diff", close: "x", open: "chevron-down", closed: "chevron-right",
  warning: "triangle-alert", history: "history", swap: "arrow-left-right", ci: "zap", mr: "git-pull-request", ship: "rocket",
  comment: "message-square", steps: "list-ordered", db: "database", service: "server", ui: "monitor", tests: "flask-conical",
});

export function icon(name, size, color) {
  return svg(`mods/change-radar/icons/${name}.svg`).flex_none().size(size).text_color(color);
}

export function caret(isOpen, color) {
  return icon(isOpen ? ICONS.open : ICONS.closed, 12, color);
}
