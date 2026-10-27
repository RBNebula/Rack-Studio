import { describe, expect, it } from 'vitest';
import { baseCable, createExampleProject } from '../testing/legacy-example';
import type { Cable, Port, Project, Vec3 } from '../model';
import { allObstacles, portWorld, segmentHitsBox } from './geometry';
import { routeCable } from './routing';
import { analyseProject } from './analysis';

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

/**
 * A switch's rear-facing IEC inlet feeding a PDU outlet that faces away from it: the free route
 * leaves each connector lead at well over 90 degrees, so the fillet needs more than a quarter of
 * a turn of tangent length. Regression for explicit radii being rejected while the identical
 * unknown-radius draft silently shrank its fillets.
 */
function powerHairpin(face: 'front' | 'rear', minBendRadiusMm: number | null) {
  const project = createExampleProject(false);
  project.devices = [
    {
      id: 'pdu',
      definitionId: 'def-pdu',
      name: 'PDU',
      startU: 1,
      face,
      supportId: null,
      installation: 'installed',
    },
    {
      id: 'sw',
      definitionId: 'def-generic-switch-24',
      name: 'Switch',
      startU: 10,
      face: 'front',
      supportId: null,
      installation: 'installed',
    },
  ];
  const cable: Cable = {
    ...baseCable('PWR'),
    type: 'Power',
    source: { kind: 'device', deviceId: 'sw', portId: 'power' },
    destination: { kind: 'device', deviceId: 'pdu', portId: 'iec1' },
    diameterMm: 7,
    clearanceMm: 3,
    minBendRadiusMm,
  };
  project.cables = [cable];
  return { project, cable, route: routeCable(project, cable) };
}
const segmentLength = (segment: { start: Vec3; end: Vec3 }) =>
  Math.hypot(...segment.end.map((v, i) => v - segment.start[i]));

describe('declared bend radii at connector leads', () => {
  it.each([
    ['front', 28, 783.2318, 133.98],
    ['front', 35, 807.7684, 136.34],
    ['front', 50, 860.0928, 141.54],
    ['rear', 28, 657.2966, 135.44],
    ['rear', 35, 672.2457, 135.67],
    ['rear', 50, 705.8527, 136.3],
  ] as const)(
    'routes a %s-mounted PDU outlet with an explicit %d mm radius at its full declared radius',
    (face, radius, lengthMm, outletBendDeg) => {
      const { project, cable, route } = powerHairpin(face, radius);
      expect(route.valid, route.issues.join('; ')).toBe(true);
      expect(route.issues).toEqual([]);
      expect(route.lengthMm).toBeCloseTo(lengthMm, 3);
      expect(route.minRadiusMm).toBeCloseTo(radius, 9);
      const arcs = route.segments.filter((s) => s.kind === 'arc');
      expect(arcs).toHaveLength(2);
      for (const arc of arcs) expect(arc.radiusMm).toBeCloseTo(radius, 9);
      // The outlet bend is sharper than 90 degrees, so it needs radius * tan(angle / 2) > radius.
      const outletArc = arcs[1];
      expect((outletArc.angleRadians * 180) / Math.PI).toBeCloseTo(outletBendDeg, 1);
      // Both connector leads keep a straight run of at least 25 mm along the port direction.
      const [first, last] = [route.segments[0], route.segments.at(-1)!];
      expect(first.kind).toBe('line');
      expect(last.kind).toBe('line');
      expect(segmentLength(first)).toBeGreaterThanOrEqual(25);
      expect(segmentLength(last)).toBeGreaterThanOrEqual(25);
      expect(first.start).toEqual(portWorld(project, cable.source));
      expect(last.end).toEqual(portWorld(project, cable.destination));
      // The PDU outlet faces -Z on the front and +Z on the rear; its lead runs straight out.
      const outlet = portWorld(project, cable.destination)!;
      const outward = face === 'front' ? -1 : 1;
      expect(last.start[0]).toBeCloseTo(outlet[0], 9);
      expect(last.start[1]).toBeCloseTo(outlet[1], 9);
      expect((last.start[2] - outlet[2]) * outward).toBeCloseTo(segmentLength(last), 9);
      expect(outlet).toEqual(face === 'front' ? [-160, 22.75, -2] : [160, 22.75, 702]);
    },
  );

  it.each(['front', 'rear'] as const)(
    'gives an explicit radius the same %s-face geometry as the unknown-radius draft of that size',
    (face) => {
      // Draft radius for a 7 mm cable is max(15, 4 x 7) = 28 mm.
      const explicit = powerHairpin(face, 28).route;
      const draft = powerHairpin(face, null).route;
      expect(draft.segments).toEqual(explicit.segments);
      expect(draft.points).toEqual(explicit.points);
      expect(draft.lengthMm).toBe(explicit.lengthMm);
      expect(draft.minRadiusMm).toBeCloseTo(28, 9);
      expect(explicit.valid).toBe(true);
      expect(draft.valid).toBe(true);
      expect(explicit.issues).toEqual([]);
      expect(draft.issues).toEqual([
        'Minimum bend radius is unknown; the displayed draft radius must be verified for this cable.',
      ]);
    },
  );

  it.each(['front', 'rear'] as const)(
    'still rejects a %s-face radius that cannot physically fit and keeps the cut unknown',
    (face) => {
      const { project, route } = powerHairpin(face, 400);
      expect(route.valid).toBe(false);
      expect(route.issues).toContain(
        'The 400.0 mm bend radius does not fit between adjacent routing constraints.',
      );
      expect(route.minRadiusMm!).toBeLessThan(400);
      const analysed = analyseProject(project).cables[0];
      expect(analysed.status).toBe('Route invalid');
      expect(analysed.requiredMm).toBeNull();
    },
  );

  it('does not hide a near-reversal behind an unbounded connector lead', () => {
    const { project, cable } = fixture();
    // Both connectors point away from each other along one line: no single fillet can join them.
    project.destinations[0].ports[0].direction = [0, 0, -1];
    project.destinations[1].ports[0].direction = [0, 0, 1];
    project.destinations[1].position = [1010, 100, 400];
    const route = routeCable(project, cable);
    expect(route.valid).toBe(false);
    expect(route.issues.join(' ')).toMatch(/bend radius.*does not fit|reversal/);
    // Leads stay no longer than the 400.1 mm straight distance between the connectors.
    expect(segmentLength(route.segments[0])).toBeLessThanOrEqual(400.2);
    expect(segmentLength(route.segments.at(-1)!)).toBeLessThanOrEqual(400.2);
  });
});
