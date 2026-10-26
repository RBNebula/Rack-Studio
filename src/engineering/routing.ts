import type { Cable, Endpoint, Project, Vec3 } from '../model';
import { allObstacles, portDirectionWorld, portWorld, segmentHitsBox } from './geometry';
import type { Obstacle } from './geometry';
import {
  createParallelFollowRun,
  routeSegmentPoint,
  routeSegmentTangent,
  sampleRouteSegments,
  segmentDistanceMm,
} from './follow-run';
import type { RouteSegment, SampledRouteChord } from './follow-run';
import { resolveGuideLinks } from './wiring';
import { positionedEndpoint } from './external';

export interface FollowedRunInfo {
  referenceCableId: string;
  startPercent: number;
  endPercent: number;
  offsetMm: number;
  sharedPoints: Vec3[];
}
export interface CableRoute {
  points: Vec3[];
  segments: RouteSegment[];
  lengthMm: number;
  valid: boolean;
  issues: string[];
  minRadiusMm: number | null;
  followedRun?: FollowedRunInfo;
}
const EPS = 1e-7;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, n: number): Vec3 => [a[0] * n, a[1] * n, a[2] * n];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): number => Math.hypot(...a);
const distance = (a: Vec3, b: Vec3): number => norm(sub(a, b));
const unit = (a: Vec3): Vec3 => (norm(a) > EPS ? mul(a, 1 / norm(a)) : [0, 0, 0]);
const near = (a: Vec3, b: Vec3): boolean => distance(a, b) < EPS;
const ownerPrefix = (endpoint: Endpoint): string | null =>
  endpoint.kind === 'device' ? `device:${endpoint.deviceId}:` : null;
const isOwner = (box: Obstacle, prefix: string | null): boolean =>
  prefix !== null && box.id.startsWith(prefix);
const freeSegment = (a: Vec3, b: Vec3, boxes: Obstacle[], margin: number): boolean =>
  !boxes.some((box) => segmentHitsBox(a, b, box, margin));

function pointInside(point: Vec3, box: Obstacle, margin: number): boolean {
  return point.every((v, i) => v >= box.min[i] - margin && v <= box.max[i] + margin);
}

function endpointDirectionIssue(project: Project, endpoint: Endpoint): string | null {
  const port =
    endpoint.kind === 'device'
      ? project.definitions
          .find(
            (definition) =>
              definition.id ===
              project.devices.find((d) => d.id === endpoint.deviceId)?.definitionId,
          )
          ?.ports.find((p) => p.id === endpoint.portId)
      : project.destinations
          .find((d) => d.id === endpoint.destinationId)
          ?.ports.find((p) => p.id === endpoint.portId);
  if (!port || norm(port.direction) < EPS) return 'Connector direction is missing or zero.';
  const surfaces: Record<string, Vec3> = {
    front: [0, 0, -1],
    rear: [0, 0, 1],
    left: [-1, 0, 0],
    right: [1, 0, 0],
  };
  if (port.surface !== 'custom' && dot(unit(port.direction), surfaces[port.surface]) <= EPS) {
    return `Connector ${port.name} points into its declared ${port.surface} surface.`;
  }
  return null;
}

/** An outward connector lead exits the owning chassis before any free routing. */
function leadPoint(
  point: Vec3,
  direction: Vec3,
  ownBoxes: Obstacle[],
  margin: number,
  radius: number,
): Vec3 {
  let length = Math.max(25, 2 * radius + margin + 2);
  for (const box of ownBoxes) {
    if (!pointInside(point, box, margin + radius)) continue;
    let exit = Number.POSITIVE_INFINITY;
    for (let axis = 0; axis < 3; axis++) {
      if (direction[axis] > EPS)
        exit = Math.min(exit, (box.max[axis] + margin + radius - point[axis]) / direction[axis]);
      if (direction[axis] < -EPS)
        exit = Math.min(exit, (box.min[axis] - margin - radius - point[axis]) / direction[axis]);
    }
    if (Number.isFinite(exit)) length = Math.max(length, exit + radius + 2);
  }
  return add(point, mul(direction, length));
}

/** Minimum straight connector run before a lead bend: clear of the owning chassis envelope. */
function leadStraight(point: Vec3, direction: Vec3, ownBoxes: Obstacle[], margin: number): number {
  let straight = 25;
  for (const box of ownBoxes) {
    let enter = Number.NEGATIVE_INFINITY,
      exit = Number.POSITIVE_INFINITY;
    for (let axis = 0; axis < 3; axis++) {
      const low = box.min[axis] - margin,
        high = box.max[axis] + margin;
      if (Math.abs(direction[axis]) <= EPS) {
        if (point[axis] < low || point[axis] > high) exit = Number.NEGATIVE_INFINITY;
        continue;
      }
      const a = (low - point[axis]) / direction[axis],
        b = (high - point[axis]) / direction[axis];
      enter = Math.max(enter, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
    }
    if (exit >= Math.max(enter, 0)) straight = Math.max(straight, exit + 2);
  }
  return straight;
}

/** Straight connector runs that a lead fillet must leave intact, keyed by route end. */
interface LeadStraights {
  start?: number;
  end?: number;
}

/**
 * Length the fillet at a connector lead may consume. Interior segments share 49 % with each
 * neighbouring fillet; a lead's other end is the connector itself, which has no fillet, so the
 * fillet may also use everything beyond the required straight connector run.
 */
const leadAllowance = (length: number, straight: number | undefined): number =>
  straight === undefined ? length * 0.49 : Math.max(length * 0.49, length - straight);

/**
 * Lengthen a connector lead along its own direction when the bend leaving it needs a longer
 * tangent than the lead provides. The extension must itself be clear of every obstacle and no
 * longer than the straight distance between the route ends, so a near-reversal stays reported.
 */
function extendedLead(
  port: Vec3,
  lead: Vec3,
  next: Vec3 | undefined,
  straight: number | undefined,
  radius: number,
  boxes: Obstacle[],
  margin: number,
  maxLength: number,
): Vec3 {
  if (straight === undefined || !next) return lead;
  const direction = unit(sub(lead, port)),
    angle = Math.acos(Math.max(-1, Math.min(1, dot(direction, unit(sub(next, lead))))));
  if (angle < 1e-6 || Math.PI - angle < 1e-5) return lead;
  const tangent = radius * Math.tan(angle / 2),
    length = distance(port, lead);
  if (tangent <= leadAllowance(length, straight) + 1e-9) return lead;
  const extendedLength = straight + tangent + 1;
  if (extendedLength > maxLength) return lead;
  const extended = add(port, mul(direction, extendedLength));
  return freeSegment(lead, extended, boxes, margin) ? extended : lead;
}

/** Visibility graph over inflated box corners; deterministic Euclidean Dijkstra. */
function routeLeg(
  start: Vec3,
  end: Vec3,
  boxes: Obstacle[],
  margin: number,
  radius: number,
): Vec3[] | null {
  if (near(start, end)) return [start];
  const inflated = margin + radius + 1;
  if (freeSegment(start, end, boxes, inflated)) return [start, end];
  const nodes: Vec3[] = [start, end];
  const seen = new Set<string>(nodes.map((n) => n.join(',')));
  for (const box of boxes) {
    for (const x of [box.min[0] - inflated - 1, box.max[0] + inflated + 1]) {
      for (const y of [box.min[1] - inflated - 1, box.max[1] + inflated + 1]) {
        for (const z of [box.min[2] - inflated - 1, box.max[2] + inflated + 1]) {
          const point: Vec3 = [x, y, z],
            key = point.join(',');
          if (!seen.has(key) && !boxes.some((b) => pointInside(point, b, inflated))) {
            nodes.push(point);
            seen.add(key);
          }
        }
      }
    }
  }
  // A cap bounds pathological imported scenes. Failure remains visible and invalid.
  if (nodes.length > 1800) return null;
  const costs = nodes.map(() => Number.POSITIVE_INFINITY),
    previous = nodes.map(() => -1),
    visited = nodes.map(() => false);
  costs[0] = 0;
  for (let pass = 0; pass < nodes.length; pass++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++)
      if (
        !visited[i] &&
        Number.isFinite(costs[i]) &&
        (current < 0 || costs[i] < costs[current] - EPS)
      )
        current = i;
    if (current < 0) break;
    if (current === 1) {
      const path: Vec3[] = [];
      let cursor = 1;
      while (cursor !== -1) {
        path.push(nodes[cursor]);
        cursor = previous[cursor];
      }
      return path.reverse();
    }
    visited[current] = true;
    for (let next = 0; next < nodes.length; next++) {
      if (visited[next]) continue;
      const proposed = costs[current] + distance(nodes[current], nodes[next]);
      if (proposed >= costs[next] - EPS) continue;
      // Endpoints can lie within the extra bend buffer. Actual clearance still applies.
      const localMargin = current === 0 || next === 1 ? margin : inflated;
      if (freeSegment(nodes[current], nodes[next], boxes, localMargin)) {
        costs[next] = proposed;
        previous[next] = current;
      }
    }
  }
  return null;
}

interface Fillet {
  entry: Vec3;
  exit: Vec3;
  center: Vec3;
  normal: Vec3;
  angle: number;
  radius: number;
}
interface Rounded {
  points: Vec3[];
  sagittas: number[];
  length: number;
  radius: number | null;
  segments: RouteSegment[];
}

function roundedPath(
  raw: Vec3[],
  radius: number,
  issues: string[],
  protectedPoints: Vec3[],
  enforceRadius: boolean,
  straights: LeadStraights = {},
): Rounded {
  const points = raw.filter((p, i) => !i || !near(p, raw[i - 1]));
  const fillets = new Map<number, Fillet>();
  for (let i = 1; i < points.length - 1; i++) {
    const u = unit(sub(points[i], points[i - 1])),
      v = unit(sub(points[i + 1], points[i]));
    const cosine = Math.max(-1, Math.min(1, dot(u, v))),
      angle = Math.acos(cosine);
    if (angle < 1e-6) continue;
    if (protectedPoints.some((p) => near(p, points[i]))) {
      issues.push(
        'A fixed waypoint cannot retain its position and the requested bend tangent; move it to provide space.',
      );
      continue;
    }
    if (Math.PI - angle < 1e-5) {
      issues.push('A route contains a 180-degree reversal that cannot be filleted.');
      continue;
    }
    const available = Math.min(
      leadAllowance(distance(points[i - 1], points[i]), i === 1 ? straights.start : undefined),
      leadAllowance(
        distance(points[i], points[i + 1]),
        i === points.length - 2 ? straights.end : undefined,
      ),
    );
    const required = radius * Math.tan(angle / 2);
    const tangent = Math.min(required, available);
    const actualRadius = tangent / Math.tan(angle / 2);
    if (enforceRadius && actualRadius + 1e-5 < radius)
      issues.push(
        `The ${radius.toFixed(1)} mm bend radius does not fit between adjacent routing constraints.`,
      );
    const entry = sub(points[i], mul(u, tangent)),
      exit = add(points[i], mul(v, tangent));
    const normal = unit(cross(u, v)),
      center = add(entry, mul(unit(cross(normal, u)), actualRadius));
    fillets.set(i, { entry, exit, center, normal, angle, radius: actualRadius });
  }
  const segments: RouteSegment[] = [];
  let previous = points[0];
  for (let i = 1; i < points.length; i++) {
    const fillet = fillets.get(i);
    const entry = fillet?.entry ?? points[i];
    if (!near(previous, entry)) segments.push({ kind: 'line', start: previous, end: entry });
    previous = entry;
    if (!fillet) continue;
    segments.push({
      kind: 'arc',
      start: fillet.entry,
      end: fillet.exit,
      center: fillet.center,
      normal: fillet.normal,
      radiusMm: fillet.radius,
      angleRadians: fillet.angle,
    });
    previous = fillet.exit;
  }
  const sampled = sampleRouteSegments(segments);
  return {
    points: sampled.points,
    sagittas: sampled.sagittas,
    length: sampled.lengthMm,
    radius: sampled.minRadiusMm,
    segments,
  };
}

function routeBetween(
  start: Vec3,
  firstLead: Vec3,
  lastLead: Vec3,
  end: Vec3,
  fixed: Vec3[],
  boxes: Obstacle[],
  margin: number,
  radius: number,
  enforceRadius: boolean,
  issues: string[],
  lines: [Vec3, Vec3][] = [],
  straights: LeadStraights = {},
): Rounded {
  const rawPath = (first: Vec3, last: Vec3, legIssues: string[]): Vec3[] => {
    const anchors = [first, ...fixed, last];
    const incoming: Vec3[] = [],
      outgoing: Vec3[] = [];
    for (let i = 0; i < anchors.length; i++) {
      if (!i || i === anchors.length - 1) {
        incoming.push(anchors[i]);
        outgoing.push(anchors[i]);
        continue;
      }
      const line = lines.find(([a, b]) => near(a, anchors[i]) || near(b, anchors[i]));
      const tangent = line
        ? unit(sub(line[1], line[0]))
        : unit(sub(anchors[i + 1], anchors[i - 1]));
      const reach = Math.min(
        radius * 2 + margin + 2,
        distance(anchors[i - 1], anchors[i]) * 0.24,
        distance(anchors[i], anchors[i + 1]) * 0.24,
      );
      if (norm(tangent) < EPS || reach < EPS)
        legIssues.push('Coincident or reversing waypoints leave no usable bend tangent.');
      incoming.push(sub(anchors[i], mul(tangent, reach)));
      outgoing.push(add(anchors[i], mul(tangent, reach)));
    }
    const raw: Vec3[] = [start, first];
    for (let i = 0; i < anchors.length - 1; i++) {
      const path = routeLeg(outgoing[i], incoming[i + 1], boxes, margin, radius);
      if (path) raw.push(...path.slice(1));
      else {
        raw.push(incoming[i + 1]);
        legIssues.push(
          'No automatic route with the requested clearance was found; add or move waypoints.',
        );
      }
      if (i + 1 < anchors.length - 1) raw.push(anchors[i + 1], outgoing[i + 1]);
    }
    raw.push(end);
    return raw;
  };
  // A connector lead is sized for a bend of about 90 degrees. When the free route leaves it
  // more sharply, lengthen that lead and route again so the declared radius has room.
  let first = firstLead,
    last = lastLead;
  for (let attempt = 0; ; attempt++) {
    const legIssues: string[] = [];
    const raw = rawPath(first, last, legIssues);
    const nextFirst = extendedLead(
      start,
      first,
      raw.slice(2).find((p) => !near(p, first)),
      straights.start,
      radius,
      boxes,
      margin,
      distance(start, end),
    );
    const nextLast = extendedLead(
      end,
      last,
      raw
        .slice(0, -2)
        .reverse()
        .find((p) => !near(p, last)),
      straights.end,
      radius,
      boxes,
      margin,
      distance(start, end),
    );
    if (attempt >= 12 || (near(nextFirst, first) && near(nextLast, last))) {
      issues.push(...legIssues);
      return roundedPath(raw, radius, issues, fixed, enforceRadius, straights);
    }
    first = nextFirst;
    last = nextLast;
  }
}

function partitionWaypoints(
  fixed: Vec3[],
  start: Vec3,
  entry: Vec3,
  exit: Vec3,
  end: Vec3,
): [Vec3[], Vec3[]] {
  let bestSplit = 0,
    bestLength = Number.POSITIVE_INFINITY;
  const polylineLength = (points: Vec3[]) =>
    points.slice(1).reduce((length, point, index) => length + distance(points[index], point), 0);
  for (let split = 0; split <= fixed.length; split++) {
    const length =
      polylineLength([start, ...fixed.slice(0, split), entry]) +
      polylineLength([exit, ...fixed.slice(split), end]);
    if (length < bestLength) {
      bestLength = length;
      bestSplit = split;
    }
  }
  return [fixed.slice(0, bestSplit), fixed.slice(bestSplit)];
}

/** A sibling occupies its own deterministic lane instead of copying another follower. */
function automaticFollowOffset(
  project: Project,
  cable: Cable,
  reference: Cable,
  curved: boolean,
): number {
  let offset = 0,
    previousRadius = reference.diameterMm / 2,
    previousClearance = reference.clearanceMm;
  const siblings = [...project.cables.filter((candidate) => candidate.id !== cable.id), cable]
    .filter((candidate) => candidate.followCableId === reference.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const sibling of siblings) {
    // A 0.11 mm visible geometric buffer covers both <=0.05 mm arc sampling
    // envelopes when verifying parallel circular sections against one another.
    const spacing =
      previousRadius +
      sibling.diameterMm / 2 +
      Math.max(previousClearance, sibling.clearanceMm) +
      (curved ? 0.11 : 0);
    offset = sibling.followOffsetMm ?? offset + spacing;
    if (sibling.id === cable.id) return offset;
    previousRadius = sibling.diameterMm / 2;
    previousClearance = sibling.clearanceMm;
  }
  return (
    reference.diameterMm / 2 +
    cable.diameterMm / 2 +
    Math.max(reference.clearanceMm, cable.clearanceMm)
  );
}

function runsIntersect(a: Rounded, b: CableRoute, requiredSeparation: number): boolean {
  const target = sampleRouteSegments(a.segments),
    reference = sampleRouteSegments(b.segments);
  let refinementBudget = 200_000;
  const refine = (x: SampledRouteChord, y: SampledRouteChord, depth = 0): boolean => {
    if (--refinementBudget < 0) return false;
    const d = segmentDistanceMm(x.start, x.end, y.start, y.end),
      error = x.sagittaMm + y.sagittaMm;
    if (d - error >= requiredSeparation - 1e-6) return true;
    if (d + error < requiredSeparation - 1e-6) return false;
    if (error <= 1e-6) return d >= requiredSeparation - 2e-6;
    if (depth >= 32) return false;
    const split = (chord: SampledRouteChord): [SampledRouteChord, SampledRouteChord] => {
      const middleFraction = (chord.fromFraction + chord.toFraction) / 2;
      const middle = routeSegmentPoint(chord.segment, middleFraction);
      const angle =
        chord.segment.kind === 'arc'
          ? (chord.segment.angleRadians * (chord.toFraction - chord.fromFraction)) / 2
          : 0;
      const sagittaMm =
        chord.segment.kind === 'arc' ? chord.segment.radiusMm * (1 - Math.cos(angle / 2)) : 0;
      return [
        { ...chord, end: middle, toFraction: middleFraction, sagittaMm },
        { ...chord, start: middle, fromFraction: middleFraction, sagittaMm },
      ];
    };
    if (x.sagittaMm >= y.sagittaMm) {
      const halves = split(x);
      return refine(halves[0], y, depth + 1) && refine(halves[1], y, depth + 1);
    }
    const halves = split(y);
    return refine(x, halves[0], depth + 1) && refine(x, halves[1], depth + 1);
  };
  for (const x of target.chords) {
    for (const y of reference.chords) {
      const required = requiredSeparation + x.sagittaMm + y.sagittaMm;
      let boxDistanceSquared = 0;
      for (let axis = 0; axis < 3; axis++) {
        const lowA = Math.min(x.start[axis], x.end[axis]),
          highA = Math.max(x.start[axis], x.end[axis]);
        const lowB = Math.min(y.start[axis], y.end[axis]),
          highB = Math.max(y.start[axis], y.end[axis]);
        const gap = Math.max(0, lowA - highB, lowB - highA);
        boxDistanceSquared += gap * gap;
      }
      if (boxDistanceSquared >= required * required) continue;
      if (!refine(x, y)) return true;
    }
  }
  return false;
}

/**
 * Geometric planning only: valid means no detected constraint failure in the
 * modelled section. Missing bend specifications and external surveys remain
 * visible advisories; valid never certifies physical dynamics or installation.
 */
function routeCableGeometry(
  project: Project,
  cable: Cable,
  reference?: { cable: Cable; route: CableRoute },
): CableRoute {
  const issues: string[] = [],
    advisories: string[] = [];
  const exit = cable.exitId ? project.exits.find((e) => e.id === cable.exitId) : undefined;
  const sourceAtExit =
    cable.source.kind === 'external' && !positionedEndpoint(project,cable.source) && cable.destination.kind === 'device' && !!exit;
  const destinationAtExit = cable.destination.kind === 'external' && !positionedEndpoint(project,cable.destination) && !!exit;
  const start = sourceAtExit ? exit!.position : portWorld(project, cable.source);
  const end = destinationAtExit ? exit!.position : portWorld(project, cable.destination);
  if (!start || !end)
    return {
      points: [],
      segments: [],
      lengthMm: 0,
      valid: false,
      issues: ['Both endpoints need an existing port and a finite world position.'],
      minRadiusMm: null,
    };
  if (near(start, end))
    return {
      points: [start],
      segments: [],
      lengthMm: 0,
      valid: false,
      issues: ['Cable endpoints occupy the same position.'],
      minRadiusMm: null,
    };
  if (sourceAtExit || destinationAtExit)
    advisories.push(
      'External route is not modelled; its surveyed length must be entered separately.',
    );
  if (cable.minBendRadiusMm === null)
    advisories.push(
      'Minimum bend radius is unknown; the displayed draft radius must be verified for this cable.',
    );
  const radius = cable.minBendRadiusMm ?? Math.max(15, cable.diameterMm * 4);
  const margin = cable.diameterMm / 2 + cable.clearanceMm;
  const boxes = allObstacles(project);
  const sourcePrefix = ownerPrefix(cable.source),
    destinationPrefix = ownerPrefix(cable.destination);
  for (const [index, endpoint] of [cable.source, cable.destination].entries()) {
    if ((index === 0 && sourceAtExit) || (index === 1 && destinationAtExit)) continue;
    const issue = endpointDirectionIssue(project, endpoint);
    if (issue) issues.push(issue);
  }
  const sourceDirection = unit(
    sourceAtExit
      ? mul(exit!.direction, -1)
      : (portDirectionWorld(project, cable.source) ?? sub(end, start)),
  );
  const destinationDirection = unit(
    destinationAtExit
      ? mul(exit!.direction, -1)
      : (portDirectionWorld(project, cable.destination) ?? sub(start, end)),
  );
  if ((sourceAtExit || destinationAtExit) && norm(exit!.direction) < EPS)
    issues.push('Rack exit direction is zero.');
  const firstLead = leadPoint(
    start,
    sourceDirection,
    boxes.filter((b) => isOwner(b, sourcePrefix)),
    margin,
    radius,
  );
  const lastLead = leadPoint(
    end,
    destinationDirection,
    boxes.filter((b) => isOwner(b, destinationPrefix)),
    margin,
    radius,
  );
  const straights: LeadStraights = {
    start: leadStraight(
      start,
      sourceDirection,
      boxes.filter((b) => isOwner(b, sourcePrefix)),
      margin,
    ),
    end: leadStraight(
      end,
      destinationDirection,
      boxes.filter((b) => isOwner(b, destinationPrefix)),
      margin,
    ),
  };
  const shared = project.looms
    .filter((loom) => loom.cableIds.includes(cable.id))
    .flatMap((loom) => loom.waypoints);
  const guides = resolveGuideLinks(project, cable);
  issues.push(...guides.issues);
  const fixed = [...shared, ...cable.waypoints, ...guides.points].map((p) => [...p] as Vec3);
  if (cable.exitId) {
    if (!exit) issues.push('The selected rack exit does not exist.');
    else if (!sourceAtExit && !destinationAtExit && !fixed.some((p) => near(p, exit.position)))
      fixed.push(exit.position);
  }
  let rounded: Rounded;
  let followedRun: FollowedRunInfo | undefined;
  if (reference) {
    const minimumOffsetMm =
      (cable.diameterMm + reference.cable.diameterMm) / 2 +
      Math.max(cable.clearanceMm, reference.cable.clearanceMm);
    const offsetMm =
      cable.followOffsetMm ??
      automaticFollowOffset(
        project,
        cable,
        reference.cable,
        reference.route.segments.some((segment) => segment.kind === 'arc'),
      );
    const sharedRun = createParallelFollowRun({
      segments: reference.route.segments,
      startPercent: cable.followStartPercent,
      endPercent: cable.followEndPercent,
      offsetMm,
      minimumOffsetMm,
      minimumBendRadiusMm: cable.minBendRadiusMm,
    });
    issues.push(...sharedRun.issues);
    if (!sharedRun.segments.length)
      return { points: [], segments: [], lengthMm: 0, valid: false, issues, minRadiusMm: null };
    const entry = sharedRun.points[0],
      sharedExit = sharedRun.points[sharedRun.points.length - 1];
    const leadLength = Math.max(25, 2 * radius + margin + 2);
    const [before, after] = partitionWaypoints(fixed, firstLead, entry, sharedExit, lastLead);
    const incoming = routeBetween(
      start,
      firstLead,
      sub(entry, mul(sharedRun.startTangent, leadLength)),
      entry,
      before,
      boxes,
      margin,
      radius,
      cable.minBendRadiusMm !== null,
      issues,
      guides.lines,
      { start: straights.start },
    );
    const outgoing = routeBetween(
      sharedExit,
      add(sharedExit, mul(sharedRun.endTangent, leadLength)),
      lastLead,
      end,
      after,
      boxes,
      margin,
      radius,
      cable.minBendRadiusMm !== null,
      issues,
      guides.lines,
      { end: straights.end },
    );
    const segments = [...incoming.segments, ...sharedRun.segments, ...outgoing.segments];
    for (let index = 1; index < segments.length; index++) {
      if (
        !near(segments[index - 1].end, segments[index].start) ||
        dot(routeSegmentTangent(segments[index - 1], 1), routeSegmentTangent(segments[index], 0)) <
          1 - 1e-7
      ) {
        issues.push(
          'A follow-run breakout cannot join the shared run with a continuous tangent. Adjust its range, offset or endpoint clearance.',
        );
      }
    }
    const sampled = sampleRouteSegments(segments);
    rounded = {
      segments,
      points: sampled.points,
      sagittas: sampled.sagittas,
      length: sampled.lengthMm,
      radius: sampled.minRadiusMm,
    };
    followedRun = {
      referenceCableId: reference.cable.id,
      startPercent: cable.followStartPercent,
      endPercent: cable.followEndPercent,
      offsetMm,
      sharedPoints: sharedRun.points,
    };
    if (runsIntersect(rounded, reference.route, minimumOffsetMm)) {
      issues.push(
        'The following cable intersects or lacks verified clearance from the reference cable. Adjust the breakout range or offset.',
      );
    }
  } else
    rounded = routeBetween(
      start,
      firstLead,
      lastLead,
      end,
      fixed,
      boxes,
      margin,
      radius,
      cable.minBendRadiusMm !== null,
      issues,
      guides.lines,
      straights,
    );
  const collisions = new Set<string>();
  for (let i = 1; i < rounded.points.length; i++) {
    for (const box of boxes) {
      // Only the initial/final straight connector lead may intersect its own chassis.
      if (
        (i === 1 && isOwner(box, sourcePrefix)) ||
        (i === rounded.points.length - 1 && isOwner(box, destinationPrefix))
      )
        continue;
      if (
        segmentHitsBox(
          rounded.points[i - 1],
          rounded.points[i],
          box,
          margin + (rounded.sagittas[i - 1] ?? 0),
        )
      )
        collisions.add(box.id);
    }
  }
  if (collisions.size)
    issues.push(`Cable envelope intersects ${[...collisions].sort().join(', ')}.`);
  for (const point of fixed) {
    if (!rounded.points.some((p) => near(p, point)))
      issues.push('A required waypoint was not preserved by the route.');
  }
  for (const [a, b] of guides.lines) {
    const from = rounded.points.findIndex((p) => near(p, a));
    const to = rounded.points.findIndex((p, i) => i > from && near(p, b));
    const direction = unit(sub(b, a));
    if (
      from < 0 ||
      to < 0 ||
      rounded.points
        .slice(from, to + 1)
        .some(
          (p, i, run) =>
            norm(cross(sub(p, a), direction)) > 1e-5 ||
            (i > 0 && dot(sub(p, run[i - 1]), direction) < -EPS),
        )
    )
      issues.push(
        'A linked line guide cannot be traversed straight from entry to exit with the current obstacles and bend constraints. Move the guide or reverse its direction.',
      );
  }
  return {
    points: rounded.points,
    segments: rounded.segments,
    lengthMm: rounded.length,
    valid: issues.length === 0,
    issues: [...new Set([...issues, ...advisories])],
    minRadiusMm: rounded.radius,
    ...(followedRun ? { followedRun } : {}),
  };
}

/** Resolve relationships afresh on every call; geometry never stores copied routes. */
export function routeCable(project: Project, cable: Cable): CableRoute {
  const fail = (message: string): CableRoute => ({
    points: [],
    segments: [],
    lengthMm: 0,
    valid: false,
    issues: [message],
    minRadiusMm: null,
  });
  const byId = new Map<string, Cable[]>();
  for (const candidate of project.cables) {
    const matches = byId.get(candidate.id) ?? [];
    matches.push(candidate);
    byId.set(candidate.id, matches);
  }
  const chain: Cable[] = [],
    visiting = new Set<string>();
  let current = cable;
  // Resolve dependencies iteratively so even a deeply malformed cyclic import
  // produces a diagnostic instead of overflowing the JavaScript call stack.
  for (;;) {
    if (visiting.has(current.id))
      return fail(
        'Circular follow-cable relationship detected. Remove a follow link to break the cycle.',
      );
    visiting.add(current.id);
    chain.push(current);
    if (!current.followCableId) break;
    const matches = byId.get(current.followCableId);
    if (matches?.length !== 1)
      return fail(
        'The followed cable is missing or its ID is ambiguous. Select an existing cable.',
      );
    current = matches[0];
  }
  let result = routeCableGeometry(project, chain[chain.length - 1]);
  for (let index = chain.length - 2; index >= 0; index--) {
    if (!result.valid)
      return fail(
        `The followed cable ${chain[index + 1].id} has an invalid route: ${result.issues.join(' ')}`,
      );
    result = routeCableGeometry(project, chain[index], { cable: chain[index + 1], route: result });
  }
  return result;
}
