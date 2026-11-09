import { Progress, ProgressTrack, ProgressIndicator } from "gpui-base";

const BAR_MOTION = { duration: 520, easing: "ease-out" };
const WARN_RATIO = 0.7;
const DANGER_RATIO = 0.9;

export function loadTone(t, ratio) {
  if (ratio === null) return t.dim;
  if (ratio > DANGER_RATIO) return t.ansi1;
  return ratio > WARN_RATIO ? t.ansi3 : t.ansi2;
}

export function healthTone(t, healthy, total) {
  if (total === 0) return t.dim;
  if (healthy === total) return t.ansi2;
  return healthy / total >= 0.5 ? t.ansi3 : t.ansi1;
}

export function meter(t, id, spec) {
  const ratio = spec.ratio;
  const percent = ratio === null ? 0 : Math.max(0, Math.min(100, Math.round(ratio * 100)));
  const height = spec.height ?? 6;
  return Progress.new(id).value(percent).flex_none()
    .child(ProgressTrack.new().relative().w(spec.width).h(height).rounded(height / 2).bg(t.raised).overflow_hidden()
      .child(ProgressIndicator.new().id(`${id}-fill`).absolute().top(0).left(0).h(height).w((percent / 100) * spec.width).rounded(height / 2)
        .bg(spec.color ?? loadTone(t, ratio)).transition("width", BAR_MOTION)));
}
