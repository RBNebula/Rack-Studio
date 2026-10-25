import type { Accessory, Project, Vec3 } from '../model';
import { devicePosition, mountingPlane } from './geometry';
import { deviceRack, origin, pointAtPose, racks, rotate, transformedBox } from './space';
import type { Pose } from './space';

export function targetPose(
  p: Project,
  target: NonNullable<Accessory['attachment']>,
  seen = new Set<string>(),
): Pose {
  if (target.kind === 'member') {
    const m = p.sharedMembers?.find((m) => m.id === target.id);
    if (!m) throw new Error('Missing shared member attachment.');
    return { position: m.position, rotationDeg: [0, 0, 0] };
  }
  if (target.kind === 'rack')
    return {
      position: origin(racks(p).find((r) => r.id === target.id) ?? p.rack),
      rotationDeg: [0, 0, 0],
    };
  if (target.kind === 'device') {
    const d = p.devices.find((d) => d.id === target.id);
    if (!d) throw new Error('Missing attachment device.');
    const def = p.definitions.find((v) => v.id === d.definitionId)!;
    return {
      position: [
        origin(deviceRack(p, d))[0],
        devicePosition(p, d)[1] - def.heightMm / 2,
        mountingPlane(p, d),
      ],
      rotationDeg: [0, d.face === 'rear' ? 180 : 0, 0],
    };
  }
  const a = p.accessories.find((a) => a.id === target.id);
  if (!a || seen.has(a.id)) throw new Error('Missing or circular accessory attachment.');
  return accessoryPose(p, a, new Set(seen).add(a.id));
}
export function accessoryPose(p: Project, a: Accessory, seen = new Set<string>()): Pose {
  const rotation: Vec3 = a.rotationDeg ?? [0, 0, 0];
  if (!a.attachment) return { position: a.position, rotationDeg: rotation };
  const parent = targetPose(p, a.attachment, seen);
  // Full Euler composition is converted through a matrix, including non-axis-aligned parents.
  const basis = (
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as Vec3[]
  ).map((v) => rotate(rotate(v, rotation), parent.rotationDeg));
  const m13 = basis[2][0],
    y = Math.asin(Math.max(-1, Math.min(1, m13)));
  const x =
    Math.abs(m13) < 0.9999999
      ? Math.atan2(-basis[2][1], basis[2][2])
      : Math.atan2(basis[1][2], basis[1][1]);
  const z = Math.abs(m13) < 0.9999999 ? Math.atan2(-basis[1][0], basis[0][0]) : 0;
  return {
    position: pointAtPose(parent, a.position),
    rotationDeg: [x, y, z].map((v) => (v * 180) / Math.PI) as Vec3,
  };
}
export function accessoryBoxes(p: Project, a: Accessory) {
  const pose = accessoryPose(p, a),
    [w, h, d] = a.size;
  const box = (name: string, at: Vec3, size: Vec3) =>
    transformedBox(`accessory:${a.id}:${name}`, pose, at, size);
  if (a.kind === 'tray') {
    const t = Math.min(a.perforated ? 2.5 : 2, w / 4, h / 4, d / 4);
    return [
      box('floor', [0, -h / 2 + t / 2, 0], [w, t, d]),
      ...[-1, 1].map((s) => box(`wall:${s}`, [(s * (w - t)) / 2, t / 2, 0], [t, h - t, d])),
    ];
  }
  if (a.kind === 'anchor' || a.kind === 'tie') {
    const opening = a.openingMm ?? 20,
      t = 2;
    return [
      box('base', [0, t / 2, 0], [opening + 2 * t, t, 12]),
      box('top', [0, opening + 1.5 * t, 0], [opening + 2 * t, t, 4]),
      ...[-1, 1].map((s) =>
        box(`side:${s}`, [(s * (opening + t)) / 2, opening / 2 + t, 0], [t, opening, 4]),
      ),
    ];
  }
  return [transformedBox(`accessory:${a.id}`, pose, [0, 0, 0], a.size)];
}
export const fixingCenter = (p: Project, a: Accessory) =>
  pointAtPose(accessoryPose(p, a), [0, (a.openingMm ?? 20) / 2 + 2, 0]);
