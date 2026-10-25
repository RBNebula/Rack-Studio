import { describe, expect, it } from 'vitest';
import { baseCable, createExampleProject } from '../examples';
import type { Cable, Port, Project, Vec3 } from '../model';
import { allObstacles, portWorld, segmentHitsBox } from './geometry';
import {
  createParallelFollowRun,
  routeSegmentLength,
  routeSegmentPoint,
  routeSegmentTangent,
  segmentDistanceMm,
} from './follow-run';
import type { ArcRouteSegment, RouteSegment } from './follow-run';
import { routeCable } from './routing';

const near = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const insideArc: ArcRouteSegment = {
  kind: 'arc',
  start: [-50, 0, 0],
  end: [0, 0, 50],
  center: [0, 0, 0],
  normal: [0, 1, 0],
  radiusMm: 50,
  angleRadians: Math.PI / 2,
};

function fixture(): { project: Project; reference: Cable; follower: Cable } {
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
      id: 'ref-a',
      name: 'Reference A',
      location: '',
      notes: '',
      position: [1000, 100, 0],
      ports: [port([0, 0, 1])],
    },
    {
      id: 'ref-b',
      name: 'Reference B',
      location: '',
      notes: '',
      position: [1000, 100, 1000],
      ports: [port([0, 0, -1])],
    },
    {
      id: 'follow-a',
      name: 'Follower A',
      location: '',
      notes: '',
      position: [1050, 100, 0],
      ports: [port([0, 0, 1])],
    },
    {
      id: 'follow-b',
      name: 'Follower B',
      location: '',
      notes: '',
      position: [1050, 100, 1000],
      ports: [port([0, 0, -1])],
    },
  ];
  const reference: Cable = {
    ...baseCable('reference'),
    source: { kind: 'external', destinationId: 'ref-a', portId: 'p' },
    destination: { kind: 'external', destinationId: 'ref-b', portId: 'p' },
    minBendRadiusMm: 20,
  };
  const follower: Cable = {
    ...baseCable('follower'),
    source: { kind: 'external', destinationId: 'follow-a', portId: 'p' },
    destination: { kind: 'external', destinationId: 'follow-b', portId: 'p' },
    minBendRadiusMm: 20,
    followCableId: reference.id,
  };
  project.cables = [reference, follower];
  return { project, reference, follower };
}

describe('exact geometric parallel run', () => {
  it('slices a straight run at the requested arc-length percentages with physical separation', () => {
    const run = createParallelFollowRun({
      segments: [{ kind: 'line', start: [0, 0, 0], end: [0, 0, 1000] }],
      startPercent: 15,
      endPercent: 85,
      offsetMm: 9,
      minimumOffsetMm: 9,
      minimumBendRadiusMm: 20,
    });
    expect(run.valid).toBe(true);
    expect(run.points).toEqual([
      [9, 0, 150],
      [9, 0, 850],
    ]);
    expect(run.lengthMm).toBe(700);
    expect(run.startTangent).toEqual([0, 0, 1]);
    expect(run.endTangent).toEqual([0, 0, 1]);
  });

  it('preserves a circular run as a circle with an exact offset radius and arc length', () => {
    const run = createParallelFollowRun({
      segments: [insideArc],
      startPercent: 25,
      endPercent: 75,
      offsetMm: 10,
      minimumOffsetMm: 9,
      minimumBendRadiusMm: 30,
    });
    expect(run.valid, run.issues.join('; ')).toBe(true);
    expect(run.segments).toHaveLength(1);
    expect(run.minRadiusMm).toBeCloseTo(40, 9);
    expect(run.lengthMm).toBeCloseTo(10 * Math.PI, 9);
    for (const point of run.points) expect(Math.hypot(...point)).toBeCloseTo(40, 8);
    expect(run.points.length).toBeGreaterThan(10);
  });

  it('parallel-transports the same normal through line/arc/line joins without flipping', () => {
    const segments: RouteSegment[] = [
      { kind: 'line', start: [-50, 0, -100], end: [-50, 0, 0] },
      insideArc,
      { kind: 'line', start: [0, 0, 50], end: [100, 0, 50] },
    ];
    const run = createParallelFollowRun({
      segments,
      startPercent: 0,
      endPercent: 100,
      offsetMm: 10,
      minimumOffsetMm: 9,
      minimumBendRadiusMm: 30,
    });
    expect(run.valid, run.issues.join('; ')).toBe(true);
    expect(run.points[0]).toEqual([-40, 0, -100]);
    expect(run.points.at(-1)).toEqual([100, 0, 40]);
    for (let index = 1; index < run.segments.length; index++) {
      expect(near(run.segments[index - 1].end, run.segments[index].start)).toBe(true);
      expect(
        dot(
          routeSegmentTangent(run.segments[index - 1], 1),
          routeSegmentTangent(run.segments[index], 0),
        ),
      ).toBeCloseTo(1, 9);
    }
  });

  it('rejects an offset that makes an inside bend tighter than the target specification', () => {
    const run = createParallelFollowRun({
      segments: [insideArc],
      startPercent: 0,
      endPercent: 100,
      offsetMm: 10,
      minimumOffsetMm: 9,
      minimumBendRadiusMm: 45,
    });
    expect(run.valid).toBe(false);
    expect(run.minRadiusMm).toBeCloseTo(40, 9);
    expect(run.issues.join(' ')).toContain('below');
  });

  it('rejects a collapsed bend, invalid ranges, too-small offsets and discontinuous source geometry', () => {
    const input = {
      segments: [insideArc],
      startPercent: 0,
      endPercent: 100,
      offsetMm: 10,
      minimumOffsetMm: 9,
      minimumBendRadiusMm: 20,
    };
    expect(createParallelFollowRun({ ...input, offsetMm: 60 }).issues.join(' ')).toContain(
      'collapses',
    );
    expect(createParallelFollowRun({ ...input, startPercent: 80, endPercent: 20 }).valid).toBe(
      false,
    );
    expect(createParallelFollowRun({ ...input, startPercent: 50, endPercent: 50 }).valid).toBe(
      false,
    );
    expect(createParallelFollowRun({ ...input, offsetMm: 5 }).issues.join(' ')).toContain(
      'at least',
    );
    expect(
      createParallelFollowRun({
        ...input,
        segments: [
          { kind: 'line', start: [0, 0, 0], end: [0, 0, 100] },
          { kind: 'line', start: [0, 0, 101], end: [0, 0, 200] },
        ],
      }).issues.join(' '),
    ).toContain('discontinuous');
  });

  it('measures finite segment separation in crossing, parallel and degenerate cases', () => {
    expect(segmentDistanceMm([0, 0, 0], [10, 0, 0], [5, -5, 0], [5, 5, 0])).toBe(0);
    expect(segmentDistanceMm([0, 0, 0], [10, 0, 0], [0, 9, 0], [10, 9, 0])).toBe(9);
    expect(segmentDistanceMm([0, 0, 0], [0, 0, 0], [3, 4, 0], [3, 4, 0])).toBe(5);
    expect(segmentDistanceMm([0, 0, 0], [10, 0, 0], [20, 4, 0], [30, 4, 0])).toBeCloseTo(
      Math.sqrt(116),
      9,
    );
  });
});

describe('follow-existing-cable routing integration', () => {
  it('retains exact target endpoints, distinct parallel shared geometry and tangent endpoint breakouts', () => {
    const { project, follower } = fixture();
    const route = routeCable(project, follower);
    expect(route.valid, route.issues.join('; ')).toBe(true);
    expect(route.points[0]).toEqual([1050, 100, 0]);
    expect(route.points.at(-1)).toEqual([1050, 100, 1000]);
    expect(route.followedRun?.sharedPoints).toEqual([
      [1009, 100, 150],
      [1009, 100, 850],
    ]);
    expect(route.points.some((point) => near(point, [1009, 100, 150]))).toBe(true);
    expect(route.points.some((point) => near(point, [1009, 100, 850]))).toBe(true);
    expect(route.lengthMm).toBeGreaterThan(1000);
    expect(route.minRadiusMm).toBeCloseTo(20, 8);
    for (let index = 1; index < route.segments.length; index++) {
      expect(
        dot(
          routeSegmentTangent(route.segments[index - 1], 1),
          routeSegmentTangent(route.segments[index], 0),
        ),
      ).toBeCloseTo(1, 6);
    }
    const boxes = allObstacles(project);
    expect(
      route.points
        .slice(1)
        .some((point, index) =>
          boxes.some((box) => segmentHitsBox(route.points[index], point, box, 6)),
        ),
    ).toBe(false);
  });

  it('keeps explicit target waypoints in their original order on endpoint breakouts', () => {
    const { project, follower } = fixture();
    follower.followStartPercent = 30;
    follower.followEndPercent = 70;
    follower.waypoints = [
      [1050, 100, 150],
      [1050, 100, 850],
    ];
    const route = routeCable(project, follower);
    expect(route.valid, route.issues.join('; ')).toBe(true);
    const indices = follower.waypoints.map((waypoint) =>
      route.points.findIndex((point) => near(point, waypoint)),
    );
    expect(indices.every((index) => index >= 0)).toBe(true);
    expect(indices[1]).toBeGreaterThan(indices[0]);
    expect(route.followedRun?.sharedPoints).toEqual([
      [1009, 100, 300],
      [1009, 100, 700],
    ]);
  });

  it('evaluates the source again after its positioned endpoints move', () => {
    const { project, follower } = fixture();
    const original = routeCable(project, follower);
    project.destinations[0].position![0] += 10;
    project.destinations[1].position![0] += 10;
    const moved = routeCable(project, follower);
    expect(moved.valid, moved.issues.join('; ')).toBe(true);
    expect(moved.followedRun!.sharedPoints[0][0] - original.followedRun!.sharedPoints[0][0]).toBe(
      10,
    );
    expect(moved.points[0]).toEqual(original.points[0]);
    expect(moved.points.at(-1)).toEqual(original.points.at(-1));
    expect(moved.lengthMm).not.toBe(original.lengthMm);
  });

  it('recomputes a shared run after moving the device that supplies its port anchor', () => {
    const { project, reference, follower } = fixture();
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
    reference.source = { kind: 'device', deviceId: 'switch', portId: 'p1' };
    follower.source = { kind: 'device', deviceId: 'switch', portId: 'p2' };
    project.destinations[1].position = [-178, 155.1, -1002];
    project.destinations[1].ports[0].direction = [0, 0, 1];
    project.destinations[3].position = [-162.5, 155.1, -1002];
    project.destinations[3].ports[0].direction = [0, 0, 1];
    const original = routeCable(project, follower);
    expect(original.valid, original.issues.join('; ')).toBe(true);
    project.devices[0].startU = 5;
    const moved = routeCable(project, follower);
    expect(moved.valid, moved.issues.join('; ')).toBe(true);
    expect(moved.points[0]).toEqual(portWorld(project, follower.source));
    expect(moved.points[0][1] - original.points[0][1]).toBeCloseTo(44.45, 8);
    expect(moved.followedRun!.sharedPoints).not.toEqual(original.followedRun!.sharedPoints);
  });

  it('assigns sibling followers distinct automatic lanes', () => {
    const { project, follower } = fixture();
    const second = { ...structuredClone(follower), id: 'follower-z' };
    project.cables.push(second);
    const a = routeCable(project, follower),
      b = routeCable(project, second);
    expect(a.valid, a.issues.join('; ')).toBe(true);
    expect(b.valid, b.issues.join('; ')).toBe(true);
    expect(a.followedRun!.offsetMm).toBe(9);
    expect(b.followedRun!.offsetMm).toBe(18);
    expect(b.followedRun!.sharedPoints[0][0] - a.followedRun!.sharedPoints[0][0]).toBe(9);
  });

  it('rejects cycles, self-following, missing references and invalid source routes without falling back', () => {
    const { project, reference, follower } = fixture();
    reference.followCableId = follower.id;
    expect(routeCable(project, follower).issues.join(' ')).toContain('Circular');
    reference.followCableId = null;
    follower.followCableId = follower.id;
    expect(routeCable(project, follower).valid).toBe(false);
    follower.followCableId = 'missing';
    expect(routeCable(project, follower).issues.join(' ')).toContain('missing');
    follower.followCableId = reference.id;
    reference.source.portId = 'missing-port';
    const invalid = routeCable(project, follower);
    expect(invalid.valid).toBe(false);
    expect(invalid.points).toEqual([]);
    expect(invalid.issues.join(' ')).toContain('followed cable reference has an invalid route');
  });

  it('detects a deeply malformed follow cycle without overflowing the call stack', () => {
    const { project, reference } = fixture();
    project.cables = Array.from({ length: 12000 }, (_, index) => ({
      ...reference,
      id: `cycle-${index}`,
      followCableId: `cycle-${(index + 1) % 12000}`,
    }));
    const route = routeCable(project, project.cables[0]);
    expect(route.valid).toBe(false);
    expect(route.issues.join(' ')).toContain('Circular');
  });

  it('keeps a blocked offset shared section invalid instead of silently rerouting it', () => {
    const { project, reference, follower } = fixture();
    follower.followOffsetMm = 40;
    project.accessories = [
      {
        id: 'offset-block',
        name: 'Offset obstruction',
        position: [1040, 100, 500],
        size: [2, 20, 100],
        kind: 'obstruction',
        parentId: null,
        cableIds: [],
        evidence: 'verified',
      },
    ];
    expect(routeCable(project, reference).valid).toBe(true);
    const route = routeCable(project, follower);
    expect(route.valid).toBe(false);
    expect(route.followedRun?.sharedPoints).toEqual([
      [1040, 100, 150],
      [1040, 100, 850],
    ]);
    expect(route.issues.join(' ')).toContain('accessory:offset-block');
  });

  it('rejects undersized offsets and breakouts whose bend radius cannot fit', () => {
    const { project, follower } = fixture();
    follower.followOffsetMm = 5;
    expect(routeCable(project, follower).issues.join(' ')).toContain('at least 9');
    follower.followOffsetMm = null;
    follower.minBendRadiusMm = 500;
    const tight = routeCable(project, follower);
    expect(tight.valid).toBe(false);
    expect(tight.issues.join(' ')).toMatch(/bend radius.*does not fit|reversal|continuous tangent/);
  });

  it('retains analytic circular shared geometry without refilleting its dense rendered samples', () => {
    const { project, reference, follower } = fixture();
    reference.waypoints = [[1200, 100, 500]];
    follower.followStartPercent = 30;
    follower.followEndPercent = 70;
    follower.followOffsetMm = 30;
    follower.minBendRadiusMm = 5;
    const source = routeCable(project, reference);
    expect(source.valid, source.issues.join('; ')).toBe(true);
    const route = routeCable(project, follower);
    expect(route.valid, route.issues.join('; ')).toBe(true);
    expect(route.followedRun).toBeDefined();
    const shared = createParallelFollowRun({
      segments: source.segments,
      startPercent: 30,
      endPercent: 70,
      offsetMm: 30,
      minimumOffsetMm: 9,
      minimumBendRadiusMm: 5,
    });
    expect(shared.segments.some((segment) => segment.kind === 'arc')).toBe(true);
    expect(route.followedRun!.sharedPoints).toEqual(shared.points);
    expect(shared.lengthMm).toBeCloseTo(
      shared.segments.reduce((sum, segment) => sum + routeSegmentLength(segment), 0),
      8,
    );
    for (const segment of shared.segments.filter((part) => part.kind === 'arc')) {
      const middle = routeSegmentPoint(segment, 0.5);
      expect(
        Math.hypot(
          middle[0] - segment.center[0],
          middle[1] - segment.center[1],
          middle[2] - segment.center[2],
        ),
      ).toBeCloseTo(segment.radiusMm, 7);
    }
  });
});
