import { projectSchema } from '../model';
import { cableLabel } from '../model';
import type { Project } from '../model';
import { connectionIssues, endpointIdentity } from '../engineering/connectivity';
import { validateRack, structuralMemberIssues } from '../engineering/geometry';
import { validateShelfDefinition } from '../engineering/shelves';
import { validatePlateDefinition } from '../engineering/plates';
import { deviceRack, racks } from '../engineering/space';

export function validateReferences(p: Project): string[] {
  const issues: string[] = [];
  const unique = (items: { id: string }[], label: string) => {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) issues.push(`Duplicate ${label} ID: ${item.id}`);
      seen.add(item.id);
    }
  };
  for (const [items, label] of [
    [p.definitions, 'definition'],
    [p.devices, 'device'],
    [p.cables, 'cable'],
    [p.exits, 'exit'],
    [p.destinations, 'destination'],
    [p.accessories, 'accessory'],
    [p.looms, 'loom'],
    [p.products, 'product'],
    [p.stock, 'stock'],
  ] as const)
    unique(items, label);
  unique(p.wiringGuides ?? [], 'wiring guide');
  unique(racks(p), 'rack');
  unique(p.sharedMembers ?? [], 'shared member');
  for (const member of p.sharedMembers ?? [])
    issues.push(...structuralMemberIssues(member).map((v) => `${member.name}: ${v}`));
  for (const rack of p.additionalRacks ?? [])
    issues.push(...validateRack(rack).map((v) => `${rack.name}: ${v}`));
  for (const a of p.accessories) {
    if (!a.attachment) continue;
    const seen = new Set([a.id]);
    let target: typeof a.attachment | undefined = a.attachment;
    while (target) {
      const items =
        target.kind === 'rack'
          ? racks(p)
          : target.kind === 'device'
            ? p.devices
            : target.kind === 'member'
              ? (p.sharedMembers ?? [])
              : p.accessories;
      if (!items.some((v) => v.id === target!.id)) {
        issues.push(`${a.name}: missing attachment parent.`);
        break;
      }
      if (target.kind !== 'accessory') break;
      if (seen.has(target.id)) {
        issues.push(`${a.name}: circular attachment.`);
        break;
      }
      seen.add(target.id);
      target = p.accessories.find((v) => v.id === target!.id)?.attachment;
    }
  }
  for (const g of p.wiringGuides ?? []) {
    const id = g.kind === 'point' ? g.accessoryId : g.trayId;
    if (id && !p.accessories.some((a) => a.id === id && (g.kind !== 'line' || a.kind === 'tray')))
      issues.push(`${g.name}: missing physical fixing or tray.`);
  }
  for (const d of p.destinations)
    if (d.routeIn3D && !d.position)
      issues.push(`${d.name}: positioned endpoint needs coordinates.`);
  for (const g of p.wiringGuides ?? [])
    if (g.kind === 'line' && Math.hypot(...g.start.map((v, i) => v - g.end[i])) < 1)
      issues.push(`${g.name}: a line guide must be at least 1 mm long.`);
  for (const d of p.definitions) {
    unique(d.ports, `${d.name} port`);
    unique(d.parts, `${d.name} component`);
    issues.push(...validateShelfDefinition(d).map((issue) => `${d.name}: ${issue}`));
    issues.push(...validatePlateDefinition(d).map((issue) => `${d.name}: ${issue}`));
  }
  for (const d of p.destinations) unique(d.ports, `${d.name} port`);
  const usedPorts = new Set<string>();
  const labels = new Set<string>();
  for (const d of p.devices) {
    const def = p.definitions.find((x) => x.id === d.definitionId);
    if (!def) issues.push(`${d.name}: missing device definition.`);
    if (d.rackId && !racks(p).some((r) => r.id === d.rackId))
      issues.push(`${d.name}: missing rack.`);
    if (def && d.startU + def.heightU - 1 > deviceRack(p, d).heightU)
      issues.push(`${d.name}: exceeds rack height.`);
    if (d.supportId && !p.devices.some((x) => x.id === d.supportId && x.id !== d.id))
      issues.push(`${d.name}: missing or invalid support.`);
    if (
      d.supportId &&
      deviceRack(p, d).id !== deviceRack(p, p.devices.find((v) => v.id === d.supportId) ?? d).id
    )
      issues.push(`${d.name}: supporting shelf must be in the same rack.`);
    const seen = new Set([d.id]);
    let current = d;
    while (current.supportId) {
      if (seen.has(current.supportId)) {
        issues.push(`${d.name}: circular support relationship.`);
        break;
      }
      seen.add(current.supportId);
      const next = p.devices.find((x) => x.id === current.supportId);
      if (!next) break;
      current = next;
    }
  }
  for (const c of p.cables) {
    const guides = new Set<string>();
    for (const link of c.guideLinks ?? []) {
      if (!p.wiringGuides?.some((g) => g.id === link.guideId))
        issues.push(`${c.id}: missing wiring guide ${link.guideId}.`);
      if (guides.has(link.guideId)) issues.push(`${c.id}: duplicate wiring guide link.`);
      guides.add(link.guideId);
    }
    if (labels.has(cableLabel(c))) issues.push(`Duplicate cable number: ${cableLabel(c)}`);
    labels.add(cableLabel(c));
    for (const endpoint of [c.source, c.destination]) {
      const owner =
        endpoint.kind === 'device'
          ? p.devices.find((x) => x.id === endpoint.deviceId)
          : p.destinations.find((x) => x.id === endpoint.destinationId);
      const ports =
        endpoint.kind === 'device'
          ? p.definitions.find(
              (x) => x.id === p.devices.find((v) => v.id === endpoint.deviceId)?.definitionId,
            )?.ports
          : p.destinations.find((x) => x.id === endpoint.destinationId)?.ports;
      const port = ports?.find((x) => x.id === endpoint.portId);
      if (!owner || !port) issues.push(`${c.id}: missing endpoint or port.`);
      const key = endpointIdentity(endpoint);
      if (usedPorts.has(key) && !port?.multiple) issues.push(`${c.id}: port is already connected.`);
      usedPorts.add(key);
    }
    issues.push(
      ...connectionIssues(p, c.source, c.destination, c.id, { tolerateSameGender: true }).map(
        (issue) => `${c.id}: ${issue}`,
      ),
    );
    if (c.exitId && !p.exits.some((e) => e.id === c.exitId))
      issues.push(`${c.id}: missing exit point.`);
    if ([c.source, c.destination].some((e) => e.kind === 'external') && !c.exitId)
      issues.push(`${c.id}: an external connection requires a rack exit.`);
    if (c.supply === 'bulk' && !p.products.some((x) => x.id === c.productId))
      issues.push(`${c.id}: missing bulk cable product.`);
    if (c.manualOverrideMm !== null && !c.overrideReason.trim())
      issues.push(`${c.id}: a manual override needs a reason.`);
    if (c.followCableId) {
      if (c.followStartPercent >= c.followEndPercent)
        issues.push(`${c.id}: the shared run must end after it starts.`);
      const seen = new Set([c.id]);
      let follow: string | null = c.followCableId;
      while (follow) {
        if (seen.has(follow)) {
          issues.push(`${c.id}: circular cable route reference.`);
          break;
        }
        seen.add(follow);
        const ref = p.cables.find((v) => v.id === follow);
        if (!ref) {
          issues.push(`${c.id}: missing cable run ${follow}.`);
          break;
        }
        follow = ref.followCableId;
      }
    }
  }
  for (const l of p.looms) {
    for (const id of l.guideIds ?? [])
      if (!p.wiringGuides?.some((g) => g.id === id)) issues.push(`${l.name}: missing guide ${id}.`);
    if (new Set(l.cableIds).size !== l.cableIds.length)
      issues.push(`${l.name}: duplicate loom member.`);
    for (const id of l.cableIds)
      if (!p.cables.some((c) => c.id === id)) issues.push(`${l.name}: missing cable ${id}.`);
  }
  for (const s of p.stock)
    if (!p.products.some((x) => x.id === s.productId))
      issues.push(`${s.id}: missing stock product.`);
  return issues;
}
export function parseProject(raw: string): Project {
  if (raw.length > 30_000_000) throw new Error('Project exceeds the 30 MB import limit.');
  const value: unknown = JSON.parse(raw);
  const result = projectSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      `Invalid project: ${result.error.issues
        .slice(0, 4)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  const findUnknown = (original: unknown, parsed: unknown, path = 'project'): string[] => {
    if (
      original === null ||
      typeof original !== 'object' ||
      parsed === null ||
      typeof parsed !== 'object'
    )
      return [];
    return Object.entries(original).flatMap(([key, v]) =>
      key in parsed
        ? findUnknown(v, (parsed as Record<string, unknown>)[key], `${path}.${key}`)
        : [`${path}.${key}`],
    );
  };
  const unknown = findUnknown(value, result.data);
  if (unknown.length)
    throw new Error(
      `Unsupported project fields: ${unknown.slice(0, 5).join(', ')}. Import stopped to avoid discarding data.`,
    );
  const issues = [...validateReferences(result.data), ...validateRack(result.data.rack)];
  if (issues.length) throw new Error(issues.slice(0, 5).join('\n'));
  for (const d of result.data.definitions)
    for (const image of [d.frontImage, d.rearImage])
      if (image && !/^data:image\/(png|jpeg|webp);base64,/.test(image))
        throw new Error('Images must be embedded PNG, JPEG or WebP assets.');
  return result.data;
}
export function serializeProject(p: Project): string {
  return JSON.stringify(projectSchema.parse(p), null, 2);
}
