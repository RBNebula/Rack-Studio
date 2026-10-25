import type { Device, Project, Rack, Vec3 } from '../model';
export const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3;
export const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3;
export const origin = (rack: Rack): Vec3 => rack.originMm ?? [0, 0, 0];
export const racks = (p: Project): Rack[] => [p.rack, ...(p.additionalRacks ?? [])];
export const rackById = (p: Project, id?: string): Rack =>
  racks(p).find((r) => r.id === (id ?? p.rack.id)) ?? p.rack;
export const deviceRack = (p: Project, d: Device): Rack => rackById(p, d.rackId);
/** XYZ Euler degrees, matching Three's default XYZ composition. */
export function rotate(v: Vec3, degrees: Vec3 = [0, 0, 0], inverse = false): Vec3 {
  const a = degrees.map((n) => (n * Math.PI) / 180),
    result: Vec3 = [...v];
  for (const axis of inverse ? [0, 1, 2] : [2, 1, 0]) {
    const c = Math.cos(a[axis]),
      s = Math.sin(a[axis]) * (inverse ? -1 : 1);
    const i = (axis + 1) % 3,
      j = (axis + 2) % 3,
      x = result[i],
      y = result[j];
    result[i] = c * x - s * y;
    result[j] = s * x + c * y;
  }
  return result;
}
export interface Pose {
  position: Vec3;
  rotationDeg: Vec3;
}
function euler(basis: Vec3[]): Vec3 {
  const m13 = basis[2][0],
    y = Math.asin(Math.max(-1, Math.min(1, m13)));
  const x =
    Math.abs(m13) < 0.9999999
      ? Math.atan2(-basis[2][1], basis[2][2])
      : Math.atan2(basis[1][2], basis[1][1]);
  const z = Math.abs(m13) < 0.9999999 ? Math.atan2(-basis[1][0], basis[0][0]) : 0;
  return [x, y, z].map((v) => (v * 180) / Math.PI) as Vec3;
}
export function composeRotation(parent: Vec3, local: Vec3): Vec3 {
  return euler(
    (
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ] as Vec3[]
    ).map((v) => rotate(rotate(v, local), parent)),
  );
}
export function relativeRotation(parent: Vec3, world: Vec3): Vec3 {
  return euler(
    (
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ] as Vec3[]
    ).map((v) => rotate(rotate(v, world), parent, true)),
  );
}
export const pointAtPose = (pose: Pose, local: Vec3) =>
  add(pose.position, rotate(local, pose.rotationDeg));
export const pointToLocal = (pose: Pose, world: Vec3) =>
  rotate(sub(world, pose.position), pose.rotationDeg, true);
export function transformedBox(id: string, pose: Pose, localCenter: Vec3, size: Vec3) {
  const points: Vec3[] = [];
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        points.push(
          pointAtPose(
            pose,
            add(localCenter, [(x * size[0]) / 2, (y * size[1]) / 2, (z * size[2]) / 2]),
          ),
        );
  return {
    id,
    oriented: { position: pointAtPose(pose, localCenter), rotationDeg: pose.rotationDeg, size },
    min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))) as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))) as Vec3,
  };
}
export interface SpatialBox {
  min: Vec3;
  max: Vec3;
  oriented?: Pose & { size: Vec3 };
}
/** Separating-axis test for the actual rotated wall boxes, including cross axes. */
export function boxesIntersect(a: SpatialBox, b: SpatialBox): boolean {
  if (!a.oriented && !b.oriented)
    return a.min.every((v, i) => v < b.max[i] - 1e-6 && a.max[i] > b.min[i] + 1e-6);
  const data = (box: SpatialBox) => ({
    center: box.oriented?.position ?? (box.min.map((v, i) => (v + box.max[i]) / 2) as Vec3),
    half: box.oriented?.size.map((v) => v / 2) ?? box.min.map((v, i) => (box.max[i] - v) / 2),
    axes: (
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ] as Vec3[]
    ).map((v) => rotate(v, box.oriented?.rotationDeg)),
  });
  const x = data(a),
    y = data(b),
    delta = sub(y.center, x.center);
  const dot = (v: Vec3, w: Vec3) => v.reduce((n, c, i) => n + c * w[i], 0),
    cross = (v: Vec3, w: Vec3): Vec3 => [
      v[1] * w[2] - v[2] * w[1],
      v[2] * w[0] - v[0] * w[2],
      v[0] * w[1] - v[1] * w[0],
    ];
  for (const axis of [
    ...x.axes,
    ...y.axes,
    ...x.axes.flatMap((v) => y.axes.map((w) => cross(v, w))),
  ]) {
    const length = Math.hypot(...axis);
    if (length < 1e-8) continue;
    const n = axis.map((v) => v / length) as Vec3;
    const extent =
      x.axes.reduce((sum, v, i) => sum + x.half[i] * Math.abs(dot(v, n)), 0) +
      y.axes.reduce((sum, v, i) => sum + y.half[i] * Math.abs(dot(v, n)), 0);
    if (Math.abs(dot(delta, n)) >= extent - 1e-6) return false;
  }
  return true;
}
