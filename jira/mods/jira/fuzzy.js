const GAP_PENALTY = 1;
const START_BONUS = 8;
const RUN_BONUS = 5;

function termScore(text, term) {
  const exact = text.indexOf(term);
  if (exact >= 0) return 100 - Math.min(exact, 50) + term.length * RUN_BONUS;
  let score = 0;
  let at = -1;
  for (const ch of term) {
    const next = text.indexOf(ch, at + 1);
    if (next < 0) return null;
    const gap = next - at - 1;
    score += (gap === 0 ? RUN_BONUS : -Math.min(gap, 10) * GAP_PENALTY) + (next === 0 || text[next - 1] === " " ? START_BONUS : 0);
    at = next;
  }
  return score;
}

function haystack(row) {
  return `${row.key} ${row.summary} ${row.status} ${row.assignee} ${row.type} ${row.priority}`.toLowerCase();
}

function rowScore(row, terms) {
  const text = haystack(row);
  const scores = terms.map((term) => termScore(text, term));
  return scores.some((one) => one === null) ? null : scores.reduce((sum, one) => sum + one, 0);
}

export function fuzzyRows(rows, filter) {
  const terms = String(filter ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return rows;
  return rows
    .map((row, index) => ({ row, index, score: rowScore(row, terms) }))
    .filter((one) => one.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((one) => one.row);
}
