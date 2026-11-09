import { planUrlPattern } from "./settings.js";

const BLOCKS = new Set(["paragraph", "heading", "codeBlock", "blockquote", "rule", "table", "tableRow", "mediaSingle", "panel"]);
const SLUG_WORDS = 6;
const SLUG_CHARS = 40;

function linkOf(node) {
  const href = (node.marks ?? []).find((mark) => mark.type === "link")?.attrs?.href;
  return href && href !== node.text ? ` (${href})` : "";
}

function inline(node) {
  if (node.type === "text") return `${node.text ?? ""}${linkOf(node)}`;
  if (node.type === "hardBreak") return "\n";
  if (node.type === "mention") return node.attrs?.text ?? "@someone";
  if (node.type === "emoji") return node.attrs?.text ?? node.attrs?.shortName ?? "";
  if (node.type === "inlineCard" || node.type === "blockCard" || node.type === "embedCard") return node.attrs?.url ?? "";
  if (node.type === "status") return `[${node.attrs?.text ?? ""}]`;
  return null;
}

function walk(node, prefix) {
  if (!node || typeof node !== "object") return "";
  const own = inline(node);
  if (own !== null) return own;
  const items = Array.isArray(node.content) ? node.content : [];
  if (node.type === "bulletList" || node.type === "orderedList") {
    return items.map((item, i) => walk(item, node.type === "orderedList" ? `${i + 1}. ` : "\u{2022} ")).join("");
  }
  const inner = items.map((child) => walk(child, "")).join(node.type === "tableRow" ? " | " : "");
  if (node.type === "listItem") return `${prefix}${inner.trim()}\n`;
  if (node.type === "rule") return "\u{2500}\u{2500}\u{2500}\n";
  if (node.type === "heading") return `\n${inner.toUpperCase()}\n`;
  return BLOCKS.has(node.type) ? `${inner}\n` : inner;
}

export function plainText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return walk(value, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function planUrls(value) {
  const pattern = planUrlPattern();
  if (!pattern) return [];
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return [...new Set(text.match(new RegExp(pattern, "g")) ?? [])];
}

function isSprint(value) {
  return Array.isArray(value) && value.some((one) => (one && typeof one === "object" && "boardId" in one && one.name) || (typeof one === "string" && one.includes("greenhopper")));
}

function sprintName(one) {
  if (typeof one === "string") return /name=([^,\]]+)/.exec(one)?.[1] ?? null;
  return one?.state ? `${one.name} (${one.state})` : one?.name ?? null;
}

export function sprintOf(fields) {
  const value = Object.values(fields ?? {}).find(isSprint);
  if (!value) return null;
  const names = value.map(sprintName).filter(Boolean);
  return names.length ? names[names.length - 1] : null;
}

export function epicOf(fields) {
  const parent = fields?.parent;
  if (parent?.key) return Object.freeze({ key: parent.key, summary: parent.fields?.summary ?? "" });
  const link = fields?.customfield_10014;
  return typeof link === "string" && link ? Object.freeze({ key: link, summary: "" }) : null;
}

export function slug(summary) {
  const words = String(summary ?? "").replace(/\[[^\]]*\]/g, " ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  return words.slice(0, SLUG_WORDS).join("-").slice(0, SLUG_CHARS).replace(/-+$/, "");
}

export function branchName(key, summary) {
  const tail = slug(summary);
  return tail ? `feature/${key}-${tail}` : `feature/${key}`;
}

export function initials(name) {
  const parts = String(name ?? "").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`).toUpperCase();
}

export function age(at) {
  if (!at) return "";
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function clock(at) {
  return at ? new Date(at).toTimeString().slice(0, 5) : "";
}
