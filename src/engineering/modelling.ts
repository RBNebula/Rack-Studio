import { uid, clone } from '../model';
import type { Project, Vec3, Accessory } from '../model';
import type { Selection } from '../state';
import { accessoryPose, targetPose } from './attachments';
import { devicePosition, U_MM } from './geometry';
import { origin, pointToLocal, racks, relativeRotation, rotate, sub, add } from './space';
import { resolvedGuidePoints } from './wiring';

export const objectKey = (s: NonNullable<Selection>) => `${s.kind}:${s.id}`;
export function objectPose(p: Project, s: Selection) {
  if (!s) return null;
  const zero: Vec3 = [0, 0, 0];
  if (s.kind === 'accessory') {
    const a = p.accessories.find((v) => v.id === s.id);
    return a ? accessoryPose(p, a) : null;
  }
  if (s.kind === 'rack') {
    const r = racks(p).find((v) => v.id === s.id);
    return r ? { position: origin(r), rotationDeg: zero } : null;
  }
  if (s.kind === 'destination') {
    const d = p.destinations.find((v) => v.id === s.id);
    return d?.position ? { position: d.position, rotationDeg: zero } : null;
  }
  if (s.kind === 'exit') {
    const e = p.exits.find((v) => v.id === s.id);
    return e ? { position: e.position, rotationDeg: zero } : null;
  }
  if (s.kind === 'member') {
    const m = p.sharedMembers?.find((v) => v.id === s.id);
    return m ? { position: m.position, rotationDeg: zero } : null;
  }
  if (s.kind === 'device') {
    const d = p.devices.find((v) => v.id === s.id);
    return d ? { position: devicePosition(p, d), rotationDeg: zero } : null;
  }
  if (s.kind === 'guide') {
    const g = p.wiringGuides?.find((v) => v.id === s.id);
    if (!g) return null;
    const { points } = resolvedGuidePoints(p, g);
    return {
      position:
        points.length === 1 ? points[0] : (points[0].map((v, i) => (v + points[1][i]) / 2) as Vec3),
      rotationDeg: zero,
    };
  }
  return null;
}
export function transformObject(
  p: Project,
  s: NonNullable<Selection>,
  position: Vec3,
  rotationDeg: Vec3,
) {
  const before = objectPose(p, s);
  if (!before) throw new Error('The selected object has no spatial position.');
  if (s.kind === 'accessory') {
    const a = p.accessories.find((v) => v.id === s.id)!;
    const parent = a.attachment ? targetPose(p, a.attachment) : null;
    a.position = parent ? pointToLocal(parent, position) : position;
    a.rotationDeg = parent ? relativeRotation(parent.rotationDeg, rotationDeg) : rotationDeg;
  }
  if (s.kind === 'rack') racks(p).find((v) => v.id === s.id)!.originMm = position;
  if (s.kind === 'destination') p.destinations.find((v) => v.id === s.id)!.position = position;
  if (s.kind === 'exit') p.exits.find((v) => v.id === s.id)!.position = position;
  if (s.kind === 'member') p.sharedMembers!.find((v) => v.id === s.id)!.position = position;
  if (s.kind === 'device') {
    const d = p.devices.find((v) => v.id === s.id)!;
    const delta = Math.round((position[1] - before.position[1]) / U_MM);
    d.startU += delta;
    for (const c of p.devices) if (c.supportId === d.id) c.startU += delta;
  }
  if (s.kind === 'guide') {
    const g = p.wiringGuides!.find((v) => v.id === s.id)!;
    if ((g.kind === 'point' && g.accessoryId) || (g.kind === 'line' && g.trayId))
      throw new Error('Move the physical fixing or tray to move its attached guide.');
    if (g.kind === 'point') g.position = position;
    else {
      g.start = add(position, rotate(sub(g.start, before.position), rotationDeg));
      g.end = add(position, rotate(sub(g.end, before.position), rotationDeg));
    }
  }
}
export function duplicateObject(p: Project, s: NonNullable<Selection>): NonNullable<Selection> {
  if (s.kind === 'accessory') {
    const a = clone(p.accessories.find((v) => v.id === s.id)!);
    a.id = uid(a.kind);
    a.name += ' copy';
    const pose = accessoryPose(p, a);
    a.attachment = undefined;
    a.parentId = null;
    a.cableIds = [];
    a.position = add(pose.position, [50, 0, 0]);
    a.rotationDeg = pose.rotationDeg;
    p.accessories.push(a);
    if (a.kind === 'anchor' || a.kind === 'tie') fixingGuide(p, a);
    return { kind: 'accessory', id: a.id };
  }
  if (s.kind === 'guide') {
    const g = clone(p.wiringGuides!.find((v) => v.id === s.id)!);
    const pts = resolvedGuidePoints(p, g).points;
    g.id = uid('guide');
    g.name += ' copy';
    if (g.kind === 'point') {
      g.accessoryId = undefined;
      g.position = add(pts[0], [50, 0, 0]);
    } else {
      g.trayId = undefined;
      g.start = add(pts[0], [50, 0, 0]);
      g.end = add(pts[1], [50, 0, 0]);
    }
    p.wiringGuides!.push(g);
    return { kind: 'guide', id: g.id };
  }
  if (s.kind === 'destination') {
    const d = clone(p.destinations.find((v) => v.id === s.id)!);
    d.id = uid('destination');
    d.name += ' copy';
    if (d.position) d.position = add(d.position, [100, 0, 0]);
    p.destinations.push(d);
    return { kind: 'destination', id: d.id };
  }
  if (s.kind === 'exit') {
    const e = clone(p.exits.find((v) => v.id === s.id)!);
    e.id = uid('exit');
    e.name += ' copy';
    e.position = add(e.position, [50, 0, 0]);
    p.exits.push(e);
    return { kind: 'exit', id: e.id };
  }
  if (s.kind === 'member') {
    const m = clone(p.sharedMembers!.find((v) => v.id === s.id)!);
    m.id = uid('shared');
    m.name += ' copy';
    m.position = add(m.position, [50, 0, 0]);
    p.sharedMembers!.push(m);
    return { kind: 'member', id: m.id };
  }
  if (s.kind === 'device') {
    const d = clone(p.devices.find((v) => v.id === s.id)!);
    d.id = uid('device');
    d.name += ' copy';
    d.startU += p.definitions.find((v) => v.id === d.definitionId)!.heightU;
    p.devices.push(d);
    return { kind: 'device', id: d.id };
  }
  throw new Error('Choose a tray, fixing, guide, device, beam or endpoint to duplicate.');
}
export function fixingGuide(p: Project, a: Accessory) {
  const id = uid('guide');
  (p.wiringGuides ??= []).push({
    id,
    name: a.name,
    kind: 'point',
    position: accessoryPose(p, a).position,
    accessoryId: a.id,
  });
  return id;
}
