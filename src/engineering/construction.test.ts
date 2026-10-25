import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../examples';
import {
  clone,
  projectSchema,
  structuralMemberSchema,
  type Device,
  type Project,
  type StructuralMember,
  type Vec3,
} from '../model';
import {
  allObstacles,
  deviceChassisBoxes,
  deviceEarBoxes,
  effectiveRailThicknessMm,
  effectiveRailWidthMm,
  frontRailAt,
  mountingPlane,
  railSpacingAt,
  rearRailAt,
  segmentHitsBox,
  structuralMemberBoxes,
  structuralMemberIssues,
  validatePlacement,
  validateRack,
} from './geometry';

function fixture(): Project {
  const project = createExampleProject(false);
  project.rack.frameStyle = 'generic';
  project.rack.frameMm = 20;
  project.rack.railWidthMm = 10;
  project.rack.railThicknessMm = 10;
  project.rack.depthMeaning = 'external';
  project.rack.fixedFace = 'unconfirmed';
  project.rack.sections = [
    {
      id: 'flat',
      startU: 1,
      endU: project.rack.heightU,
      overallDepthMm: 1000,
      frontRailZMm: 0,
      rearRailZMm: 800,
    },
  ];
  project.devices = [];
  project.cables = [];
  return project;
}

function device(face: Device['face'] = 'front', definitionId = 'def-switch'): Device {
  return {
    id: 'mounted',
    definitionId,
    name: 'Mounted reference',
    startU: 3,
    face,
    supportId: null,
    installation: 'installed',
  };
}

const member = (extra: Partial<StructuralMember> = {}): StructuralMember =>
  structuralMemberSchema.parse({
    id: 'support',
    name: 'Configured support',
    position: [0, 100, 200],
    size: [100, 200, 80],
    profile: 'channel',
    wallMm: 4,
    evidence: 'example',
    source: 'Provisional geometry test.',
    ...extra,
  });

describe('independent rack construction components', () => {
  it('moves either mounting plane without resizing or moving exterior frame members', () => {
    const project = fixture();
    const frame = () => allObstacles(project).filter((box) => !box.id.endsWith(':rail'));
    const before = frame();
    project.rack.sections[0].frontRailZMm = 75;
    project.rack.sections[0].rearRailZMm = 700;
    expect(frame()).toEqual(before);
    expect(frontRailAt(project.rack, 3)).toBe(75);
    expect(rearRailAt(project.rack, 3)).toBe(700);
    expect(railSpacingAt(project.rack, 3)).toBe(625);
    expect(project.rack.sections[0].overallDepthMm).toBe(1000);
    expect(validateRack(project.rack)).toEqual([]);
  });

  it('changes generic frame thickness independently of explicitly configured rail dimensions', () => {
    const project = fixture();
    project.rack.railWidthMm = 14;
    project.rack.railThicknessMm = 6;
    const rails = () => allObstacles(project).filter((box) => box.id.endsWith(':rail'));
    const before = rails();
    project.rack.frameMm = 28;
    expect(rails()).toEqual(before);
    for (const box of rails()) {
      expect(box.max[0] - box.min[0]).toBe(14);
      expect(box.max[2] - box.min[2]).toBe(6);
    }
    expect(validateRack(project.rack)).toEqual([]);
  });

  it.each(['front', 'rear'] as const)(
    'keeps %s ears in exact exterior contact after moving the mounting rail',
    (face) => {
      const project = fixture(),
        mounted = device(face);
      project.rack.sections[0].frontRailZMm = 40;
      project.rack.sections[0].rearRailZMm = 730;
      project.rack.railThicknessMm = 7;
      project.devices = [mounted];
      const plane = face === 'front' ? 40 : 730;
      const rails = allObstacles(project).filter((box) => box.id.endsWith(`:${face}:rail`));
      expect(rails).toHaveLength(2);
      for (const rail of rails) expect(face === 'front' ? rail.min[2] : rail.max[2]).toBe(plane);
      for (const ear of deviceEarBoxes(project, mounted))
        expect(face === 'front' ? ear.max[2] : ear.min[2]).toBe(plane);
      expect(mountingPlane(project, mounted)).toBe(plane);
      expect(validatePlacement(project, mounted)).toEqual([]);
    },
  );

  it.each(['front', 'rear'] as const)(
    'follows the supported shelf mounting plane for a %s freestanding chassis',
    (face) => {
      const project = fixture();
      project.rack.sections[0].frontRailZMm = 30;
      project.rack.sections[0].rearRailZMm = 750;
      const shelf = device(face, 'def-shelf'),
        computer = { ...device(face, 'def-pc'), id: 'computer', supportId: shelf.id };
      project.devices = [shelf, computer];
      expect(mountingPlane(project, computer)).toBe(face === 'front' ? 30 : 750);
      const body = deviceChassisBoxes(project, computer)[0];
      expect(face === 'front' ? body.min[2] : body.max[2]).toBe(face === 'front' ? 30 : 750);
      expect(validatePlacement(project, computer)).toEqual([]);
    },
  );

  it('rejects a device spanning a change in its front mounting plane', () => {
    const project = fixture(),
      mounted = device('front', 'def-server');
    mounted.startU = 15;
    project.devices = [mounted];
    project.rack.sections = [
      { ...project.rack.sections[0], id: 'lower', endU: 15 },
      { ...project.rack.sections[0], id: 'upper', startU: 16, frontRailZMm: 25 },
    ];
    expect(validatePlacement(project, mounted).join(' ')).toContain(
      'change in front mounting plane',
    );
  });

  it('checks the actual rear-minus-front rail spacing against an adjustable rail kit', () => {
    const project = fixture(),
      mounted = device('front', 'def-server');
    const definition = project.definitions.find((item) => item.id === mounted.definitionId)!;
    definition.railMinMm = 660;
    definition.railMaxMm = 680;
    project.devices = [mounted];
    project.rack.sections[0].frontRailZMm = 30;
    project.rack.sections[0].rearRailZMm = 700;
    expect(validatePlacement(project, mounted)).toEqual([]);
    project.rack.sections[0].frontRailZMm = 100;
    expect(validatePlacement(project, mounted).join(' ')).toContain(
      'outside the device rail adjustment range',
    );
  });

  it('validates front and rear rail bounds and rail overlap without changing frame depth', () => {
    const rack = fixture().rack;
    rack.sections[0].frontRailZMm = -40;
    expect(validateRack(rack).join(' ')).toContain('Front rail');
    rack.sections[0].frontRailZMm = 0;
    rack.sections[0].rearRailZMm = 940;
    expect(validateRack(rack).join(' ')).toContain('inside the rear frame');
    rack.sections[0].rearRailZMm = 15;
    expect(validateRack(rack).join(' ')).toContain('rails overlap');
    rack.sections[0].rearRailZMm = 800;
    rack.railWidthMm = 20;
    expect(validateRack(rack).join(' ')).toContain('clear opening');
  });

  it.each(['front', 'rear'] as const)(
    'checks a configured fixed %s face across sections',
    (face) => {
      const rack = fixture().rack;
      rack.fixedFace = face;
      rack.sections = [
        { ...rack.sections[0], id: 'lower', endU: 15 },
        {
          ...rack.sections[0],
          id: 'upper',
          startU: 16,
          frontRailZMm: face === 'front' ? 20 : 0,
          rearRailZMm: face === 'rear' ? 750 : 800,
        },
      ];
      expect(validateRack(rack).join(' ')).toContain(`fixed ${face} mounting face`);
    },
  );

  it('uses only rails and configured structural members when generic frame generation is disabled', () => {
    const project = fixture();
    project.rack.frameStyle = 'explicit';
    project.rack.members = [member({ profile: 'box' })];
    project.rack.endPanels = null;
    const boxes = allObstacles(project);
    expect(boxes).toHaveLength(5);
    expect(boxes.filter((box) => box.id.endsWith(':rail'))).toHaveLength(4);
    expect(boxes.some((box) => box.id.endsWith(':post') || box.id.endsWith('-beam'))).toBe(false);
    expect(boxes.some((box) => box.id === 'rack:member:support')).toBe(true);
    project.rack.frameMm = 500;
    expect(allObstacles(project)).toEqual(boxes);
    expect(validateRack(project.rack)).toEqual([]);
  });

  it('restores earlier construction fields as explicit unknowns with the original rail preview', () => {
    const raw = clone(fixture()) as unknown as Record<string, unknown>;
    const rack = raw.rack as Record<string, unknown>;
    delete rack.railWidthMm;
    delete rack.railThicknessMm;
    delete rack.frameStyle;
    for (const section of rack.sections as Record<string, unknown>[]) delete section.frontRailZMm;
    rack.members = [
      { id: 'legacy', name: 'Old beam', position: [0, 100, 200], size: [10, 20, 30] },
    ];
    const restored = projectSchema.parse(raw);
    expect(restored.rack.railWidthMm).toBeNull();
    expect(restored.rack.railThicknessMm).toBeNull();
    expect(restored.rack.frameStyle).toBe('generic');
    expect(effectiveRailWidthMm(restored.rack)).toBe(10);
    expect(effectiveRailThicknessMm(restored.rack)).toBe(10);
    expect(frontRailAt(restored.rack, 1)).toBe(0);
    expect(restored.rack.members[0].profile).toBe('box');
    expect(restored.rack.members[0].evidence).toBe('unknown');
    expect(structuralMemberBoxes(restored.rack.members[0])).toHaveLength(1);
  });

  it('returns undefined rail planes for missing or overlapping sections', () => {
    const rack = fixture().rack;
    rack.sections[0].startU = 2;
    expect(Number.isNaN(frontRailAt(rack, 1))).toBe(true);
    expect(Number.isNaN(railSpacingAt(rack, 1))).toBe(true);
    rack.sections.push({ ...rack.sections[0], id: 'overlap' });
    expect(Number.isNaN(frontRailAt(rack, 3))).toBe(true);
  });
});

describe('configured structural profile solids', () => {
  it.each(['angle', 'channel'] as const)('keeps %s internal space open for cables', (profile) => {
    const support = member({ profile });
    const boxes = structuralMemberBoxes(support);
    expect(boxes).toHaveLength(profile === 'angle' ? 2 : 3);
    expect(boxes.some((box) => segmentHitsBox([0, -20, 200], [0, 220, 200], box, 3))).toBe(false);
    expect(boxes.some((box) => segmentHitsBox([-48, -20, 200], [-48, 220, 200], box))).toBe(true);
    const project = fixture();
    project.rack.members = [support];
    expect(allObstacles(project).filter((box) => box.id.startsWith('rack:member:'))).toEqual(boxes);
  });

  it.each(['x', 'y', 'z'] as const)(
    'extrudes an open channel along its selected %s axis',
    (profileAxis) => {
      const support = member({ position: [0, 0, 0], size: [100, 100, 100], profileAxis });
      const axis = { x: 0, y: 1, z: 2 }[profileAxis];
      const a: Vec3 = [0, 0, 0],
        b: Vec3 = [0, 0, 0];
      a[axis] = -100;
      b[axis] = 100;
      expect(structuralMemberBoxes(support).some((box) => segmentHitsBox(a, b, box, 3))).toBe(
        false,
      );
      for (const box of structuralMemberBoxes(support))
        expect(box.max[axis] - box.min[axis]).toBe(100);
    },
  );

  it('rotates the channel opening while preserving its independently configured envelope', () => {
    const support = member({ position: [0, 0, 0] });
    const passes = () =>
      !structuralMemberBoxes(support).some((box) => segmentHitsBox([0, 0, 0], [0, 0, 100], box, 1));
    expect(passes()).toBe(true);
    support.profileRotationQuarterTurns = 2;
    expect(passes()).toBe(false);
    const boxes = structuralMemberBoxes(support);
    expect(Math.min(...boxes.map((box) => box.min[0]))).toBe(-50);
    expect(Math.max(...boxes.map((box) => box.max[0]))).toBe(50);
    expect(Math.min(...boxes.map((box) => box.min[2]))).toBe(-40);
    expect(Math.max(...boxes.map((box) => box.max[2]))).toBe(40);
  });

  it('detects device collisions with profile walls while allowing the open cavity', () => {
    const project = fixture(),
      mounted = device();
    project.devices = [mounted];
    const support = member({
      position: [0, 111, 145],
      size: [440, 50, 280],
      profileAxis: 'z',
      wallMm: 2,
    });
    project.rack.members = [support];
    expect(validatePlacement(project, mounted)).toEqual([]);
    support.position[0] = 10;
    expect(validatePlacement(project, mounted).join(' ')).toContain(
      'Physical collision with rack:member:support:wall:',
    );
  });

  it.each([null, 0, 40, 50])(
    'rejects an undefined or invalid %s mm wall rather than inventing solids',
    (wallMm) => {
      const support = member();
      support.wallMm = wallMm;
      expect(structuralMemberIssues(support).join(' ')).toContain('positive wall thickness');
      expect(structuralMemberBoxes(support)).toEqual([]);
      const project = fixture();
      project.rack.members = [support];
      expect(validateRack(project.rack).join(' ')).toContain('positive wall thickness');
    },
  );
});
