import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../testing/legacy-example';
import { clone, definitionSchema, projectSchema, type Device, type Project } from '../model';
import {
  allObstacles,
  deviceBounds,
  deviceBoxes,
  deviceChassisBoxes,
  deviceEarBoxes,
  effectiveEarThicknessMm,
  hasRackEars,
  mountingPlane,
  portDirectionWorld,
  portWorld,
  segmentHitsBox,
  validatePlacement,
} from './geometry';

function fixture(): Project {
  const project = createExampleProject(false);
  project.devices = [];
  project.cables = [];
  project.rack.frameMm = 40;
  project.rack.railWidthMm = null;
  project.rack.railThicknessMm = null;
  project.rack.sections = [
    {
      id: 'flat',
      startU: 1,
      endU: project.rack.heightU,
      overallDepthMm: 850,
      frontRailZMm: 0,
      rearRailZMm: 400,
    },
  ];
  return project;
}

function installed(definitionId: string, face: Device['face'] = 'front'): Device {
  return {
    id: 'mounted',
    name: 'Mounted example',
    definitionId,
    startU: 3,
    face,
    supportId: null,
    installation: 'installed',
  };
}

describe('rack screw contact planes and physical ears', () => {
  it('puts a 400 mm screw spacing between the exposed rail faces, independent of rail thickness', () => {
    const project = fixture();
    const rails = allObstacles(project).filter((box) => box.id.endsWith(':rail'));
    expect(rails).toHaveLength(4);
    for (const rail of rails) {
      expect([rail.min[2], rail.max[2]]).toEqual(
        rail.id.endsWith(':front:rail') ? [0, 20] : [380, 400],
      );
    }
    project.rack.frameMm = 32;
    for (const rail of allObstacles(project).filter((box) => box.id.endsWith(':rail'))) {
      expect([rail.min[2], rail.max[2]]).toEqual(
        rail.id.endsWith(':front:rail') ? [0, 16] : [384, 400],
      );
    }
  });

  it.each(['front', 'rear'] as const)(
    'places both %s ears flush outside the screw contact plane without moving the chassis datum',
    (face) => {
      const project = fixture();
      const device = installed('def-switch', face);
      project.devices = [device];
      const ears = deviceEarBoxes(project, device);
      expect(ears).toHaveLength(2);
      const xSpans = ears.map((ear) => [ear.min[0], ear.max[0]]).sort((a, b) => a[0] - b[0]);
      expect(xSpans[0][0]).toBeCloseTo(-241.3, 9);
      expect(xSpans[0][1]).toBeCloseTo(-215, 9);
      expect(xSpans[1][0]).toBeCloseTo(215, 9);
      expect(xSpans[1][1]).toBeCloseTo(241.3, 9);
      for (const ear of ears) {
        expect([ear.min[2], ear.max[2]]).toEqual(face === 'front' ? [-2, 0] : [400, 402]);
        expect(ear.min[1]).toBeCloseTo(89.65, 9);
        expect(ear.max[1]).toBeCloseTo(132.6, 9);
      }
      const body = deviceChassisBoxes(project, device)[0];
      expect([body.min[2], body.max[2]]).toEqual(face === 'front' ? [0, 280] : [120, 400]);
      expect(mountingPlane(project, device)).toBe(face === 'front' ? 0 : 400);
      expect(validatePlacement(project, device)).toEqual([]);
    },
  );

  it.each(['front', 'rear'] as const)(
    'keeps %s ears stationary when the chassis depth or ear thickness changes',
    (face) => {
      const project = fixture();
      const device = installed('def-switch', face);
      const definition = project.definitions.find((item) => item.id === 'def-switch')!;
      const before = deviceEarBoxes(project, device);
      definition.depthMm = 330;
      expect(deviceEarBoxes(project, device)).toEqual(before);
      const body = deviceChassisBoxes(project, device)[0];
      expect([body.min[2], body.max[2]]).toEqual(face === 'front' ? [0, 330] : [70, 400]);
      definition.earThicknessMm = 3;
      for (const ear of deviceEarBoxes(project, device)) {
        expect([ear.min[2], ear.max[2]]).toEqual(face === 'front' ? [-3, 0] : [400, 403]);
      }
      expect(deviceChassisBoxes(project, device)[0]).toEqual(body);
    },
  );

  it.each(['direct', 'rails', 'shelf', 'bracket'] as const)(
    'provides physical ears for %s rack mounting',
    (mounting) => {
      const project = fixture();
      const definition = project.definitions.find((item) => item.id === 'def-switch')!;
      definition.mounting = mounting;
      expect(hasRackEars(definition)).toBe(true);
      expect(deviceEarBoxes(project, installed(definition.id))).toHaveLength(2);
    },
  );

  it.each(['freestanding', 'side', 'custom'] as const)(
    'does not invent front rack ears for %s mounting',
    (mounting) => {
      const project = fixture();
      const definition = project.definitions.find((item) => item.id === 'def-switch')!;
      definition.mounting = mounting;
      expect(hasRackEars(definition)).toBe(false);
      expect(deviceEarBoxes(project, installed(definition.id))).toEqual([]);
    },
  );

  it.each([
    ['def-shelf-1', 'front'],
    ['def-shelf-1', 'rear'],
    ['def-shelf', 'front'],
    ['def-shelf', 'rear'],
  ] as const)(
    'gives %s mounted at the %s two ears and leaves the shelf interior open',
    (id, face) => {
      const project = fixture();
      const device = installed(id, face);
      project.devices = [device];
      expect(project.definitions.some((definition) => definition.id === id)).toBe(true);
      expect(deviceEarBoxes(project, device)).toHaveLength(2);
      expect(deviceChassisBoxes(project, device)).toHaveLength(3);
      expect(deviceBoxes(project, device)).toHaveLength(5);
      const passageStart: [number, number, number] = [0, 110, -20];
      const passageEnd: [number, number, number] = [0, 110, 420];
      expect(
        deviceBoxes(project, device).some((box) =>
          segmentHitsBox(passageStart, passageEnd, box, 3),
        ),
      ).toBe(false);
      for (const ear of deviceEarBoxes(project, device)) {
        expect([ear.min[2], ear.max[2]]).toEqual(face === 'front' ? [-2, 0] : [400, 402]);
      }
      expect(validatePlacement(project, device)).toEqual([]);
    },
  );

  it('includes ears in obstruction and cable checks beyond the chassis envelope', () => {
    const project = fixture();
    const device = installed('def-switch');
    project.devices = [device];
    project.rack.members.push({
      id: 'ear-obstruction',
      name: 'Member in front of mounting rail',
      position: [230, 110, -1],
      size: [6, 10, 1],
      profile: 'box',
      wallMm: null,
      profileAxis: 'y',
      profileRotationQuarterTurns: 0,
      evidence: 'example',
      source: '',
    });
    expect(deviceChassisBoxes(project, device).every((box) => box.min[2] >= 0)).toBe(true);
    expect(validatePlacement(project, device).join(' ')).toContain(
      'Physical collision with rack:member:ear-obstruction',
    );
    expect(
      deviceEarBoxes(project, device).some((box) =>
        segmentHitsBox([230, 110, -10], [230, 110, 10], box),
      ),
    ).toBe(true);
    expect(deviceBounds(project, device).min[2]).toBe(-2);
  });

  it.each(['front', 'rear'] as const)(
    'rejects %s ears whose face width cannot reach the mounting-hole columns',
    (face) => {
      const project = fixture();
      const device = installed('def-switch', face);
      const definition = project.definitions.find((item) => item.id === 'def-switch')!;
      definition.faceWidthMm = 460;
      expect(validatePlacement(project, device).join(' ')).toContain('both mounting-hole columns');
      definition.faceWidthMm = 430;
      expect(deviceEarBoxes(project, device)).toEqual([]);
      expect(validatePlacement(project, device).join(' ')).toContain('both mounting-hole columns');
    },
  );

  it('does not treat the shelf ears as a bearing surface for an oversized freestanding computer', () => {
    const project = fixture();
    const shelf = installed('def-shelf');
    const computer = { ...installed('def-pc'), id: 'computer', supportId: shelf.id };
    project.devices = [shelf, computer];
    const definition = project.definitions.find((item) => item.id === 'def-pc')!;
    definition.widthMm = 450;
    expect(deviceBounds(project, shelf).max[0]).toBeGreaterThan(225);
    expect(deviceEarBoxes(project, computer)).toEqual([]);
    expect(validatePlacement(project, computer).join(' ')).toContain(
      'extends beyond its shelf support footprint',
    );
  });

  it('rejects a thin custom part passing through the selected rail instead of exempting it as contact', () => {
    const project = fixture();
    const device = installed('def-switch');
    project.devices = [device];
    const definition = project.definitions.find((item) => item.id === 'def-switch')!;
    definition.parts.push({
      id: 'bad-contact',
      name: 'Rail penetration',
      position: [project.rack.railCentersMm / 2, 20, 1],
      size: [8, 8, 2],
    });
    expect(validatePlacement(project, device).join(' ')).toContain('front:rail');
    definition.parts[0].position[2] = -1;
    expect(validatePlacement(project, device)).toEqual([]);
  });

  it('keeps ports in the original mounting-plane coordinate system and mirrors rear mounting', () => {
    const project = fixture();
    const device = installed('def-switch');
    project.devices = [device];
    const endpoint = { kind: 'device' as const, deviceId: device.id, portId: 'p1' };
    expect(portWorld(project, endpoint)).toEqual([-178, 110.65, -2]);
    expect(portDirectionWorld(project, endpoint)).toEqual([0, 0, -1]);
    device.face = 'rear';
    expect(portWorld(project, endpoint)).toEqual([178, 110.65, 402]);
    expect(portDirectionWorld(project, endpoint)).toEqual([-0, 0, 1]);
  });

  it('opens earlier projects with unknown thickness and a 2 mm preview, preserving explicit thickness on round trip', () => {
    const legacy = clone(fixture());
    for (const definition of legacy.definitions)
      delete (definition as Partial<typeof definition>).earThicknessMm;
    for (const definition of legacy.definitions)
      delete (definition as Partial<typeof definition>).plate;
    const restored = projectSchema.parse(legacy);
    expect(restored.definitions.every((definition) => definition.earThicknessMm === null)).toBe(
      true,
    );
    expect(
      restored.definitions.every((definition) => effectiveEarThicknessMm(definition) === 2),
    ).toBe(true);
    restored.definitions[0].earThicknessMm = 3.5;
    const reopened = projectSchema.parse(JSON.parse(JSON.stringify(restored)));
    expect(reopened.definitions[0].earThicknessMm).toBe(3.5);
    expect(
      definitionSchema.safeParse({ ...restored.definitions[0], earThicknessMm: 0 }).success,
    ).toBe(false);
  });
});
