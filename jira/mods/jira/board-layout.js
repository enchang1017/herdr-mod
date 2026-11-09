export const LANE_HEAD = 34;
export const LANE_GAP = 6;
export const CARD_H = 86;
export const CARD_GAP = 6;
export const CELL_PAD = 6;
export const COL_HEAD = 30;
export const BODY_TOP = 4;
const BORDER = 1;
const MARGIN = 12;

export function deepest(lane) {
  return Math.max(1, ...lane.cells.map((cards) => cards.length));
}

export function bodyHeight(lane) {
  const rows = deepest(lane);
  return BODY_TOP + BORDER * 2 + CELL_PAD * 2 + rows * CARD_H + (rows - 1) * CARD_GAP;
}

export function laneHeight(lane) {
  return LANE_HEAD + (lane.collapsed ? 0 : bodyHeight(lane));
}

export function laneTops(lanes) {
  return lanes.reduce((tops, lane, index) => [...tops, index === 0 ? 0 : tops[index - 1] + laneHeight(lanes[index - 1]) + LANE_GAP], []);
}

export function contentHeight(lanes) {
  return lanes.reduce((sum, lane) => sum + laneHeight(lane) + LANE_GAP, 0);
}

export function cardTop(laneTop, row) {
  return laneTop + LANE_HEAD + BODY_TOP + BORDER + CELL_PAD + row * (CARD_H + CARD_GAP);
}

export function clampScroll(value, lanes, viewHeight) {
  const max = Math.max(0, contentHeight(lanes) - viewHeight);
  return Math.max(0, Math.min(max, Math.round(value)));
}

export function revealed(scroll, top, height, viewHeight) {
  if (!viewHeight) return scroll;
  if (top - MARGIN < scroll) return Math.max(0, top - MARGIN);
  if (top + height + MARGIN > scroll + viewHeight) return top + height + MARGIN - viewHeight;
  return scroll;
}
