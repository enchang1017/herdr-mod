const ALPHA = Object.freeze({ clear: "00", subtle: "14", soft: "24", hover: "40", border: "66", strong: "aa" });

export function shade(color, step) {
  return `${String(color).slice(0, 7)}${ALPHA[step]}`;
}
