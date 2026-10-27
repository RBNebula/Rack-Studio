import { describe, expect, it } from 'vitest';
import type { Device, Vec3 } from '../model';
import { createWorkspaceProject } from '../examples';
import {
  U_MM,
  deviceBounds,
  frontRailAt,
  rearRailAt,
  validatePlacement,
} from '../engineering/geometry';
import { placementIssues, projectWithPlacement, supportRoot } from '../engineering/placement';
import { origin } from '../engineering/space';
import { parseProject, serializeProject } from './project';
import {
  buildMeshAsset,
  decodeMeshAsset,
  orientationBasis,
  renderFace,
  visibleParts,
  widthBehind,
} from './step';
import type { RawPart } from './step';
import { stepDefinition } from './step-definition';

/** Closed box part, as a CAD kernel would tessellate it. */
function box(name: string, min: Vec3, max: Vec3, color: [number, number, number]): RawPart {
  const corners: number[] = [];
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push(x, y, z);
  // Corner index = 4x + 2y + z.
  const faces = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ];
  return {
    name,
    color,
    positions: new Float32Array(corners),
    indices: new Uint32Array(faces.flatMap(([a, b, c, d]) => [a, b, c, a, c, d])),
  };
}
/**
 * A Y-up CAD model whose front is +Z: a 200 × 30 × 150 body, a port on the front at CAD +X
 * (right in the CAD front view), a rear connector and a board hidden inside.
 */
const model = (): RawPart[] => [
  box('body', [-100, 0, -150], [100, 30, 0], [0.2, 0.2, 0.2]),
  box('port', [60, 5, 0], [90, 20, 6], [1, 1, 0]),
  box('antenna', [-90, 10, -160], [-80, 20, -150], [0, 0, 1]),
  box('board', [-90, 5, -140], [90, 8, -10], [0, 0.5, 0]),
];

describe('STEP model processing', () => {
  it('maps the CAD front to the rack front without mirroring', () => {
    const [x, y, z] = orientationBasis({ front: '+z', up: '+y' });
    // Front +Z becomes local -z (towards the viewer); CAD +X shows on the right, i.e. local -x.
    expect([x, y, z]).toEqual([
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ]);
    expect(() => orientationBasis({ front: '+z', up: '-z' })).toThrow('perpendicular');
  });

  it('drops hidden internal parts and packs a mesh in device-local millimetres', () => {
    const built = buildMeshAsset(model(), {
      fileName: 'unit.stp',
      orientation: { front: '+z', up: '+y' },
      omitHidden: true,
    });
    expect(built.asset.omittedParts).toBe(1);
    expect(built.parts.map((p) => p.name)).toEqual(['body', 'port', 'antenna']);
    // Port front to antenna back: 6 + 150 + 10 mm deep.
    expect(built.sizeMm).toEqual([200, 30, 166]);
    expect(built.asset.boundsMm).toEqual({ min: [-100, 0, 0], max: [100, 30, 166] });
    expect(built.asset.triangles).toBe(36);
    const decoded = decodeMeshAsset(built.asset);
    const all = decoded.flatMap((g) => [...g.positions]);
    expect(Math.min(...all)).toBeCloseTo(-100, 2);
    // The port is in front (local z from 0 to 6) and on local -x (CAD +X).
    const port = decoded.find((g) => g.color === '#ffff00')!;
    const zs = [...port.positions].filter((_, i) => i % 3 === 2),
      xs = [...port.positions].filter((_, i) => i % 3 === 0);
    expect(Math.min(...zs)).toBeCloseTo(0, 2);
    expect(Math.max(...zs)).toBeCloseTo(6, 2);
    expect(Math.max(...xs)).toBeCloseTo(-60, 2);
    const kept = buildMeshAsset(model(), {
      fileName: 'unit.stp',
      orientation: { front: '+z', up: '+y' },
      omitHidden: false,
    });
    expect(kept.asset.omittedParts).toBe(0);
    expect(visibleParts(kept.parts)).toEqual([true, true, true, false]);
  });

  it('renders front and rear faces as seen from each side', () => {
    const { parts } = buildMeshAsset(model(), {
      fileName: 'unit.stp',
      orientation: { front: '+z', up: '+y' },
      omitHidden: true,
    });
    const front = renderFace(parts, 'front', 1);
    expect([front.width, front.height]).toEqual([200, 30]);
    const pixel = (img: typeof front, x: number, y: number) => [
      ...img.rgba.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4),
    ];
    // The port (CAD +X, 60–90 mm) shows on the right of the front view, 160–190 px across.
    expect(pixel(front, 175, 15).slice(0, 3)).toEqual([255, 255, 0]);
    expect(pixel(front, 25, 15).slice(0, 3)).not.toEqual([255, 255, 0]);
    // From the rear the antenna (CAD −90 to −80 mm) is on the right too: 180–190 px.
    const rear = renderFace(parts, 'rear', 1);
    expect(pixel(rear, 185, 15).slice(0, 3)).toEqual([0, 0, 255]);
  });

  it('turns a model whose front is another axis', () => {
    // The same model with CAD front -X: rotate it so +Z data now faces sideways.
    const turned = model().map((p) => {
      const positions = new Float32Array(p.positions.length);
      for (let i = 0; i < positions.length; i += 3) {
        // CAD (x, y, z) -> (z, y, -x): the +Z front now points along -X.
        positions[i] = p.positions[i + 2];
        positions[i + 1] = p.positions[i + 1];
        positions[i + 2] = -p.positions[i];
      }
      return { ...p, positions };
    });
    const built = buildMeshAsset(turned, {
      fileName: 'turned.stp',
      orientation: { front: '-x', up: '+y' },
      omitHidden: true,
    });
    expect(built.sizeMm).toEqual([200, 30, 166]);
  });

  it('measures the chassis width behind rack ears', () => {
    const parts = buildMeshAsset(
      [
        box('ears', [-241.3, 0, 0], [241.3, 44, 4], [0.1, 0.1, 0.1]),
        box('chassis', [-215, 0, -300], [215, 44, 0], [0.2, 0.2, 0.2]),
      ],
      { fileName: 'eared.stp', orientation: { front: '+z', up: '+y' }, omitHidden: false },
    ).parts;
    expect(widthBehind(parts, 6)).toBeCloseTo(430, 3);
  });
});

describe('imported STEP equipment in the rack', () => {
  const built = () =>
    buildMeshAsset(model(), {
      fileName: 'unit.stp',
      orientation: { front: '+z', up: '+y' },
      omitHidden: true,
    });
  const definition = (mount: 'ears' | 'shelf') =>
    stepDefinition({
      asset: built().asset,
      sizeMm: built().sizeMm,
      name: 'Imported unit',
      manufacturer: 'Example',
      model: 'STEP',
      mount,
      earOffsetMm: 4,
      setbackMm: 50,
      chassisWidthMm: 190,
      frontImage: null,
      rearImage: null,
    });

  it('stands an earless model on a shelf, set back from the shelf front on either face', () => {
    for (const face of ['front', 'rear'] as const) {
      const p = createWorkspaceProject(false);
      const unit = definition('shelf');
      expect(unit).toMatchObject({ mounting: 'freestanding', heightU: 1, shelfSetbackMm: 50 });
      p.definitions.push(unit);
      const shelf: Device = {
        id: 'shelf',
        definitionId: 'def-shelf-1',
        name: 'Shelf',
        startU: 5,
        face,
        supportId: null,
        installation: 'installed',
      };
      p.devices.push(shelf);
      const device: Device = {
        id: 'unit',
        definitionId: unit.id,
        name: 'Unit',
        startU: 5,
        face,
        supportId: 'shelf',
        installation: 'installed',
      };
      expect(placementIssues(p, device)).toEqual([]);
      p.devices.push(device);
      const bounds = deviceBounds(p, device);
      const z0 = origin(p.rack)[2];
      if (face === 'front') {
        expect(bounds.min[2]).toBeCloseTo(z0 + frontRailAt(p.rack, 5) + 50, 6);
        expect(bounds.max[2]).toBeCloseTo(z0 + frontRailAt(p.rack, 5) + 50 + 166, 6);
      } else {
        expect(bounds.max[2]).toBeCloseTo(z0 + rearRailAt(p.rack, 5) - 50, 6);
        expect(bounds.min[2]).toBeCloseTo(z0 + rearRailAt(p.rack, 5) - 50 - 166, 6);
      }
      // Without its shelf it is not placeable.
      expect(validatePlacement(p, { ...device, supportId: null })).toContain(
        'Freestanding equipment requires a shelf support.',
      );
      expect(parseProject(serializeProject(p)).definitions.at(-1)?.mesh?.triangles).toBe(36);
    }
  });

  it('mounts a model with ears on the rails, front offset for the ears and centred in its U', () => {
    const p = createWorkspaceProject(false);
    const unit = definition('ears');
    expect(unit).toMatchObject({
      mounting: 'direct',
      widthMm: 190,
      faceWidthMm: 200,
      depthMm: 162,
      earThicknessMm: 4,
    });
    expect(unit.mesh?.offsetMm).toEqual([0, 0, -4]);
    p.definitions.push(unit);
    for (const face of ['front', 'rear'] as const) {
      const device: Device = {
        id: `unit-${face}`,
        definitionId: unit.id,
        name: 'Unit',
        startU: 8,
        face,
        supportId: null,
        installation: 'installed',
      };
      const bounds = deviceBounds(p, device);
      const rail = origin(p.rack)[2] + (face === 'front' ? frontRailAt : rearRailAt)(p.rack, 8);
      // Ears and fascia lie 4 mm in front of the screw plane; the body is centred vertically.
      if (face === 'front') expect(bounds.min[2]).toBeCloseTo(rail - 4, 6);
      else expect(bounds.max[2]).toBeCloseTo(rail + 4, 6);
      expect((bounds.min[1] + bounds.max[1]) / 2).toBeCloseTo(7 * U_MM + U_MM / 2, 6);
    }
  });

  it('moves a shelf and its equipment together, including to another rack', () => {
    const p = createWorkspaceProject(false);
    p.additionalRacks = [{ ...p.rack, id: 'rack-b', name: 'Rack B', originMm: [650, 0, 0] }];
    const unit = definition('shelf');
    p.definitions.push(unit);
    p.devices.push(
      {
        id: 'shelf',
        definitionId: 'def-shelf-1',
        name: 'Shelf',
        startU: 5,
        face: 'front',
        supportId: null,
        installation: 'installed',
      },
      {
        id: 'unit',
        definitionId: unit.id,
        name: 'Unit',
        startU: 5,
        face: 'front',
        supportId: 'shelf',
        installation: 'installed',
      },
    );
    expect(supportRoot(p, p.devices[1]).id).toBe('shelf');
    const moved = { ...p.devices[0], startU: 9, face: 'rear' as const, rackId: 'rack-b' };
    expect(placementIssues(p, moved)).toEqual([]);
    const next = projectWithPlacement(p, moved);
    expect(next.devices.find((d) => d.id === 'unit')).toMatchObject({
      startU: 9,
      face: 'rear',
      rackId: 'rack-b',
      supportId: 'shelf',
    });
  });
});
