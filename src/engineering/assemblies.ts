import { clone, uid } from '../model';
import type { Project, Vec3 } from '../model';
import { add, origin, racks, sub, deviceRack } from './space';
import type { Rack } from '../model';
export function nextRackOrigin(p: Project, reference: Rack): Vec3 {
  return [
    Math.max(...racks(p).map((r) => origin(r)[0] + r.outerWidthMm / 2)) +
      reference.outerWidthMm / 2 +
      50,
    origin(reference)[1],
    origin(reference)[2],
  ];
}

/** Export one rack as a portable project; external links remain in the source. */
export function rackAssembly(p: Project, rackId: string): Project {
  const result = clone(p),
    rack = racks(result).find((r) => r.id === rackId);
  if (!rack) throw new Error('Rack not found.');
  const offset = origin(rack),
    ids = new Set(
      result.devices.filter((d) => deviceRack(result, d).id === rackId).map((d) => d.id),
    );
  result.devices = result.devices
    .filter((d) => ids.has(d.id))
    .map((d) => ({ ...d, rackId: undefined }));
  result.cables = result.cables.filter((c) =>
    [c.source, c.destination].every((e) => e.kind === 'device' && ids.has(e.deviceId)),
  );
  const cableIds = new Set(result.cables.map((c) => c.id));
  for (const c of result.cables)
    if (c.followCableId && !cableIds.has(c.followCableId)) c.followCableId = null;
  result.looms = result.looms
    .map((l) => ({ ...l, cableIds: l.cableIds.filter((id) => cableIds.has(id)) }))
    .filter((l) => l.cableIds.length >= 2);
  const guideIds = new Set([
    ...result.cables.flatMap((c) => (c.guideLinks ?? []).map((l) => l.guideId)),
    ...result.looms.flatMap((l) => l.guideIds ?? []),
  ]);
  result.wiringGuides = result.wiringGuides?.filter((g) => guideIds.has(g.id));
  const accessoryIds = new Set(
    result.wiringGuides?.flatMap((g) =>
      g.kind === 'point' ? (g.accessoryId ? [g.accessoryId] : []) : g.trayId ? [g.trayId] : [],
    ) ?? [],
  );
  let again = true;
  while (again) {
    again = false;
    for (const a of result.accessories)
      if (
        accessoryIds.has(a.id) &&
        a.attachment?.kind === 'accessory' &&
        !accessoryIds.has(a.attachment.id)
      ) {
        accessoryIds.add(a.attachment.id);
        again = true;
      }
    for (const a of result.accessories)
      if (
        (a.attachment?.kind === 'rack' && a.attachment.id === rackId) ||
        (a.attachment?.kind === 'device' && ids.has(a.attachment.id)) ||
        (a.attachment?.kind === 'accessory' && accessoryIds.has(a.attachment.id))
      ) {
        if (!accessoryIds.has(a.id)) {
          accessoryIds.add(a.id);
          again = true;
        }
      }
  }
  result.accessories = result.accessories.filter((a) => accessoryIds.has(a.id));
  // Referenced hardware may be attached to an object outside this assembly.
  for (const a of result.accessories)
    if (
      a.attachment &&
      ((a.attachment.kind === 'device' && !ids.has(a.attachment.id)) ||
        (a.attachment.kind === 'accessory' && !accessoryIds.has(a.attachment.id)) ||
        (a.attachment.kind === 'rack' && a.attachment.id !== rackId) ||
        a.attachment.kind === 'member')
    )
      throw new Error(
        'An internal cable uses a fixing outside this rack. Unlink that guide before exporting the assembly.',
      );
  for (const a of result.accessories) {
    a.cableIds = a.cableIds.filter((id) => cableIds.has(id));
    if (!a.attachment) a.position = sub(a.position, offset);
  }
  for (const g of result.wiringGuides ?? [])
    if (g.kind === 'point') g.position = sub(g.position, offset);
    else {
      g.start = sub(g.start, offset);
      g.end = sub(g.end, offset);
    }
  result.rack = { ...rack, originMm: [0, 0, 0] };
  result.additionalRacks = [];
  result.sharedMembers = [];
  const exits = new Set(result.cables.flatMap((c) => (c.exitId ? [c.exitId] : [])));
  result.exits = result.exits
    .filter((e) => exits.has(e.id))
    .map((e) => ({ ...e, position: sub(e.position, offset) }));
  for (const l of result.looms) l.waypoints = l.waypoints.map((v) => sub(v, offset));
  result.destinations = [];
  result.measurements = [];
  result.id = uid('assembly');
  result.name = `${rack.name} assembly`;
  result.revision = 0;
  return result;
}
/** Merge without overwriting existing records; every project-scoped ID is remapped. */
export function insertAssembly(p: Project, source: Project, at: Vec3): string {
  const copy = clone(source),
    offset = sub(at, origin(copy.rack)),
    map = new Map<string, string>();
  const collections = [
    racks(copy),
    copy.definitions,
    copy.devices,
    copy.cables,
    copy.wiringGuides ?? [],
    copy.accessories,
    copy.exits,
    copy.destinations,
    copy.looms,
    copy.products,
    copy.stock,
    copy.sharedMembers ?? [],
    copy.measurements ?? [],
  ];
  for (const items of collections) for (const item of items) map.set(item.id, uid('assembly'));
  const id = (old: string) => map.get(old) ?? old;
  const sourcePrimary = copy.rack.id;
  for (const r of racks(copy)) {
    r.originMm = add(origin(r), offset);
    r.id = id(r.id);
    for (const s of r.sections) s.id = uid('section');
    for (const m of r.members) m.id = uid('member');
  }
  for (const d of copy.definitions) d.id = id(d.id);
  for (const d of copy.devices) {
    d.id = id(d.id);
    d.definitionId = id(d.definitionId);
    d.rackId = id(d.rackId ?? sourcePrimary);
    if (d.supportId) d.supportId = id(d.supportId);
  }
  for (const c of copy.cables) {
    c.id = id(c.id);
    let n = 0;
    while (
      p.cables.some((v) => v.label === String(n)) ||
      copy.cables.some((v) => v !== c && v.label === String(n))
    )
      n++;
    c.label = String(n);
    for (const e of [c.source, c.destination]) {
      if (e.kind === 'device') e.deviceId = id(e.deviceId);
      else e.destinationId = id(e.destinationId);
    }
    if (c.followCableId) c.followCableId = id(c.followCableId);
    if (c.exitId) c.exitId = id(c.exitId);
    c.productId = id(c.productId);
    for (const l of c.guideLinks ?? []) l.guideId = id(l.guideId);
  }
  for (const a of copy.accessories) {
    a.id = id(a.id);
    if (a.attachment) a.attachment.id = id(a.attachment.id);
    else a.position = add(a.position, offset);
    if (a.parentId) a.parentId = id(a.parentId);
    a.cableIds = a.cableIds.map(id);
  }
  for (const g of copy.wiringGuides ?? []) {
    g.id = id(g.id);
    if (g.kind === 'point') {
      g.position = add(g.position, offset);
      if (g.accessoryId) g.accessoryId = id(g.accessoryId);
    } else {
      g.start = add(g.start, offset);
      g.end = add(g.end, offset);
      if (g.trayId) g.trayId = id(g.trayId);
    }
  }
  for (const e of copy.exits) {
    e.id = id(e.id);
    e.position = add(e.position, offset);
  }
  for (const d of copy.destinations) {
    d.id = id(d.id);
    if (d.position) d.position = add(d.position, offset);
  }
  for (const l of copy.looms) {
    l.id = id(l.id);
    l.cableIds = l.cableIds.map(id);
    l.guideIds = l.guideIds?.map(id);
    l.waypoints = l.waypoints.map((v) => add(v, offset));
  }
  for (const product of copy.products) product.id = id(product.id);
  for (const stock of copy.stock) {
    stock.id = id(stock.id);
    stock.productId = id(stock.productId);
  }
  (p.additionalRacks ??= []).push(...racks(copy));
  p.definitions.push(...copy.definitions);
  p.devices.push(...copy.devices);
  p.cables.push(...copy.cables);
  (p.wiringGuides ??= []).push(...(copy.wiringGuides ?? []));
  p.accessories.push(...copy.accessories);
  p.exits.push(...copy.exits);
  p.destinations.push(...copy.destinations);
  p.looms.push(...copy.looms);
  p.products.push(...copy.products);
  p.stock.push(...copy.stock);
  for (const m of copy.sharedMembers ?? []) {
    m.id = id(m.id);
    m.position = add(m.position, offset);
    (p.sharedMembers ??= []).push(m);
  }
  return copy.rack.id;
}
