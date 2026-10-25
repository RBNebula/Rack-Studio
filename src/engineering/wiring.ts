import type { Cable, Project, Vec3 } from '../model';
import { accessoryPose, fixingCenter } from './attachments';
import { add, pointAtPose, rotate } from './space';

export function guideCableIds(p: Project, guideId: string) {
  return p.cables
    .filter(
      (c) =>
        c.guideLinks?.some((l) => l.guideId === guideId) ||
        p.looms.some((l) => l.cableIds.includes(c.id) && l.guideIds?.includes(guideId)),
    )
    .map((c) => c.id)
    .sort();
}
export function bundlePacking(p: Project, ids: string[], columns?: number) {
  const cables = [...new Set(ids)]
    .map((id) => p.cables.find((c) => c.id === id))
    .filter((c): c is Cable => Boolean(c))
    .sort((a, b) => a.id.localeCompare(b.id));
  const pitch = Math.max(1, ...cables.map((c) => c.diameterMm + c.clearanceMm));
  const cols = Math.max(1, columns ?? Math.ceil(Math.sqrt(cables.length))),
    rows = Math.ceil(cables.length / cols);
  const offsets = new Map<string, [number, number]>();
  for (const [i, c] of cables.entries())
    offsets.set(c.id, [
      ((i % cols) - (Math.min(cols, cables.length) - 1) / 2) * pitch,
      (Math.floor(i / cols) - (rows - 1) / 2) * pitch,
    ]);
  const diameterMm = Math.max(
    0,
    ...cables.map((c) => 2 * Math.hypot(...offsets.get(c.id)!) + c.diameterMm + 2 * c.clearanceMm),
  );
  return {
    offsets,
    diameterMm,
    pitch,
    rows,
    widthMm: Math.min(cols, cables.length) * pitch,
    heightMm: rows * pitch,
  };
}
export function resolvedGuidePoints(
  p: Project,
  guide: NonNullable<Project['wiringGuides']>[number],
  cable?: Cable,
): { points: Vec3[]; issues: string[] } {
  const issues: string[] = [];
  if (guide.kind === 'point') {
    const a = guide.accessoryId && p.accessories.find((a) => a.id === guide.accessoryId);
    if (!a) return { points: [[...guide.position]], issues };
    const packing = bundlePacking(p, guideCableIds(p, guide.id)),
      offset = cable && packing.offsets.get(cable.id);
    if (packing.diameterMm > (a.openingMm ?? 20))
      issues.push(
        `${a.name}: bundle envelope ${packing.diameterMm.toFixed(1)} mm exceeds ${(a.openingMm ?? 20).toFixed(1)} mm opening.`,
      );
    return {
      points: [
        add(
          fixingCenter(p, a),
          rotate([offset?.[0] ?? 0, offset?.[1] ?? 0, 0], accessoryPose(p, a).rotationDeg),
        ),
      ],
      issues,
    };
  }
  const tray = guide.trayId && p.accessories.find((a) => a.id === guide.trayId);
  if (!tray) return { points: [[...guide.start], [...guide.end]], issues };
  const ids = guideCableIds(p, guide.id),
    maxDiameter = Math.max(
      ids.length ? 1 : 6,
      ...ids.map((id) => p.cables.find((c) => c.id === id)!.diameterMm),
    );
  const clearance = Math.max(
    ids.length ? 0 : 3,
    ...ids.map((id) => p.cables.find((c) => c.id === id)!.clearanceMm),
  );
  const pitch = maxDiameter + 2 * clearance,
    t = Math.min(tray.perforated ? 2.5 : 2, ...tray.size.map((n) => n / 4));
  const columns = Math.max(1, Math.floor((tray.size[0] - 2 * t) / pitch));
  const packing = bundlePacking(p, ids, columns),
    index = Math.max(0, ids.indexOf(cable?.id ?? ''));
  const y =
    -tray.size[1] / 2 + t + clearance + 0.1 + maxDiameter / 2 + Math.floor(index / columns) * pitch;
  const x = ids.length ? ((index % columns) - (Math.min(columns, ids.length) - 1) / 2) * pitch : 0;
  if (y + maxDiameter / 2 + clearance > tray.size[1] / 2 || packing.widthMm > tray.size[0] - 2 * t)
    issues.push(`${tray.name}: cable bundle exceeds the usable tray section.`);
  const z = Math.max(0, tray.size[2] / 2 - clearance - maxDiameter / 2 - 2);
  return { points: [-1, 1].map((s) => pointAtPose(accessoryPose(p, tray), [x, y, s * z])), issues };
}

export const SURFACE_WAYPOINT_OFFSET_MM = 10;

/** World-space triangle normal, normalized here so scaling cannot change the offset. */
export function offsetSurfacePoint(point: Vec3, normal: Vec3): Vec3 {
  const length = Math.hypot(...normal);
  if (!length || ![...point, ...normal].every(Number.isFinite))
    throw new Error('A finite surface point and nonzero normal are required.');
  return point.map((v, i) => v + (normal[i] / length) * SURFACE_WAYPOINT_OFFSET_MM) as Vec3;
}

export function resolveGuideLinks(project: Project, cable: Cable) {
  const points: Vec3[] = [],
    lines: [Vec3, Vec3][] = [],
    issues: string[] = [];
  const links = [
    ...project.looms
      .filter((l) => l.cableIds.includes(cable.id))
      .flatMap((l) => (l.guideIds ?? []).map((guideId) => ({ guideId, reverse: false }))),
    ...(cable.guideLinks ?? []),
  ].filter((l, i, all) => all.findIndex((v) => v.guideId === l.guideId) === i);
  for (const link of links) {
    const guide = project.wiringGuides?.find((g) => g.id === link.guideId);
    if (!guide) {
      issues.push(`Missing wiring guide ${link.guideId}.`);
      continue;
    }
    const resolved = resolvedGuidePoints(project, guide, cable);
    issues.push(...resolved.issues);
    if (guide.kind === 'point') points.push(...resolved.points);
    else {
      const pair: [Vec3, Vec3] = link.reverse
        ? [resolved.points[1], resolved.points[0]]
        : [resolved.points[0], resolved.points[1]];
      points.push(...pair);
      lines.push(pair);
    }
  }
  return { points, lines, issues };
}
