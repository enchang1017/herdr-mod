import { svg } from "gpui-kit";

export const ICONS = Object.freeze({
  repo: "folder-git-2", agent: "square-terminal", lock: "lock", issue: "book",
});

export function icon(name, size, color) {
  return svg(`mods/team/icons/${name}.svg`).flex_none().size(size).text_color(color);
}
