function firstFree(lanes) {
  const at = lanes.indexOf(null);
  return at < 0 ? lanes.length : at;
}

function trimLanes(lanes) {
  const copy = [...lanes];
  while (copy.length && copy[copy.length - 1] === null) copy.pop();
  return copy;
}

function topSegments(top, hash, col) {
  return top.flatMap((lane, j) => {
    if (!lane) return [];
    return [{ half: "top", from: j, to: lane === hash ? col : j, lane: j }];
  });
}

function placeParents(start, parents, col) {
  const next = [...start];
  while (next.length <= col) next.push(null);
  const segments = [];
  const [first, ...others] = parents;
  if (first) {
    const existing = next.indexOf(first);
    if (existing >= 0 && existing !== col) segments.push({ half: "bottom", from: col, to: existing, lane: existing });
    else {
      next[col] = first;
      segments.push({ half: "bottom", from: col, to: col, lane: col });
    }
  }
  for (const parent of others) {
    const known = next.indexOf(parent);
    const lane = known >= 0 ? known : firstFree(next);
    if (known < 0) next[lane] = parent;
    segments.push({ half: "bottom", from: col, to: lane, lane });
  }
  return { next, segments };
}

function rowFor(lanes, commit) {
  const found = lanes.indexOf(commit.hash);
  const col = found >= 0 ? found : firstFree(lanes);
  const top = lanes;
  const cleared = top.map((lane) => (lane === commit.hash ? null : lane));
  const placed = placeParents(cleared, commit.parents, col);
  const through = top.flatMap((lane, j) => (lane && lane !== commit.hash ? [{ half: "bottom", from: j, to: j, lane: j }] : []));
  const next = trimLanes(placed.next);
  const segments = [...topSegments(top, commit.hash, col), ...placed.segments, ...through];
  return { row: { col, segments, width: Math.max(top.length, next.length, col + 1), isMerge: commit.parents.length > 1 }, next };
}

export function layoutLanes(commits) {
  let lanes = [];
  const rows = [];
  for (const commit of commits) {
    const step = rowFor(lanes, commit);
    rows.push(step.row);
    lanes = step.next;
  }
  return { rows, width: Math.max(1, ...rows.map((row) => row.width)) };
}
