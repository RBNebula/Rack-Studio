import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../testing/legacy-example';
import { definitionSchema, type Device } from '../model';
import { createLacingBar, lacingBarParts } from './lacing-bar';
import { definitionParts } from '../engineering/shelves';
import {
  deviceChassisBoxes,
  deviceEarBoxes,
  mountingPlane,
  mountingHoleY,
  segmentHitsBox,
  validatePlacement,
} from '../engineering/geometry';
import { parseProject, serializeProject } from '../data/project';

function fixture(face: Device['face']) {
  const project = createExampleProject(false);
  project.rack.originMm = [200, 170, -300];
  const definition = project.definitions.find((d) => d.id === 'def-lacing-bar')!;
  const device: Device = {
    id: 'bar',
    definitionId: definition.id,
    name: 'Lacing bar',
    startU: 17,
    face,
    supportId: null,
    installation: 'installed',
  };
  project.devices = [device];
  return { project, definition, device };
}

describe('middle-hole rack lacing bar', () => {
  it('generates two solid returns and a crossbar around an open centre with 150 mm clear reach', () => {
    const d = createLacingBar(),
      parts = definitionParts(d);
    expect(parts).toHaveLength(3);
    expect(d.ports).toEqual([]);
    expect(d.screwOffsetsMm).toEqual([22.225]);
    const cross = parts.find((p) => p.id === 'lacing-crossbar')!;
    expect(cross.position[2] - cross.size[2] / 2).toBe(150);
    expect(cross.position[2] + cross.size[2] / 2).toBe(d.depthMm);
    expect(parts.slice(0, 2).every((p) => p.position[2] - p.size[2] / 2 === -2)).toBe(true);
  });
  it.each(['front', 'rear'] as const)(
    'mounts %s tabs flush, centred on the middle hole, in a translated stepped rack',
    (face) => {
      const { project, definition, device } = fixture(face);
      expect(validatePlacement(project, device)).toEqual([]);
      const plane = mountingPlane(project, device);
      const ears = deviceEarBoxes(project, device);
      expect(ears).toHaveLength(2);
      for (const ear of ears) {
        expect(face === 'front' ? ear.max[2] : ear.min[2]).toBe(plane);
        expect((ear.min[1] + ear.max[1]) / 2).toBeCloseTo(170 + mountingHoleY(17, 1));
        expect(ear.max[1] - ear.min[1]).toBe(definition.heightMm);
      }
      const cross = deviceChassisBoxes(project, device).find((b) =>
        b.id.endsWith('lacing-crossbar'),
      )!;
      expect(face === 'front' ? cross.min[2] - plane : plane - cross.max[2]).toBe(150);
    },
  );
  it.each(['front', 'rear'] as const)(
    'allows a cable through its open centre but blocks %s metal and respects clearance above the crossbar',
    (face) => {
      const { project, device } = fixture(face),
        plane = mountingPlane(project, device);
      const boxes = deviceChassisBoxes(project, device),
        y = 170 + mountingHoleY(17, 1),
        sign = face === 'front' ? 1 : -1;
      expect(
        boxes.some((b) =>
          segmentHitsBox([180, y, plane + sign * 75], [220, y, plane + sign * 75], b, 5),
        ),
      ).toBe(false);
      const through = (height: number) =>
        boxes.some((b) =>
          segmentHitsBox(
            [100, height, plane + sign * 153],
            [300, height, plane + sign * 153],
            b,
            5,
          ),
        );
      expect(through(y)).toBe(true);
      expect(through(y + 10)).toBe(false);
      expect(through(y + 8)).toBe(true);
    },
  );
  it('regenerates geometry when reach changes, without moving ears or changing rack dimensions', () => {
    const { project, definition, device } = fixture('rear');
    const ears = deviceEarBoxes(project, device),
      rack = structuredClone(project.rack);
    definition.depthMm = 256;
    expect(lacingBarParts(definition).find((p) => p.id === 'lacing-crossbar')!.position[2]).toBe(
      253,
    );
    expect(deviceEarBoxes(project, device)).toEqual(ears);
    expect(project.rack).toEqual(rack);
    expect(
      parseProject(serializeProject(project)).definitions.find((d) => d.id === definition.id),
    ).toEqual(definition);
  });
  it('rejects invalid profiles and incompatible construction instead of saving misleading geometry', () => {
    const d = createLacingBar();
    for (const patch of [
      { bodyMode: 'box' },
      { heightU: 2 },
      { screwOffsetsMm: [6.35] },
      { depthMm: 4 },
      { lacing: { barWidthMm: 6, barHeightMm: 18 } },
    ])
      expect(definitionSchema.safeParse({ ...d, ...patch }).success).toBe(false);
  });
});
