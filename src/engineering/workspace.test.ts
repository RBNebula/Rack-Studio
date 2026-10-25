import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createWorkspaceProject, baseCable } from '../examples';
import type { Accessory, Device, Vec3 } from '../model';
import { clone } from '../model';
import { parseProject, serializeProject, validateReferences } from '../data/project';
import { accessoryBoxes, accessoryPose, fixingCenter } from './attachments';
import { origin, pointToLocal, rotate, transformedBox, boxesIntersect } from './space';
import {
  deviceBoxes,
  devicePosition,
  portWorld,
  segmentHitsBox,
  validatePlacement,
} from './geometry';
import { duplicateObject, fixingGuide, transformObject } from './modelling';
import { insertAssembly, rackAssembly } from './assemblies';
import { bundlePacking, resolvedGuidePoints, resolveGuideLinks } from './wiring';
import { analyseCable, scheduleValue } from './analysis';
import { routeCable } from './routing';

const pc = (id = 'pc', rackId?: string): Device => ({
  id,
  definitionId: 'def-user-rack-pc',
  name: id,
  startU: 8,
  face: 'front',
  supportId: null,
  installation: 'installed',
  ...(rackId ? { rackId } : {}),
});
const tray = (id = 'tray'): Accessory => ({
  id,
  name: id,
  kind: 'tray',
  position: [600, 500, 300],
  rotationDeg: [0, 0, 0],
  size: [110, 30, 400],
  perforated: true,
  parentId: null,
  cableIds: [],
  evidence: 'example',
});
function fixture() {
  const p = createWorkspaceProject(false);
  p.devices = [pc()];
  return p;
}
function twoRacks() {
  const p = fixture();
  p.additionalRacks = [
    { ...clone(p.rack), id: 'rack-b', name: 'Rack B', originMm: [650, 100, 40] },
  ];
  p.devices.push(pc('pc-b', 'rack-b'));
  return p;
}
function wire(p: ReturnType<typeof fixture>, id = 'cable', port = 'front-usb-top') {
  const c = baseCable(id);
  c.label = id;
  c.source = { kind: 'device', deviceId: 'pc', portId: port };
  c.destination = {
    kind: 'device',
    deviceId: p.devices[1]?.id ?? 'pc',
    portId: 'front-usb-bottom',
  };
  p.cables.push(c);
  return c;
}
describe('adjacent rack world geometry and reusable assemblies', () => {
  it('offsets ports, chassis and placement bounds independently for each rack', () => {
    const p = twoRacks(),
      a = portWorld(p, { kind: 'device', deviceId: 'pc', portId: 'rear-rj45' })!,
      b = portWorld(p, { kind: 'device', deviceId: 'pc-b', portId: 'rear-rj45' })!;
    expect(b.map((v, i) => v - a[i])).toEqual([650, 100, 40]);
    expect(validatePlacement(p, p.devices[0])).toEqual([]);
    expect(validatePlacement(p, p.devices[1])).toEqual([]);
    expect(deviceBoxes(p, p.devices[1])[0].min[0]).toBeGreaterThan(400);
  });
  it('routes a cable between racks and preserves both endpoint identities after a rack moves', () => {
    const p = twoRacks(),
      c = wire(p),
      before = routeCable(p, c);
    expect(before.valid, before.issues.join()).toBe(true);
    const endpoints = clone([c.source, c.destination]);
    p.additionalRacks![0].originMm![0] += 300;
    const after = routeCable(p, c);
    expect(after.valid, after.issues.join()).toBe(true);
    expect(after.lengthMm).toBeGreaterThan(before.lengthMm + 200);
    expect([c.source, c.destination]).toEqual(endpoints);
  });
  it('rejects missing rack references and a shelf support in a different rack', () => {
    const p = twoRacks();
    p.devices[1].rackId = 'missing';
    expect(validateReferences(p).join()).toContain('missing rack');
    p.devices[1].rackId = 'rack-b';
    p.devices[1].supportId = 'pc';
    expect(validateReferences(p).join()).toContain('same rack');
  });
  it('includes shared members in physical collision checks', () => {
    const p = twoRacks();
    p.sharedMembers = [
      {
        id: 'shared',
        name: 'Shared beam',
        position: devicePosition(p, p.devices[1]),
        size: [20, 20, 20],
        profile: 'box',
        profileAxis: 'y',
        profileRotationQuarterTurns: 0,
        wallMm: null,
        evidence: 'example',
        source: '',
      },
    ];
    expect(validatePlacement(p, p.devices[1]).join()).toContain('shared');
  });
  it('exports an assembly without mutating the source or including cross-rack cables', () => {
    const p = twoRacks();
    wire(p);
    const before = serializeProject(p),
      a = rackAssembly(p, 'rack-b');
    expect(a.devices).toHaveLength(1);
    expect(a.cables).toEqual([]);
    expect(a.rack.originMm).toEqual([0, 0, 0]);
    expect(parseProject(serializeProject(a)).devices[0].rackId).toBeUndefined();
    expect(serializeProject(p)).toBe(before);
  });
  it('duplicates internal wiring with remapped identities and normalized physical guides', () => {
    const p = fixture();
    p.devices.push({ ...pc('pc2'), startU: 12 });
    const c = wire(p);
    p.accessories = [
      {
        ...tray('clip'),
        kind: 'anchor',
        perforated: false,
        openingMm: 40,
        attachment: { kind: 'rack', id: p.rack.id },
        position: [232.55, 450, -10],
      },
    ];
    const guide = fixingGuide(p, p.accessories[0]);
    c.guideLinks = [{ guideId: guide, reverse: false }];
    const a = rackAssembly(p, p.rack.id),
      oldIds = new Set([...p.devices, ...p.cables, ...p.accessories].map((v) => v.id));
    const newRack = insertAssembly(p, a, [650, 0, 0]);
    expect(p.additionalRacks!.find((r) => r.id === newRack)?.originMm).toEqual([650, 0, 0]);
    expect(p.devices.filter((d) => d.rackId === newRack)).toHaveLength(2);
    expect(p.devices.filter((d) => d.rackId === newRack).every((d) => !oldIds.has(d.id))).toBe(
      true,
    );
    expect(new Set(p.cables.map((v) => v.label)).size).toBe(p.cables.length);
    expect(parseProject(serializeProject(p)).cables).toEqual(p.cables);
  });
});
describe('rotated trays and parent-attached physical fixings', () => {
  it('moves a fixing with its shared beam and rejects an unresolved shared parent', () => {
    const p = fixture();
    p.sharedMembers = [
      {
        id: 'shared',
        name: 'Shared beam',
        position: [320, 400, 300],
        size: [20, 30, 600],
        profile: 'box',
        profileAxis: 'z',
        profileRotationQuarterTurns: 0,
        wallMm: null,
        evidence: 'example',
        source: '',
      },
    ];
    const a = {
      ...tray('clip'),
      kind: 'anchor' as const,
      attachment: { kind: 'member' as const, id: 'shared' },
      position: [10, 15, 0] as Vec3,
    };
    p.accessories = [a];
    expect(accessoryPose(p, a).position).toEqual([330, 415, 300]);
    transformObject(p, { kind: 'member', id: 'shared' }, [420, 500, 300], [0, 0, 0]);
    expect(accessoryPose(p, a).position).toEqual([430, 515, 300]);
    expect(validateReferences(p)).toEqual([]);
    a.attachment.id = 'missing';
    expect(validateReferences(p).join()).toContain('missing attachment');
  });
  it('matches Three XYZ rotation and inverse under arbitrary angles', () => {
    const v: Vec3 = [17, -8, 200],
      angles: Vec3 = [35, 71, -23];
    const q = new THREE.Euler(...(angles.map((v) => (v * Math.PI) / 180) as Vec3));
    const result = new THREE.Vector3(...v).applyEuler(q).toArray();
    rotate(v, angles).forEach((n, i) => expect(n).toBeCloseTo(result[i], 10));
    rotate(rotate(v, angles), angles, true).forEach((n, i) => expect(n).toBeCloseTo(v[i], 10));
  });
  it('does not mistake the empty part of a rotated AABB for solid material', () => {
    const b = transformedBox(
      'wall',
      { position: [0, 0, 0], rotationDeg: [0, 0, 45] },
      [0, 0, 0],
      [100, 2, 20],
    );
    expect(segmentHitsBox([-30, 30, -30], [-30, 30, 30], b)).toBe(false);
    expect(segmentHitsBox([30, 30, -30], [30, 30, 30], b)).toBe(true);
    const empty = transformedBox(
      'empty',
      { position: [-30, 30, 0], rotationDeg: [0, 0, 0] },
      [0, 0, 0],
      [2, 2, 2],
    );
    expect(boxesIntersect(b, empty)).toBe(false);
  });
  it.each([
    [0, 0, 0],
    [90, 0, 0],
    [0, 90, 0],
    [35, 20, 45],
  ] as Vec3[])('keeps tray routing inside its rotated usable section (%s)', (...angles) => {
    const p = fixture(),
      a = tray();
    a.rotationDeg = angles as Vec3;
    p.accessories = [a];
    const guide = {
      id: 'tray-guide',
      name: 'Tray',
      kind: 'line' as const,
      trayId: a.id,
      start: [0, 0, 0] as Vec3,
      end: [0, 0, 400] as Vec3,
    };
    p.wiringGuides = [guide];
    const c = wire(p);
    c.guideLinks = [{ guideId: guide.id, reverse: false }];
    const run = resolvedGuidePoints(p, guide, c);
    expect(run.issues).toEqual([]);
    const pose = accessoryPose(p, a);
    for (const point of run.points) {
      const local = pointToLocal(pose, point);
      expect(Math.abs(local[0])).toBeLessThan(50);
      expect(local[1]).toBeGreaterThan(-15 + 2.5 + c.diameterMm / 2 + c.clearanceMm);
    }
    for (const b of accessoryBoxes(p, a))
      expect(
        segmentHitsBox(run.points[0], run.points[1], b, c.diameterMm / 2 + c.clearanceMm),
      ).toBe(false);
  });
  it('moves a device-mounted clip and its guide with chassis service extension', () => {
    const p = fixture();
    p.devices[0].rails = {
      memberLengthMm: 520,
      profileWidthMm: 8,
      profileHeightMm: 28,
      chassisLeadMm: 100,
      extensionMm: 0,
      evidence: 'example',
    };
    const clip: Accessory = {
      ...tray('clip'),
      kind: 'anchor',
      perforated: false,
      openingMm: 30,
      attachment: { kind: 'device', id: 'pc' },
      position: [80, 20, -4],
    };
    p.accessories = [clip];
    const id = fixingGuide(p, clip),
      before = fixingCenter(p, clip);
    p.devices[0].rails!.extensionMm = 600;
    const after = resolvedGuidePoints(
      p,
      p.wiringGuides!.find((g) => g.id === id)!,
    ).points[0];
    expect(after[2] - before[2]).toBe(-600);
    expect(after[0]).toBe(before[0]);
  });
  it('preserves world pose when editing a fixing under a rotated tray', () => {
    const p = fixture(),
      parent = tray();
    parent.rotationDeg = [40, 30, 20];
    const child: Accessory = {
      ...tray('clip'),
      kind: 'anchor',
      perforated: false,
      attachment: { kind: 'accessory', id: parent.id },
      position: [0, 0, 100],
      rotationDeg: [0, 10, 0],
    };
    p.accessories = [parent, child];
    const target: Vec3 = [800, 600, 250],
      angles: Vec3 = [12, 34, 56];
    transformObject(p, { kind: 'accessory', id: child.id }, target, angles);
    const pose = accessoryPose(p, child);
    pose.position.forEach((v, i) => expect(v).toBeCloseTo(target[i], 9));
    const v: Vec3 = [1, 2, 3];
    rotate(v, pose.rotationDeg).forEach((n, i) => expect(n).toBeCloseTo(rotate(v, angles)[i], 9));
  });
  it('rejects missing/circular attachment parents without discarding the graph', () => {
    const p = fixture();
    p.accessories = [
      { ...tray('a'), attachment: { kind: 'accessory', id: 'b' } },
      { ...tray('b'), attachment: { kind: 'accessory', id: 'a' } },
    ];
    expect(() => parseProject(serializeProject(p))).toThrow('circular attachment');
  });
  it('keeps the fixing opening clear while routing solids retain all four walls', () => {
    const p = fixture(),
      a = { ...tray('clip'), kind: 'anchor' as const, perforated: false, openingMm: 30 };
    p.accessories = [a];
    const center = fixingCenter(p, a);
    expect(accessoryBoxes(p, a)).toHaveLength(4);
    for (const box of accessoryBoxes(p, a))
      expect(
        segmentHitsBox(
          [center[0], center[1], center[2] - 50],
          [center[0], center[1], center[2] + 50],
          box,
          6,
        ),
      ).toBe(false);
  });
  it('packs members separately, reports insufficient opening and retains independent records', () => {
    const p = fixture();
    p.devices.push({ ...pc('pc2'), startU: 12 });
    const a = { ...tray('clip'), kind: 'anchor' as const, perforated: false, openingMm: 40 };
    p.accessories = [a];
    const guide = fixingGuide(p, a),
      c = wire(p, '0'),
      c2 = wire(p, '1', 'front-usb-bottom');
    c2.destination = { kind: 'device', deviceId: 'pc2', portId: 'front-usb-top' };
    p.looms = [
      {
        id: 'bundle',
        name: 'Bundle',
        cableIds: [c.id, c2.id],
        guideIds: [guide],
        waypoints: [],
        packingFactor: 1,
      },
    ];
    const one = resolveGuideLinks(p, c),
      two = resolveGuideLinks(p, c2);
    expect(one.points).not.toEqual(two.points);
    expect(one.issues).toEqual([]);
    expect(p.cables).toHaveLength(2);
    expect(bundlePacking(p, [c.id, c2.id]).diameterMm).toBeGreaterThan(12);
    a.openingMm = 10;
    expect(resolveGuideLinks(p, c).issues.join()).toContain('exceeds');
  });
  it('duplicates trays with fresh identity without moving existing connected records', () => {
    const p = fixture();
    p.accessories = [tray()];
    const before = serializeProject(p),
      copy = duplicateObject(p, { kind: 'accessory', id: 'tray' });
    expect(copy.id).not.toBe('tray');
    expect(p.accessories[0].position).toEqual([600, 500, 300]);
    expect(origin(p.rack)).toEqual([0, 0, 0]);
    expect(before).not.toBe(serializeProject(p));
  });
});
describe('vehicle endpoint routes and length accounting', () => {
  function external() {
    const p = fixture(),
      c = wire(p);
    p.destinations = [
      {
        id: 'vehicle',
        name: 'Vehicle endpoint',
        location: 'Vehicle',
        notes: '',
        position: [1000, 330, -100],
        routeIn3D: true,
        ports: [
          {
            id: 'usb',
            name: 'USB',
            connector: 'USB-A',
            surface: 'custom',
            position: [0, 0, 0],
            direction: [0, 0, -1],
            multiple: false,
          },
        ],
      },
    ];
    p.exits = [
      {
        id: 'exit',
        name: 'Exit',
        position: [500, 330, -100],
        size: [50, 50],
        direction: [1, 0, 0],
        evidence: 'example',
      },
    ];
    c.destination = { kind: 'external', destinationId: 'vehicle', portId: 'usb' };
    c.exitId = 'exit';
    c.externalLengthMm = 500000;
    return { p, c };
  }
  it('includes the vehicle path once, passes the exit and ignores stored manual external distance', () => {
    const { p, c } = external(),
      a = analyseCable(p, c);
    expect(a.route.valid, a.route.issues.join()).toBe(true);
    expect(a.route.points.at(-1)).toEqual([1000, 330, -100]);
    expect(a.route.points).toContainEqual([500, 330, -100]);
    expect(a.requiredMm).toBeCloseTo(a.route.lengthMm, 8);
    expect(a.requiredMm).toBeLessThan(3000);
    expect(scheduleValue(p, a, 'external')).toBe(0);
  });
  it('updates required length when the positioned endpoint moves', () => {
    const { p, c } = external(),
      before = analyseCable(p, c);
    transformObject(p, { kind: 'destination', id: 'vehicle' }, [1400, 330, -100], [0, 0, 0]);
    const after = analyseCable(p, c);
    expect(after.route.valid, after.route.issues.join()).toBe(true);
    expect(after.requiredMm!).toBeGreaterThan(before.requiredMm! + 300);
    expect(c.externalLengthMm).toBe(500000);
  });
  it('retains logical destination behaviour when positioned routing is disabled', () => {
    const { p, c } = external();
    p.destinations[0].routeIn3D = false;
    const a = analyseCable(p, c);
    expect(a.route.points.at(-1)).toEqual(p.exits[0].position);
    expect(a.requiredMm!).toBeGreaterThan(500000);
  });
  it('round-trips racks, rotated/attached hardware, measurements and positioned destinations', () => {
    const { p, c } = external();
    p.additionalRacks = [{ ...clone(p.rack), id: 'second', originMm: [650, 0, 0] }];
    p.accessories = [
      { ...tray(), rotationDeg: [90, 0, 0], attachment: { kind: 'rack', id: 'second' } },
    ];
    p.measurements = [
      { id: 'measurement', name: 'Clearance', start: [0, 0, 0], end: [10, 20, 30] },
    ];
    expect(parseProject(serializeProject(p))).toEqual(p);
    expect(c.exitId).toBe('exit');
  });
});
