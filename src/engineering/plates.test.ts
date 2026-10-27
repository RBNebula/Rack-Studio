import { describe, expect, it } from 'vitest';
import { createWorkspaceProject } from '../testing/legacy-example';
import { clone, definitionSchema, type Device } from '../model';
import { parseProject, serializeProject } from '../data/project';
import {
  allObstacles,
  deviceBoxes,
  deviceChassisBoxes,
  deviceEarBoxes,
  segmentHitsBox,
  validatePlacement,
} from './geometry';
import {
  MAX_PLATE_APERTURES,
  plateApertures,
  plateFoldBoxes,
  plateMountingSlots,
  validatePlateDefinition,
} from './plates';

function fixture(face: Device['face'] = 'front', definitionId = 'def-mesh-1') {
  const project = createWorkspaceProject(false);
  const definition = project.definitions.find((d) => d.id === definitionId)!;
  const device: Device = {
    id: 'panel',
    definitionId,
    name: 'Reference panel',
    startU: 5,
    face,
    supportId: null,
    installation: 'installed',
  };
  project.devices = [device];
  return { project, definition, device };
}

describe('reference folded solid and perforated blanks', () => {
  it('provides distinct 1–4U solid and perforated sheets without device ports or chassis boxes', () => {
    const project = createWorkspaceProject(false);
    const plates = project.definitions.filter((d) => d.plate);
    expect(plates).toHaveLength(8);
    for (const definition of plates) {
      expect(definition.heightMm).toBeCloseTo(definition.heightU * 44.45 - 1.5, 8);
      expect(definition.ports).toEqual([]);
      expect(definition.parts).toEqual([]);
      expect(definition.evidence).toBe('example');
      expect(validatePlateDefinition(definition)).toEqual([]);
    }
  });

  it.each(['front', 'rear'] as const)(
    'keeps the %s sheet and integral ears tangent to rails with folded returns inside',
    (face) => {
      const { project, definition, device } = fixture(face);
      const plane = face === 'front' ? 0 : 800;
      const sheet = deviceChassisBoxes(project, device).find((b) => b.id.endsWith(':plate-sheet'))!;
      expect([sheet.min[2], sheet.max[2]]).toEqual(face === 'front' ? [-1.5, 0] : [800, 801.5]);
      for (const ear of deviceEarBoxes(project, device)) {
        expect([ear.min[2], ear.max[2]]).toEqual([sheet.min[2], sheet.max[2]]);
        expect(ear.min[0]).not.toBe(ear.max[0]);
      }
      const folds = deviceChassisBoxes(project, device).filter((b) =>
        b.id.includes('plate-return'),
      );
      expect(folds).toHaveLength(2);
      expect(
        folds.every((b) =>
          face === 'front'
            ? b.min[2] === plane && b.max[2] === plane + 10
            : b.min[2] === plane - 10 && b.max[2] === plane,
        ),
      ).toBe(true);
      expect(
        deviceBoxes(project, device).some(
          (b) => b.id.endsWith(':body') || b.id.endsWith(':fascia'),
        ),
      ).toBe(false);
      expect(validatePlacement(project, device)).toEqual([]);
      definition.plate!.returnDepthMm = 18;
      definition.depthMm = 18;
      expect(deviceEarBoxes(project, device).map((b) => [b.min[2], b.max[2]])).toEqual([
        [sheet.min[2], sheet.max[2]],
        [sheet.min[2], sheet.max[2]],
      ]);
      expect(project.rack.sections[0].rearRailZMm).toBe(800);
      expect(validatePlacement(project, device)).toEqual([]);
    },
  );

  it('lays circular apertures inside the vent field and keeps a solid mounting flange', () => {
    const { definition } = fixture();
    const holes = plateApertures(definition);
    expect(holes.length).toBeGreaterThan(200);
    expect(holes.length).toBeLessThan(MAX_PLATE_APERTURES);
    for (const hole of holes) {
      expect(Math.abs(hole.x) + hole.radius).toBeLessThanOrEqual(definition.widthMm / 2 - 5 + 1e-6);
      expect(hole.y - hole.radius).toBeGreaterThanOrEqual(5 - 1e-6);
      expect(hole.y + hole.radius).toBeLessThanOrEqual(definition.heightMm - 5 + 1e-6);
      expect(hole.radius).toBe(2);
    }
    const firstRow = holes.filter((hole) => hole.y === holes[0].y);
    expect(firstRow[1].x - firstRow[0].x).toBe(7);
    definition.plate!.style = 'solid';
    expect(plateApertures(definition)).toEqual([]);
  });

  it('places actual slot coordinates at the declared nominal screw heights and columns', () => {
    const { definition } = fixture();
    const slots = plateMountingSlots(definition);
    expect(slots).toHaveLength(4);
    expect(slots.map((slot) => slot.x)).toEqual([-232.55, -232.55, 232.55, 232.55]);
    expect(slots[0].y).toBeCloseTo(5.6, 8);
    expect(slots[1].y).toBeCloseTo(37.35, 8);
    expect(slots.every((s) => s.width === 10 && s.height === 6)).toBe(true);
  });

  it.each(['front', 'rear'] as const)(
    'allows a zero-return flat sheet on the %s while ordinary equipment still requires positive chassis depth',
    (face) => {
      const { project, definition, device } = fixture(face, 'def-blank-1');
      definition.plate!.returnDepthMm = 0;
      definition.depthMm = 0;
      expect(definitionSchema.safeParse(definition).success).toBe(true);
      expect(plateFoldBoxes(definition)).toEqual([]);
      expect(deviceChassisBoxes(project, device)).toHaveLength(1);
      expect(validatePlacement(project, device)).toEqual([]);
      expect(definitionSchema.safeParse({ ...definition, plate: null }).success).toBe(false);
    },
  );

  it('retains conservative collision checks across ventilation holes rather than treating them as cable exits', () => {
    const { project, definition } = fixture();
    const hole = plateApertures(definition).find((h) => Math.abs(h.x) < 100)!;
    const y = (5 - 1) * 44.45 + 0.75 + hole.y;
    expect(
      allObstacles(project)
        .filter((b) => b.id.startsWith('device:panel:'))
        .some((b) => segmentHitsBox([hole.x, y, -20], [hole.x, y, 20], b, 1)),
    ).toBe(true);
  });

  it('rejects a plate whose mounting columns differ from the rack without silently shifting its slots', () => {
    const { project, definition, device } = fixture();
    definition.plate!.mountingCentersMm = 470;
    expect(validatePlacement(project, device).join(' ')).toContain('slot centres do not match');
    expect(plateMountingSlots(definition)[0].x).toBe(-235);
  });

  it('keeps physical clearance between adjacent U panels and rejects overlapping placement', () => {
    const { project, device } = fixture('front', 'def-blank-1');
    const adjacent = { ...device, id: 'next', name: 'Adjacent', startU: 6 };
    project.devices.push(adjacent);
    expect(validatePlacement(project, adjacent)).toEqual([]);
    adjacent.startU = 5;
    expect(validatePlacement(project, adjacent).join(' ')).toContain('collision');
  });

  it('rejects invalid apertures, slots, hidden parts/ports and excessive tessellation before save/import', () => {
    const { project, definition } = fixture();
    const changed = clone(definition);
    changed.plate!.holePitchMm = 4;
    expect(validatePlateDefinition(changed).join(' ')).toContain('pitch greater');
    changed.plate!.holePitchMm = 0.001;
    changed.plate!.holeDiameterMm = 0.0001;
    expect(plateApertures(changed)).toEqual([]);
    expect(validatePlateDefinition(changed).join(' ')).toContain('geometry limit');
    changed.plate = clone(definition.plate);
    changed.plate!.slotWidthMm = 60;
    expect(validatePlateDefinition(changed).join(' ')).toContain('slots must fit');
    definition.ports.push({
      id: 'unexpected',
      name: 'Hidden',
      connector: 'RJ45',
      surface: 'front',
      position: [0, 20, -1.5],
      direction: [0, 0, -1],
      multiple: false,
    });
    expect(() => parseProject(JSON.stringify(project))).toThrow('without equipment ports');
  });

  it('round-trips plate style, explicit provisional dimensions, front/rear face and independent rail planes', () => {
    const { project, definition, device } = fixture('rear');
    definition.plate!.holePitchMm = 9;
    definition.plate!.thicknessMm = 2.2;
    project.rack.sections[0].frontRailZMm = 10;
    const restored = parseProject(serializeProject(project));
    expect(restored.definitions.find((d) => d.id === definition.id)!.plate).toEqual(
      definition.plate,
    );
    expect(restored.devices[0]).toEqual(device);
    expect(restored.rack.endPanels).toEqual({ top: true, base: true, thicknessMm: 2 });
    expect(restored.rack.evidence).toBe('example');
  });
});
