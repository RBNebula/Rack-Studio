import { describe, expect, it } from 'vitest';
import { baseCable, createExampleProject } from '../examples';
import type { Cable, Port, Project, Vec3 } from '../model';
import { allObstacles, portWorld, segmentHitsBox } from './geometry';
import { routeCable } from './routing';

function fixture(): { project: Project; cable: Cable } {
  const project = createExampleProject(false);
  const port = (direction: Vec3): Port => ({
    id: 'p',
    name: 'Port',
    connector: 'Example',
    surface: 'custom',
    position: [0, 0, 0],
    direction,
    multiple: false,
  });
  project.destinations = [
    {
      id: 'a',
      name: 'A',
      location: '',
      notes: '',
      position: [1000, 100, 0],
      ports: [port([0, 0, 1])],
    },
    {
      id: 'b',
      name: 'B',
      location: '',
      notes: '',
      position: [1000, 100, 400],
      ports: [port([0, 0, -1])],
    },
  ];
  const cable: Cable = {
    ...baseCable('test'),
    source: { kind: 'external', destinationId: 'a', portId: 'p' },
    destination: { kind: 'external', destinationId: 'b', portId: 'p' },
    minBendRadiusMm: 20,
    diameterMm: 6,
    clearanceMm: 3,
  };
  return { project, cable };
}
const closePoint = (a: Vec3, b: Vec3): boolean =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6;

describe('deterministic geometric cable routing', () => {
  it('preserves connectors, straight leads and exact straight length', () => {
    const { project, cable } = fixture(),
      route = routeCable(project, cable);
    expect(route.valid).toBe(true);
    expect(route.issues).toEqual([]);
    expect(route.lengthMm).toBeCloseTo(400, 9);
    expect(route.points[0]).toEqual([1000, 100, 0]);
    expect(route.points.at(-1)).toEqual([1000, 100, 400]);
    expect(route.points.every((p) => p[0] === 1000 && p[1] === 100)).toBe(true);
  });

  it('flags unknown bend data as an advisory while retaining the checked geometric route', () => {
    const { project, cable } = fixture();
    cable.minBendRadiusMm = null;
    const route = routeCable(project, cable);
    expect(route.valid).toBe(true);
    expect(route.points.length).toBeGreaterThan(1);
    expect(route.issues.join(' ')).toContain('bend radius is unknown');
  });

  it('rounds a manual route with circular fillets while retaining every explicit anchor', () => {
    const { project, cable } = fixture();
    cable.waypoints = [[1200, 100, 200]];
    const route = routeCable(project, cable);
    expect(route.valid, route.issues.join('; ')).toBe(true);
    expect(route.points.some((p) => closePoint(p, cable.waypoints[0]))).toBe(true);
    expect(route.points.length).toBeGreaterThan(20);
    expect(route.minRadiusMm).toBeCloseTo(20, 6);
    expect(route.lengthMm).toBeGreaterThan(400);
    expect(routeCable(project, cable)).toEqual(route);
  });

  it('automatically proposes a route around an obstruction and checks the final smoothed cable envelope', () => {
    const { project, cable } = fixture();
    project.accessories = [
      {
        id: 'block',
        name: 'Obstruction',
        position: [1000, 100, 200],
        size: [100, 100, 100],
        kind: 'obstruction',
        parentId: null,
        cableIds: [],
        evidence: 'example',
      },
    ];
    const route = routeCable(project, cable);
    expect(route.valid, route.issues.join('; ')).toBe(true);
    expect(route.lengthMm).toBeGreaterThan(400);
    const boxes = allObstacles(project);
    expect(
      route.points
        .slice(1)
        .some((p, i) =>
          boxes.some((b) =>
            segmentHitsBox(route.points[i], p, b, cable.diameterMm / 2 + cable.clearanceMm),
          ),
        ),
    ).toBe(false);
    expect(routeCable(project, cable).points).toEqual(route.points);
  });

  it('retains an obstructed explicit waypoint and rejects the route instead of smoothing through equipment', () => {
    const { project, cable } = fixture();
    cable.waypoints = [[1000, 100, 200]];
    project.accessories = [
      {
        id: 'block',
        name: 'Obstruction',
        position: [1000, 100, 200],
        size: [100, 100, 100],
        kind: 'obstruction',
        parentId: null,
        cableIds: [],
        evidence: 'example',
      },
    ];
    const route = routeCable(project, cable);
    expect(route.valid).toBe(false);
    expect(route.issues.join(' ')).toContain('Cable envelope intersects accessory:block');
    expect(route.points.some((p) => closePoint(p, cable.waypoints[0]))).toBe(true);
  });

  it('invalidates bend radii that cannot fit rather than silently shrinking the requirement', () => {
    const { project, cable } = fixture();
    cable.minBendRadiusMm = 100;
    cable.waypoints = [
      [1005, 100, 20],
      [1010, 100, 25],
    ];
    const route = routeCable(project, cable);
    expect(route.valid).toBe(false);
    expect(route.issues.join(' ')).toMatch(/bend radius.*does not fit|bend tangent|reversal/);
  });

  it('allows only the connector lead to cross its owning chassis and recomputes moved endpoint geometry', () => {
    const { project, cable } = fixture();
    project.devices = [
      {
        id: 'switch',
        definitionId: 'def-switch',
        name: 'Switch',
        startU: 4,
        face: 'front',
        supportId: null,
        installation: 'installed',
      },
    ];
    cable.source = { kind: 'device', deviceId: 'switch', portId: 'p1' };
    project.destinations[1].position = [-178, 155.1, -400];
    project.destinations[1].ports[0].direction = [0, 0, 1];
    const first = routeCable(project, cable);
    expect(first.valid, first.issues.join('; ')).toBe(true);
    expect(first.points[0]).toEqual(portWorld(project, cable.source));
    project.devices[0].startU = 5;
    const moved = routeCable(project, cable);
    expect(moved.points[0][1] - first.points[0][1]).toBeCloseTo(44.45, 9);
    expect(moved.lengthMm).not.toBe(first.lengthMm);
  });

  it('rejects missing or unpositioned endpoints and zero connector directions', () => {
    const { project, cable } = fixture();
    project.destinations[1].position = null;
    expect(routeCable(project, cable).issues.join(' ')).toContain('Both endpoints');
    project.destinations[1].position = [1000, 100, 400];
    project.destinations[1].ports[0].direction = [0, 0, 0];
    expect(routeCable(project, cable).valid).toBe(false);
    expect(routeCable(project, cable).issues.join(' ')).toContain('direction is missing or zero');
  });

  it('honours rack exits and shared loom waypoints and reports a deleted exit', () => {
    const { project, cable } = fixture();
    project.exits = [
      {
        id: 'exit',
        name: 'Exit',
        position: [1000, 100, 300],
        size: [40, 40],
        direction: [0, 0, 1],
        evidence: 'example',
      },
    ];
    project.looms = [
      {
        id: 'loom',
        name: 'Loom',
        cableIds: [cable.id, 'second'],
        waypoints: [[1000, 100, 200]],
        packingFactor: 1.3,
      },
    ];
    cable.exitId = 'exit';
    const route = routeCable(project, cable);
    expect(route.points.some((p) => closePoint(p, [1000, 100, 200]))).toBe(true);
    expect(route.points.some((p) => closePoint(p, project.exits[0].position))).toBe(true);
    cable.exitId = 'deleted';
    expect(routeCable(project, cable).issues.join(' ')).toContain(
      'selected rack exit does not exist',
    );
  });

  it('keeps a logical external destination independent of the known rack-side route', () => {
    const { project, cable } = fixture();
    project.destinations[1].position = null;
    project.exits = [
      {
        id: 'exit',
        name: 'Exit',
        position: [1000, 100, 300],
        size: [40, 40],
        direction: [0, 0, 1],
        evidence: 'example',
      },
    ];
    cable.exitId = 'exit';
    const route = routeCable(project, cable);
    expect(route.valid, route.issues.join('; ')).toBe(true);
    expect(route.points.at(-1)).toEqual([1000, 100, 300]);
    expect(route.lengthMm).toBeCloseTo(300, 9);
    expect(route.issues.join(' ')).toContain('External route is not modelled');
  });

  it('produces finite, endpoint-preserving diagnostics for the populated generic example', () => {
    const project = createExampleProject();
    for (const cable of project.cables) {
      const route = routeCable(project, cable);
      expect(route.points.length).toBeGreaterThan(1);
      expect(route.points[0]).toEqual(portWorld(project, cable.source));
      expect(route.points.every((p) => p.every(Number.isFinite))).toBe(true);
      expect(Number.isFinite(route.lengthMm)).toBe(true);
      expect(route.lengthMm).toBeGreaterThan(0);
      expect(route.issues.join(' ')).toContain('bend radius is unknown');
    }
  });
});
