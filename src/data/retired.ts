import type { DeviceDefinition, Project } from '../model';
import { clone } from '../model';
import { accessoryPose } from '../engineering/attachments';
import { validateReferences } from './project';

/**
 * Built-in equipment withdrawn from Rack Studio (owner decision, 28 October 2026). Opening a saved
 * or imported project removes these definitions, their installed devices and every cable attached
 * to them. Matching is by the built-in definition id, or by manufacturer and model for the former
 * catalogue references, so user-made definitions that merely share a name are kept.
 */
export const retiredDefinitionIds: Readonly<Record<string, string>> = {
  'def-switch': '24-port network switch',
  'def-patch': '24-port patch panel',
  'def-server': '2U rack server',
  'def-pc': 'Compact computer',
  'def-pdu': '1U power distribution',
  'def-av': 'AVoIP encoder',
  'def-manager': '1U horizontal manager',
};
const retiredCatalogueModels: [manufacturer: string, model: string][] = [
  ['Cisco', 'C1300-48P-4G'],
  ['Connectix', '009-002-001-40'],
];
/** Built-in shelves renamed at the same time; only an unchanged default name is updated. */
const renamedDefinitions: Record<string, [from: string, to: string]> = {
  'def-shelf': ['2U vented shelf', '2U shelf'],
  'def-shelf-1': ['1U vented shelf', '1U shelf'],
};

export function isRetiredDefinition(d: Pick<DeviceDefinition, 'id' | 'manufacturer' | 'model'>) {
  return (
    d.id in retiredDefinitionIds ||
    retiredCatalogueModels.some(([m, model]) => d.manufacturer === m && d.model === model)
  );
}

export interface RetiredRemoval {
  project: Project;
  definitions: string[];
  devices: string[];
  cables: number;
  renamed: number;
}

/** Returns a copy without retired equipment; `project` is the input itself when nothing applies. */
export function removeRetiredEquipment(input: Project): RetiredRemoval {
  const retired = input.definitions.filter(isRetiredDefinition);
  const renames = input.definitions.filter(
    (d) => renamedDefinitions[d.id] && d.name === renamedDefinitions[d.id][0],
  );
  if (!retired.length && !renames.length)
    return { project: input, definitions: [], devices: [], cables: 0, renamed: 0 };
  const p = clone(input);
  const definitionIds = new Set(retired.map((d) => d.id));
  const devices = p.devices.filter((d) => definitionIds.has(d.definitionId));
  const deviceIds = new Set(devices.map((d) => d.id));
  const cableIds = new Set(
    p.cables
      .filter((c) =>
        [c.source, c.destination].some((e) => e.kind === 'device' && deviceIds.has(e.deviceId)),
      )
      .map((c) => c.id),
  );
  // Fixings mounted on a removed device stay where they are in the world, now unattached.
  for (const a of p.accessories)
    if (a.attachment?.kind === 'device' && deviceIds.has(a.attachment.id)) {
      const pose = accessoryPose(
        input,
        input.accessories.find((x) => x.id === a.id)!,
      );
      a.position = pose.position;
      a.rotationDeg = pose.rotationDeg;
      delete a.attachment;
    }
  for (const a of p.accessories) {
    if (a.parentId && deviceIds.has(a.parentId)) a.parentId = null;
    a.cableIds = a.cableIds.filter((id) => !cableIds.has(id));
  }
  p.definitions = p.definitions.filter((d) => !definitionIds.has(d.id));
  p.devices = p.devices
    .filter((d) => !deviceIds.has(d.id))
    .map((d) => (d.supportId && deviceIds.has(d.supportId) ? { ...d, supportId: null } : d));
  p.cables = p.cables
    .filter((c) => !cableIds.has(c.id))
    .map((c) =>
      c.followCableId && cableIds.has(c.followCableId) ? { ...c, followCableId: null } : c,
    );
  p.looms = p.looms
    .map((l) => ({ ...l, cableIds: l.cableIds.filter((id) => !cableIds.has(id)) }))
    .filter((l) => l.cableIds.length >= 2);
  for (const d of p.definitions)
    if (renamedDefinitions[d.id] && d.name === renamedDefinitions[d.id][0])
      d.name = renamedDefinitions[d.id][1];
  const issues = validateReferences(p);
  if (issues.length)
    throw new Error(`Removing retired equipment left invalid references: ${issues.join(' ')}`);
  return {
    project: p,
    definitions: retired.map((d) => d.name),
    devices: devices.map((d) => d.name),
    cables: cableIds.size,
    renamed: renames.length,
  };
}

/** Status-bar text for a removal, or '' when nothing changed. */
export function retiredNotice(r: RetiredRemoval): string {
  if (!r.definitions.length && !r.renamed) return '';
  const parts = [];
  if (r.definitions.length)
    parts.push(
      `Removed retired equipment: ${r.definitions.join(', ')} (${r.devices.length} installed device(s), ${r.cables} cable(s)).`,
    );
  if (r.renamed) parts.push('Vented shelves are now named 1U shelf and 2U shelf.');
  return parts.join(' ');
}
