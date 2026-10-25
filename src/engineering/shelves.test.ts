import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../examples';
import { clone, projectSchema, type Device } from '../model';
import { parseProject, serializeProject, validateReferences } from '../data/project';
import {
  deviceChassisBoxes,
  deviceEarBoxes,
  devicePosition,
  rackSpecificationIssues,
  validatePlacement,
  validateRack,
} from './geometry';
import { definitionParts, generatedShelfParts, validateShelfDefinition } from './shelves';

function fixture(face: Device['face'] = 'front') {
  const project = createExampleProject(false);
  const definition = project.definitions.find((d) => d.id === 'def-shelf-1')!;
  const shelf: Device = {
    id: 'shelf',
    definitionId: definition.id,
    name: 'Shelf',
    startU: 3,
    face,
    supportId: null,
    installation: 'installed',
  };
  project.devices = [shelf];
  return { project, definition, shelf };
}

describe('independently configurable generic shelves', () => {
  it.each(['front', 'rear'] as const)(
    'resizes physical shelf parts without moving %s ears or changing rack depths',
    (face) => {
      const { project, definition, shelf } = fixture(face);
      const rack = clone(project.rack);
      const ears = deviceEarBoxes(project, shelf);
      definition.depthMm = 350;
      definition.shelf!.usableDepthMm = 300;
      const floor = generatedShelfParts(definition).find((p) => p.id === 'shelf-floor')!;
      expect(floor.size[2]).toBe(350);
      expect(floor.position[2]).toBe(175);
      expect(deviceEarBoxes(project, shelf)).toEqual(ears);
      expect(project.rack).toEqual(rack);
      expect(validatePlacement(project, shelf)).toEqual([]);
      const body = deviceChassisBoxes(project, shelf);
      const min = Math.min(...body.map((b) => b.min[2]));
      const max = Math.max(...body.map((b) => b.max[2]));
      expect(max - min).toBe(350);
    },
  );

  it.each(['front', 'rear'] as const)(
    'checks a computer against %s usable space rather than the full shelf floor or additional supports',
    (face) => {
      const { project, definition, shelf } = fixture(face);
      definition.heightU = 2;
      definition.heightMm = 88.9;
      definition.screwOffsetsMm = [6.35, 82.55];
      definition.shelf!.usableDepthMm = 250;
      definition.shelf!.supportMode = 'additional-supports';
      definition.shelf!.supports = [
        {
          id: 'wide-support',
          name: 'Explicit support',
          position: [0, 2, 225],
          size: [448, 4, 450],
        },
      ];
      const pc: Device = {
        id: 'pc',
        definitionId: 'def-pc',
        name: 'PC',
        startU: 3,
        face,
        supportId: shelf.id,
        installation: 'installed',
      };
      project.devices.push(pc);
      expect(validatePlacement(project, pc).join(' ')).toContain(
        'extends beyond its shelf support footprint',
      );
      definition.shelf!.usableDepthMm = 350;
      definition.shelf!.usableWidthMm = 290;
      expect(validatePlacement(project, pc).join(' ')).toContain(
        'extends beyond its shelf support footprint',
      );
      definition.shelf!.usableWidthMm = 400;
      expect(validatePlacement(project, pc)).toEqual([]);
    },
  );

  it('uses the configured floor as the bearing datum even when thicker than 12 mm or other thin parts are above it', () => {
    const { project, definition, shelf } = fixture();
    definition.heightU = 3;
    definition.heightMm = 133.35;
    definition.shelf!.floorThicknessMm = 20;
    definition.parts.push({
      id: 'upper-plate',
      name: 'Independent component',
      position: [0, 90, 225],
      size: [430, 4, 450],
    });
    const pc: Device = {
      id: 'pc',
      definitionId: 'def-pc',
      name: 'PC',
      startU: 3,
      face: 'front',
      supportId: shelf.id,
      installation: 'installed',
    };
    project.devices.push(pc);
    expect(devicePosition(project, pc)[1]).toBeCloseTo(88.9 + 20 + 30, 8);
  });

  it('requires explicit additional support geometry and rejects impossible usable dimensions', () => {
    const { definition } = fixture();
    definition.shelf!.supportMode = 'additional-supports';
    expect(validateShelfDefinition(definition).join(' ')).toContain(
      'explicit component dimensions',
    );
    definition.shelf!.usableDepthMm = definition.depthMm + 1;
    definition.shelf!.usableWidthMm = definition.widthMm;
    definition.shelf!.floorThicknessMm = definition.heightMm;
    expect(validateShelfDefinition(definition)).toHaveLength(4);
    expect(generatedShelfParts(definition)).toEqual([]);
  });

  it('keeps explicit additional supports independent when the shelf overall depth changes', () => {
    const { definition } = fixture();
    definition.shelf!.supportMode = 'additional-supports';
    const support = {
      id: 'rear-support',
      name: 'Measured later',
      position: [222, 12, 170] as [number, number, number],
      size: [4, 8, 300] as [number, number, number],
    };
    definition.shelf!.supports = [support];
    definition.depthMm = 350;
    definition.shelf!.usableDepthMm = 300;
    expect(definitionParts(definition)).toContainEqual(support);
    expect(definitionParts(definition)).toHaveLength(4);
    expect(validateShelfDefinition(definition)).toEqual([]);
  });

  it('round-trips independent rail, shelf, support and provisional evidence data', () => {
    const { project, definition } = fixture('rear');
    definition.shelf!.usableDepthMm = 320;
    definition.shelf!.supportMode = 'additional-supports';
    definition.shelf!.supports = [
      { id: 'support', name: 'Provisional support', position: [222, 12, 170], size: [4, 8, 300] },
    ];
    project.rack.sections.forEach((section) => {
      section.frontRailZMm = 15;
    });
    project.rack.railThicknessMm = 7;
    const restored = parseProject(serializeProject(project));
    expect(restored.rack).toEqual(project.rack);
    expect(restored.definitions).toEqual(project.definitions);
    expect(restored.devices).toEqual(project.devices);
    expect(restored.rack.evidence).toBe('example');
  });

  it('preserves legacy explicit shelf shapes and old rail previews without inventing verified dimensions', () => {
    const { project, definition } = fixture();
    definition.parts = generatedShelfParts(definition);
    const legacy = JSON.parse(JSON.stringify(project));
    for (const def of legacy.definitions) delete def.shelf;
    delete legacy.rack.railWidthMm;
    delete legacy.rack.railThicknessMm;
    delete legacy.rack.frameStyle;
    legacy.rack.sections.forEach((s: Record<string, unknown>) => delete s.frontRailZMm);
    const restored = parseProject(JSON.stringify(legacy));
    expect(restored.definitions.find((d) => d.id === definition.id)!.shelf).toBeNull();
    expect(restored.rack.railWidthMm).toBeNull();
    expect(restored.rack.sections[0].frontRailZMm).toBe(0);
    expect(deviceChassisBoxes(restored, restored.devices[0])).toHaveLength(3);
  });

  it('rejects inconsistent shelf definitions on import even before an instance is placed', () => {
    const { project, definition } = fixture();
    project.devices = [];
    definition.shelf!.usableDepthMm = definition.depthMm + 1;
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(validateReferences(project).join(' ')).toContain('usable depth exceeds');
    expect(() => parseProject(JSON.stringify(project))).toThrow('usable depth exceeds');
  });

  it('opens legacy unknown rail profiles with a visible opening conflict, but rejects the same conflict when width is explicit', () => {
    const { project } = fixture();
    project.rack.frameMm = 40;
    project.rack.railWidthMm = null;
    project.rack.railThicknessMm = null;
    project.devices = [];
    const restored = parseProject(JSON.stringify(project));
    expect(rackSpecificationIssues(restored.rack).join(' ')).toContain(
      'legacy rail preview conflicts',
    );
    restored.rack.railWidthMm = 20;
    expect(validateRack(restored.rack).join(' ')).toContain('intrude');
  });
});
