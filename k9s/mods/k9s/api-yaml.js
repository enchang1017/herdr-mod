const LETTER = /\p{L}/u;
const DIGIT = /[0-9]/;
const OLD_BOOL = /^(y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF)$/;
const RESOLVES = /^(~|null|Null|NULL|true|True|TRUE|false|False|FALSE|[-+]?\.(inf|Inf|INF)|\.(nan|NaN|NAN)|[-+]?(0|[1-9][0-9_]*)|[-+]?0[0-7_]+|[-+]?0x[0-9a-fA-F_]+|[-+]?0b[01_]+|[-+]?([0-9][0-9_]*)?\.[0-9_]*([eE][-+]?[0-9]+)?|[-+]?[0-9][0-9_]*([eE][-+]?[0-9]+)|[-+]?[0-9][0-9_]*(:[0-5]?[0-9])+(\.[0-9_]*)?|<<|=)$/;
const TIMESTAMP = /^\d{4}-\d\d?-\d\d?([Tt ]|$)/;
const START_INDICATOR = /^([#,[\]{}&*!|>'"%@`]|[-?:](\s|$)|---|\.\.\.)/;
const BLOCK_INDICATOR = /(:(\s|$)|\s#)/;
const FLOW_INDICATOR = /[,?[\]{}]/;
const UNPRINTABLE = /[\x00-\x08\x0b-\x1f\x7f-\x9f﻿￾￿]/;

function digitRun(chars, from) {
  let end = from;
  let value = 0;
  while (end < chars.length && DIGIT.test(chars[end])) {
    value = value * 10 + Number(chars[end]);
    end += 1;
  }
  return { end, value };
}

function compareAt(a, b, at) {
  const isLetterA = LETTER.test(a[at]);
  const isLetterB = LETTER.test(b[at]);
  if (isLetterA && isLetterB) return a[at] < b[at] ? -1 : 1;
  if (isLetterA || isLetterB) return isLetterB ? -1 : 1;
  const left = digitRun(a, at);
  const right = digitRun(b, at);
  if (left.value !== right.value) return left.value - right.value;
  if (left.end !== right.end) return left.end - right.end;
  return a[at] < b[at] ? -1 : 1;
}

export function compareKeys(left, right) {
  const a = [...left];
  const b = [...right];
  const at = a.findIndex((char, index) => index < b.length && char !== b[index]);
  if (at >= 0) return compareAt(a, b, at);
  return a.length - b.length;
}

function needsDoubleQuotes(text) {
  return text === "" || RESOLVES.test(text) || OLD_BOOL.test(text) || TIMESTAMP.test(text) || UNPRINTABLE.test(text);
}

function isPlain(text, isKey) {
  if (START_INDICATOR.test(text) || BLOCK_INDICATOR.test(text)) return false;
  if (/^\s|\s$/.test(text)) return false;
  return !(isKey && FLOW_INDICATOR.test(text));
}

function doubleQuoted(text) {
  const escaped = [...text].map((char) => {
    if (char === "\"" || char === "\\") return `\\${char}`;
    if (char === "\n") return "\\n";
    if (char === "\t") return "\\t";
    if (UNPRINTABLE.test(char)) return `\\u${char.codePointAt(0).toString(16).padStart(4, "0")}`;
    return char;
  });
  return `"${escaped.join("")}"`;
}

function canLiteral(text) {
  return !UNPRINTABLE.test(text) && !/^[ \t\n]/.test(text) && !/[ \t]\n/.test(text) && !/[ \t]$/.test(text);
}

function literal(text, indent) {
  const trailing = text.match(/\n*$/)[0].length;
  const chomp = trailing === 0 ? "-" : trailing === 1 ? "" : "+";
  const pad = " ".repeat(indent);
  const lines = text.replace(/\n$/, "").split("\n").map((line) => (line ? `${pad}${line}` : ""));
  return `|${chomp}\n${lines.join("\n")}`;
}

export function scalar(value, options = {}) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const text = String(value);
  if (!options.isKey && text.includes("\n") && canLiteral(text)) return literal(text, options.indent ?? 2);
  if (needsDoubleQuotes(text) || text.includes("\n")) return doubleQuoted(text);
  if (isPlain(text, options.isKey)) return text;
  return `'${text.replace(/'/g, "''")}'`;
}

function isEmpty(value) {
  return Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0;
}

function isCollection(value) {
  return value !== null && typeof value === "object";
}

function entryLines(key, value, indent) {
  const pad = " ".repeat(indent);
  const name = scalar(key, { isKey: true });
  if (!isCollection(value)) return [`${pad}${name}: ${scalar(value, { indent: indent + 2 })}`];
  if (isEmpty(value)) return [`${pad}${name}: ${Array.isArray(value) ? "[]" : "{}"}`];
  return [`${pad}${name}:`, ...nodeLines(value, Array.isArray(value) ? indent : indent + 2)];
}

function itemLines(item, indent) {
  const pad = " ".repeat(indent);
  if (!isCollection(item)) return [`${pad}- ${scalar(item, { indent: indent + 2 })}`];
  if (isEmpty(item)) return [`${pad}- ${Array.isArray(item) ? "[]" : "{}"}`];
  const [first, ...rest] = nodeLines(item, indent + 2);
  return [`${pad}- ${first.slice(indent + 2)}`, ...rest];
}

function nodeLines(value, indent) {
  if (Array.isArray(value)) return value.flatMap((item) => itemLines(item, indent));
  return Object.keys(value).sort(compareKeys).flatMap((key) => entryLines(key, value[key], indent));
}

export function toYaml(value) {
  if (!isCollection(value)) return `${scalar(value)}\n`;
  if (isEmpty(value)) return Array.isArray(value) ? "[]\n" : "{}\n";
  return `${nodeLines(value, 0).join("\n")}\n`;
}

export function withoutManagedFields(object) {
  const metadata = object?.metadata;
  if (!metadata || !("managedFields" in metadata)) return object;
  const { managedFields: _dropped, ...rest } = metadata;
  return { ...object, metadata: rest };
}
