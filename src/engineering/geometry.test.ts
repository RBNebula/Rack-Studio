import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../examples';
import type { Device, Project } from '../model';
import {
  allObstacles,
  deviceBounds,
  deviceBoxes,
  deviceChassisBoxes,
  devicePosition,
  mountingHoleY,
  mmToScene,
  portDirectionWorld,
  portWorld,
  rackSpecificationIssues,
  rearRailAt,
  sceneToMm,
  segmentHitsBox,
  U_MM,
  uBottom,
  validatePlacement,
  validateRack,
} from './geometry';

function fixture(): Project {
  const project = createExampleProject(false);
  project.rack.holeType = 'square';
  project.rack.depthMeaning = 'external';
  project.rack.fixedFace = 'front';
  return project;
}
const placed = (
  id: string,
  definitionId: string,
  startU = 1,
  face: Device['face'] = 'front',
): Device => ({
  id,
  name: id,
  definitionId,
  startU,
  face,
  supportId: null,
  installation: 'installed',
});

describe('millimetre rack geometry', () => {
  it('uses exact 44.45 mm U boundaries and the three universal mounting hole offsets', () => {
    expect(U_MM).toBe(44.45);
    expect(uBottom(1)).toBe(0);
    expect(uBottom(3)).toBe(88.9);
    expect([0, 1, 2].map((i) => mountingHoleY(1, i))).toEqual([6.35, 22.225, 38.1]);
    expect(mountingHoleY(2, 0) - mountingHoleY(1, 2)).toBeCloseTo(12.7, 9);
    expect(() => mountingHoleY(1, 3)).toThrow(RangeError);
    expect(sceneToMm(mmToScene([600, 44.45, -50]))).toEqual([600, 44.45, -50]);
    expect(sceneToMm(mmToScene(123.5))).toBe(123.5);
  });

  it('rejects section gaps, overlaps, missing coverage and rear rails outside the actual exterior', () => {
    const rack = fixture().rack;
    expect(validateRack(rack)).toEqual([]);
    expect(rearRailAt(rack, 16)).toBe(650);
    rack.sections[1].startU = 17;
    expect(validateRack(rack).join(' ')).toContain('cover every U exactly once');
    expect(Number.isNaN(rearRailAt(rack, 16))).toBe(true);
    rack.sections[1].startU = 15;
    expect(Number.isNaN(rearRailAt(rack, 15))).toBe(true);
    rack.sections[1].startU = 16;
    rack.sections[1].rearRailZMm = 740;
    expect(validateRack(rack).join(' ')).toContain('inside the rear frame');
    rack.sections[1].rearRailZMm = 650;
    rack.fixedFace = 'rear';
    expect(validateRack(rack).join(' ')).toContain('fixed rear mounting face');
  });

  it('centres the chassis inside allocated U and mirrors rear mounting in x and z', () => {
    const project = fixture(),
      device = placed('switch', 'def-switch', 2);
    project.devices = [device];
    devicePosition(project, device).forEach((v, i) =>
      expect(v).toBeCloseTo([0, 66.675, 140][i], 9),
    );
    deviceChassisBoxes(project, device)[0].min.forEach((v, i) =>
      expect(v).toBeCloseTo([-215, 45.2, 0][i], 9),
    );
    deviceBounds(project, device).min.forEach((v, i) =>
      expect(v).toBeCloseTo([-241.3, 45.2, -2][i], 9),
    );
    const endpoint = { kind: 'device' as const, deviceId: device.id, portId: 'uplink' };
    portWorld(project, endpoint)!.forEach((v, i) => expect(v).toBeCloseTo([150, 66.2, 282][i], 9));
    device.face = 'rear';
    devicePosition(project, device).forEach((v, i) =>
      expect(v).toBeCloseTo([0, 66.675, 560][i], 9),
    );
    portWorld(project, endpoint)!.forEach((v, i) => expect(v).toBeCloseTo([-150, 66.2, 418][i], 9));
    portDirectionWorld(project, endpoint)!.forEach((v, i) =>
      expect(v).toBeCloseTo([0, 0, -1][i], 9),
    );
  });

  it('keeps either mounting-ear plane fixed when a rail-mounted chassis depth changes', () => {
    const project = fixture(),
      device = placed('server', 'def-server', 5);
    const definition = project.definitions.find((d) => d.id === device.definitionId)!;
    const originalY = devicePosition(project, device)[1];
    const body = () => deviceChassisBoxes(project, device)[0];
    expect(body().min[2]).toBe(0);
    expect(body().max[2]).toBe(620);
    definition.depthMm = 670;
    expect(body().min[2]).toBe(0);
    expect(body().max[2]).toBe(670);
    expect(devicePosition(project, device)).toEqual([0, originalY, 335]);
    device.face = 'rear';
    expect(body().min[2]).toBe(30);
    expect(body().max[2]).toBe(700);
    devicePosition(project, device).forEach((v, i) =>
      expect(v).toBeCloseTo([0, originalY, 365][i], 9),
    );
    definition.depthMm = 620;
    expect(body().min[2]).toBe(80);
    expect(body().max[2]).toBe(700);
    devicePosition(project, device).forEach((v, i) =>
      expect(v).toBeCloseTo([0, originalY, 390][i], 9),
    );
  });

  it('allows a chassis beyond rear rails while checking the separate configured exterior envelope', () => {
    const project = fixture(),
      device = placed('server', 'def-server', 5);
    project.devices = [device];
    project.rack.depthMeaning = 'rail-spacing';
    project.definitions.find((d) => d.id === device.definitionId)!.depthMm = 720;
    expect(deviceBounds(project, device).max[2]).toBeGreaterThan(
      rearRailAt(project.rack, device.startU),
    );
    expect(validatePlacement(project, device)).toEqual([]);
    expect(rackSpecificationIssues(project.rack).join(' ')).toContain('clearance beyond the rails');
    project.rack.sections[0].overallDepthMm = 770;
    expect(validatePlacement(project, device).join(' ')).toContain('usable envelope');
    project.rack.sections[0].overallDepthMm = 760;
    expect(validateRack(project.rack).join(' ')).toContain(
      'Adjust the illustrative exterior frame separately',
    );
  });

  it('keeps evidence notes distinct from rack dimensional consistency', () => {
    const rack = fixture().rack;
    rack.depthMeaning = 'rail-spacing';
    rack.evidence = 'example';
    expect(validateRack(rack)).toEqual([]);
    expect(rackSpecificationIssues(rack).join(' ')).toContain('unverified');
    rack.depthMeaning = 'external';
    rack.evidence = 'verified';
    expect(rackSpecificationIssues(rack)).toEqual([]);
  });

  it('uses parts-only solids for an open brush plate without filling the cable opening', () => {
    const project = fixture(),
      brush = placed('brush', 'def-patch', 5);
    const definition = project.definitions.find((d) => d.id === brush.definitionId)!;
    definition.bodyMode = 'parts';
    definition.depthMm = 2;
    definition.parts = [
      { id: 'top', name: 'Example top edge', position: [0, 39.95, 1], size: [430, 6, 2] },
      { id: 'bottom', name: 'Example bottom edge', position: [0, 3, 1], size: [430, 6, 2] },
      {
        id: 'left',
        name: 'Example left edge',
        position: [-210, 21.475, 1],
        size: [10, 30.95, 2],
      },
      {
        id: 'right',
        name: 'Example right edge',
        position: [210, 21.475, 1],
        size: [10, 30.95, 2],
      },
    ];
    project.devices = [brush];
    const boxes = deviceBoxes(project, brush),
      y = uBottom(5) + 0.75 + 21.475;
    expect(deviceChassisBoxes(project, brush)).toHaveLength(4);
    expect(boxes).toHaveLength(6);
    expect(boxes.some((b) => b.id.endsWith(':body'))).toBe(false);
    expect(boxes.some((b) => segmentHitsBox([0, y, -20], [0, y, 20], b, 3))).toBe(false);
    expect(validatePlacement(project, brush)).toEqual([]);
    definition.parts.push({
      id: 'bad-plate',
      name: 'Thin plate penetrating mounting rail',
      position: [project.rack.railCentersMm / 2, 20, 1],
      size: [10, 10, 2],
    });
    expect(validatePlacement(project, brush).join(' ')).toContain('collision');
    definition.parts = [];
    expect(validatePlacement(project, brush).join(' ')).toContain(
      'physical collision envelope is undefined',
    );
  });

  it('places a freestanding chassis on the real shelf floor and preserves shelf voids', () => {
    const project = fixture(),
      shelf = placed('shelf', 'def-shelf', 3),
      computer = placed('pc', 'def-pc', 3);
    computer.supportId = shelf.id;
    project.devices = [shelf, computer];
    expect(deviceChassisBoxes(project, shelf)).toHaveLength(3);
    expect(deviceBoxes(project, shelf)).toHaveLength(5);
    expect(deviceBoxes(project, computer).find((b) => b.id.endsWith(':body'))?.min[1]).toBeCloseTo(
      uBottom(3) + 4,
    );
    expect(
      validatePlacement(project, computer).some((i) => i.includes('collision with shelf')),
    ).toBe(false);
    computer.supportId = null;
    expect(validatePlacement(project, computer).join(' ')).toContain('requires a shelf support');
  });

  it('tests physical front/rear bodies rather than forbidding disjoint devices at the same U', () => {
    const project = fixture(),
      front = placed('front', 'def-switch'),
      rear = placed('rear', 'def-switch', 1, 'rear');
    project.devices = [front, rear];
    expect(validatePlacement(project, rear)).toEqual([]);
    const switchDefinition = project.definitions.find((d) => d.id === 'def-switch')!;
    switchDefinition.depthMm = 400;
    expect(validatePlacement(project, rear).join(' ')).toContain('Physical collision with front');
  });

  it('checks every depth section touched by a tall device, including rail adjustment limits', () => {
    const project = fixture(),
      server = placed('server', 'def-server', 15);
    project.devices = [server];
    project.rack.sections[1].overallDepthMm = 650;
    expect(validatePlacement(project, server).join(' ')).toContain('depth section upper');
    project.rack.sections[1].overallDepthMm = 750;
    project.definitions.find((d) => d.id === 'def-server')!.railMinMm = 675;
    expect(validatePlacement(project, server).join(' ')).toContain('Rail spacing in upper');
    server.face = 'rear';
    expect(validatePlacement(project, server).join(' ')).toContain('change in rear mounting plane');
  });

  it('requires explicit rail ranges and compatible mounting offsets', () => {
    const project = fixture(),
      server = placed('server', 'def-server', 5);
    project.devices = [server];
    project.definitions.find((d) => d.id === 'def-server')!.railMaxMm = null;
    expect(validatePlacement(project, server).join(' ')).toContain(
      'explicit compatible minimum and maximum',
    );
    const patch = placed('patch', 'def-patch', 1);
    project.devices = [patch];
    project.definitions.find((d) => d.id === 'def-patch')!.screwOffsetsMm = [10];
    expect(validatePlacement(project, patch).join(' ')).toContain('does not align');
  });

  it('includes extra physical parts, explicit members and solid tray walls without filling tray air', () => {
    const project = fixture();
    project.rack.members = [
      {
        id: 'strut',
        name: 'Strut',
        position: [0, 100, 200],
        size: [100, 10, 10],
        profile: 'box',
        profileAxis: 'y',
        profileRotationQuarterTurns: 0,
        wallMm: null,
        evidence: 'example',
        source: 'Synthetic obstruction fixture.',
      },
    ];
    project.accessories = [
      {
        id: 'tray',
        name: 'Tray',
        position: [1000, 100, 200],
        size: [100, 60, 200],
        kind: 'tray',
        parentId: null,
        cableIds: [],
        evidence: 'example',
      },
    ];
    const boxes = allObstacles(project);
    expect(boxes.some((b) => b.id === 'rack:member:strut')).toBe(true);
    const tray = boxes.filter((b) => b.id.startsWith('accessory:tray:'));
    expect(tray).toHaveLength(3);
    expect(tray.some((b) => segmentHitsBox([1000, 100, 0], [1000, 100, 400], b, 5))).toBe(false);
    expect(tray.some((b) => segmentHitsBox([1000, 50, 200], [1000, 100, 200], b, 5))).toBe(true);
  });

  it('includes cable radius and clearance in slab intersection, including grazing and zero length segments', () => {
    const box = {
      id: 'box',
      min: [0, 0, 0] as [number, number, number],
      max: [10, 10, 10] as [number, number, number],
    };
    expect(segmentHitsBox([-5, 12, 5], [15, 12, 5], box, 1)).toBe(false);
    expect(segmentHitsBox([-5, 12, 5], [15, 12, 5], box, 2)).toBe(true);
    expect(segmentHitsBox([5, 5, 5], [5, 5, 5], box)).toBe(true);
    expect(segmentHitsBox([-5, -5, -5], [-5, -5, -5], box)).toBe(false);
  });
});
