import { div } from "gpui-kit";
import { Progress, ProgressTrack, ProgressIndicator } from "gpui-base";
import { toneColor, tint } from "./widgets.js";

const BAR_MOTION = { duration: 520, easing: "ease-out" };
const WARN_RATIO = 0.7;
const DANGER_RATIO = 0.9;

export function usageBase(spec) {
  if (spec.limit !== null && spec.limit !== undefined && spec.limit > 0) return { value: spec.limit, kind: "limit" };
  if (spec.request !== null && spec.request !== undefined && spec.request > 0) return { value: spec.request, kind: "request" };
  return null;
}

export function usageRatio(spec) {
  const base = usageBase(spec);
  if (!base || spec.usage === null || spec.usage === undefined) return null;
  return spec.usage / base.value;
}

export function ratioTone(ratio) {
  if (ratio === null) return "subtle";
  if (ratio > DANGER_RATIO) return "error";
  return ratio > WARN_RATIO ? "warning" : "success";
}

function marker(t, left, height) {
  return div().absolute().top(0).left(left).w(2).h(height).bg(tint(t.foreground, "99"));
}

export function meter(t, id, spec) {
  const ratio = spec.ratio;
  const percent = ratio === null ? 0 : Math.min(100, Math.round(ratio * 100));
  const fill = spec.revealed === false ? 0 : (percent / 100) * spec.width;
  const height = spec.height ?? 6;
  const markAt = spec.markAt ?? null;
  return Progress.new(id).value(percent).flex_none()
    .child(ProgressTrack.new().relative().w(spec.width).h(height).rounded(height / 2).bg(t.raised).overflow_hidden()
      .child(ProgressIndicator.new().id(`${id}-fill`).absolute().top(0).left(0).h(height).w(fill).rounded(height / 2)
        .bg(toneColor(t, ratioTone(ratio))).transition("width", BAR_MOTION))
      .when(markAt !== null, (el) => el.child(marker(t, Math.max(0, Math.min(spec.width - 2, (markAt ?? 0) * spec.width - 1)), height))));
}
