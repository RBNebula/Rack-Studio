import type { Vec3 } from '../model';

export interface LineRouteSegment {
  kind: 'line';
  start: Vec3;
  end: Vec3;
}
export interface ArcRouteSegment {
  kind: 'arc';
  start: Vec3;
  end: Vec3;
  center: Vec3;
  normal: Vec3;
  radiusMm: number;
  angleRadians: number;
}
export type RouteSegment = LineRouteSegment | ArcRouteSegment;

const EPS = 1e-7;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, n: number): Vec3 => [a[0] * n, a[1] * n, a[2] * n];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3) => Math.hypot(...a);
const unit = (a: Vec3): Vec3 => (norm(a) > EPS ? mul(a, 1 / norm(a)) : [0, 0, 0]);
const distance = (a: Vec3, b: Vec3) => norm(sub(a, b));
const rotate = (v: Vec3, axis: Vec3, angle: number): Vec3 =>
  add(
    add(mul(v, Math.cos(angle)), mul(cross(axis, v), Math.sin(angle))),
    mul(axis, dot(axis, v) * (1 - Math.cos(angle))),
  );

export const routeSegmentLength = (segment: RouteSegment): number =>
  segment.kind === 'line'
    ? distance(segment.start, segment.end)
    : segment.radiusMm * segment.angleRadians;

export function routeSegmentPoint(segment: RouteSegment, fraction: number): Vec3 {
  if (fraction <= 0) return [...segment.start];
  if (fraction >= 1) return [...segment.end];
  return segment.kind === 'line'
    ? add(segment.start, mul(sub(segment.end, segment.start), fraction))
    : add(
        segment.center,
        rotate(
          sub(segment.start, segment.center),
          unit(segment.normal),
          segment.angleRadians * fraction,
        ),
      );
}

export function routeSegmentTangent(segment: RouteSegment, fraction: number): Vec3 {
  return segment.kind === 'line'
    ? unit(sub(segment.end, segment.start))
    : unit(cross(segment.normal, sub(routeSegmentPoint(segment, fraction), segment.center)));
}

export interface SampledRoute {
  points: Vec3[];
  /** One conservative curve-deviation allowance per consecutive point pair. */
  sagittas: number[];
  chords: SampledRouteChord[];
  lengthMm: number;
  minRadiusMm: number | null;
}

export interface SampledRouteChord {
  start: Vec3;
  end: Vec3;
  sagittaMm: number;
  segment: RouteSegment;
  fromFraction: number;
  toFraction: number;
}

/** Same exact line/arc geometry drives rendering, length and collision envelopes. */
export function sampleRouteSegments(segments: readonly RouteSegment[]): SampledRoute {
  const points: Vec3[] = [],
    sagittas: number[] = [],
    chords: SampledRouteChord[] = [];
  let lengthMm = 0,
    minRadiusMm = Number.POSITIVE_INFINITY;
  const push = (
    point: Vec3,
    sagitta: number,
    segment?: RouteSegment,
    fromFraction = 0,
    toFraction = 1,
  ) => {
    if (points.length && distance(points[points.length - 1], point) < EPS) return;
    if (points.length) {
      const start = points[points.length - 1];
      sagittas.push(sagitta);
      chords.push({
        start,
        end: point,
        sagittaMm: sagitta,
        segment: segment ?? { kind: 'line', start, end: point },
        fromFraction,
        toFraction,
      });
    }
    points.push([...point]);
  };
  for (const segment of segments) {
    push(segment.start, 0);
    lengthMm += routeSegmentLength(segment);
    if (segment.kind === 'line') {
      push(segment.end, 0, segment);
      continue;
    }
    minRadiusMm = Math.min(minRadiusMm, segment.radiusMm);
    const maxStep = Math.min(
      Math.PI / 60,
      2 * Math.acos(Math.max(-1, 1 - 0.05 / Math.max(segment.radiusMm, 0.05))),
    );
    const steps = Math.max(2, Math.ceil(segment.angleRadians / Math.max(maxStep, 0.005)));
    const sagitta = segment.radiusMm * (1 - Math.cos(segment.angleRadians / steps / 2));
    for (let index = 1; index <= steps; index++)
      push(
        routeSegmentPoint(segment, index / steps),
        sagitta,
        segment,
        (index - 1) / steps,
        index / steps,
      );
  }
  return {
    points,
    sagittas,
    chords,
    lengthMm,
    minRadiusMm: Number.isFinite(minRadiusMm) ? minRadiusMm : null,
  };
}

export interface ParallelFollowRunInput {
  segments: readonly RouteSegment[];
  startPercent: number;
  endPercent: number;
  offsetMm: number;
  minimumOffsetMm: number;
  minimumBendRadiusMm: number | null;
}

export interface ParallelFollowRun extends SampledRoute {
  valid: boolean;
  issues: string[];
  segments: RouteSegment[];
  startTangent: Vec3;
  endTangent: Vec3;
  offsetMm: number;
}

/**
 * Slice the reference's exact centreline by arc length, then parallel-transport
 * a normal along its analytic lines and circles. Offset circles remain circles;
 * dense render samples are never re-filleted or interpreted as routing nodes.
 * The normal begins at the least-aligned positive world axis. Its side remains
 * deterministic when the percentage range changes.
 */
export function createParallelFollowRun(input: ParallelFollowRunInput): ParallelFollowRun {
  const issues: string[] = [];
  const fail = (message: string): ParallelFollowRun => ({
    valid: false,
    issues: [message],
    segments: [],
    points: [],
    sagittas: [],
    chords: [],
    lengthMm: 0,
    minRadiusMm: null,
    startTangent: [0, 0, 0],
    endTangent: [0, 0, 0],
    offsetMm: input.offsetMm,
  });
  if (
    !Number.isFinite(input.startPercent) ||
    !Number.isFinite(input.endPercent) ||
    input.startPercent < 0 ||
    input.endPercent > 100 ||
    input.startPercent >= input.endPercent
  ) {
    return fail('Follow range must have 0 ≤ start < end ≤ 100 percent of the reference route.');
  }
  if (
    !Number.isFinite(input.offsetMm) ||
    !Number.isFinite(input.minimumOffsetMm) ||
    input.minimumOffsetMm <= 0 ||
    input.offsetMm + EPS < input.minimumOffsetMm
  ) {
    return fail(
      `Follow offset must be at least ${input.minimumOffsetMm} mm to separate both cable radii and clearance.`,
    );
  }
  if (
    input.minimumBendRadiusMm !== null &&
    (!Number.isFinite(input.minimumBendRadiusMm) || input.minimumBendRadiusMm <= 0)
  ) {
    return fail(
      'The following cable needs a positive finite bend radius, or an explicit unknown specification.',
    );
  }
  if (
    input.segments.some(
      (segment) =>
        !Number.isFinite(routeSegmentLength(segment)) ||
        ![
          segment.start,
          segment.end,
          ...(segment.kind === 'arc' ? [segment.center, segment.normal] : []),
        ].every((point) => point.every(Number.isFinite)),
    )
  ) {
    return fail('The followed cable contains non-finite geometry.');
  }
  if (
    input.segments.some(
      (segment) =>
        segment.kind === 'arc' &&
        (segment.radiusMm <= EPS || segment.angleRadians <= 0 || norm(segment.normal) < EPS),
    )
  ) {
    return fail('The followed cable contains an invalid circular bend.');
  }
  const reference = input.segments.filter((segment) => routeSegmentLength(segment) > EPS);
  if (!reference.length) return fail('The followed cable has no usable geometric run.');
  const total = reference.reduce((length, segment) => length + routeSegmentLength(segment), 0);
  if (!Number.isFinite(total))
    return fail('The followed cable length exceeds supported numerical precision.');
  const startDistance = (total * input.startPercent) / 100,
    endDistance = (total * input.endPercent) / 100;
  let tangent = routeSegmentTangent(reference[0], 0);
  const axis = (
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as Vec3[]
  ).sort((a, b) => Math.abs(dot(a, tangent)) - Math.abs(dot(b, tangent)))[0];
  let normal = unit(sub(axis, mul(tangent, dot(axis, tangent))));
  let walked = 0;
  const segments: RouteSegment[] = [];
  for (const [index, segment] of reference.entries()) {
    if (index && distance(reference[index - 1].end, segment.start) > EPS)
      return fail('The followed cable contains a discontinuous centreline.');
    const length = routeSegmentLength(segment),
      nextTangent = routeSegmentTangent(segment, 0);
    const rotationAxis = cross(tangent, nextTangent);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(tangent, nextTangent))));
    if (angle > 1e-4) {
      // A valid reference route has tangent-continuous line/arc joins. A sharp
      // or reversing imported run cannot be represented as a finite-radius run.
      return fail(
        'The followed route has a discontinuous tangent; its shared run cannot be offset safely.',
      );
    }
    if (norm(rotationAxis) > EPS) normal = rotate(normal, unit(rotationAxis), angle);
    normal = unit(sub(normal, mul(nextTangent, dot(normal, nextTangent))));
    const from = Math.max(0, (startDistance - walked) / length);
    const to = Math.min(1, (endDistance - walked) / length);
    if (from < to && to > 0 && from < 1) {
      const a = Math.max(0, from),
        b = Math.min(1, to);
      const start = routeSegmentPoint(segment, a),
        end = routeSegmentPoint(segment, b);
      if (segment.kind === 'line') {
        segments.push({
          kind: 'line',
          start: add(start, mul(normal, input.offsetMm)),
          end: add(end, mul(normal, input.offsetMm)),
        });
      } else {
        const n = unit(segment.normal);
        const firstNormal = rotate(normal, n, segment.angleRadians * a);
        const lastNormal = rotate(normal, n, segment.angleRadians * b);
        const radial = unit(sub(start, segment.center));
        const radiusMm = segment.radiusMm + input.offsetMm * dot(firstNormal, radial);
        if (radiusMm <= EPS)
          return fail(
            'The requested offset collapses or reverses an inside bend. Reduce the offset or choose another shared range.',
          );
        const center = add(segment.center, mul(n, input.offsetMm * dot(firstNormal, n)));
        segments.push({
          kind: 'arc',
          start: add(start, mul(firstNormal, input.offsetMm)),
          end: add(end, mul(lastNormal, input.offsetMm)),
          center,
          normal: n,
          radiusMm,
          angleRadians: segment.angleRadians * (b - a),
        });
        if (input.minimumBendRadiusMm !== null && radiusMm + 1e-5 < input.minimumBendRadiusMm) {
          issues.push(
            `The offset shared bend radius is ${radiusMm.toFixed(2)} mm, below the following cable's ${input.minimumBendRadiusMm} mm minimum.`,
          );
        }
      }
    }
    if (segment.kind === 'arc') normal = rotate(normal, unit(segment.normal), segment.angleRadians);
    tangent = routeSegmentTangent(segment, 1);
    walked += length;
  }
  if (!segments.length) return fail('The chosen follow range has no usable length.');
  const sampled = sampleRouteSegments(segments);
  return {
    ...sampled,
    valid: issues.length === 0,
    issues,
    segments,
    startTangent: routeSegmentTangent(segments[0], 0),
    endTangent: routeSegmentTangent(segments[segments.length - 1], 1),
    offsetMm: input.offsetMm,
  };
}

/** Closest distance between two finite 3D line segments, including degenerate ones. */
export function segmentDistanceMm(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number {
  const u = sub(b, a),
    v = sub(d, c),
    w = sub(a, c);
  const aa = dot(u, u),
    bb = dot(u, v),
    cc = dot(v, v),
    dd = dot(u, w),
    ee = dot(v, w);
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  if (aa < EPS * EPS) {
    const t = cc < EPS * EPS ? 0 : clamp(ee / cc);
    return distance(a, add(c, mul(v, t)));
  }
  if (cc < EPS * EPS) return distance(add(a, mul(u, clamp(-dd / aa))), c);
  const denominator = aa * cc - bb * bb;
  let s = denominator > EPS * EPS ? clamp((bb * ee - cc * dd) / denominator) : 0;
  let t = (bb * s + ee) / cc;
  if (t < 0) {
    t = 0;
    s = clamp(-dd / aa);
  } else if (t > 1) {
    t = 1;
    s = clamp((bb - dd) / aa);
  }
  return distance(add(a, mul(u, s)), add(c, mul(v, t)));
}
