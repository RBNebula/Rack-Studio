import { describe, expect, it } from 'vitest';
import { clone } from '../model';
import { catalogueReferences } from '../catalogue';
import { createWorkspaceProject, exampleDefinitions } from '../examples';
import { createWorkspaceProject as legacyWorkspace } from '../testing/legacy-example';
import { accessoryPose } from '../engineering/attachments';
import { parseProject, serializeProject, validateReferences } from './project';
import { isRetiredDefinition, removeRetiredEquipment, retiredNotice } from './retired';

describe('retired built-in equipment', () => {
  it('is no longer offered by the application library, catalogue or starting project', () => {
    const names = exampleDefinitions().map((d) => d.name);
    for (const gone of [
      '24-port network switch',
      '24-port patch panel',
      '2U rack server',
      'Compact computer',
      '1U power distribution',
      'AVoIP encoder',
      '1U horizontal manager',
    ])
      expect(names).not.toContain(gone);
    expect(names).toEqual(expect.arrayContaining(['1U shelf', '2U shelf', '1U brush plate']));
    expect(names.some((n) => n.includes('vented'))).toBe(false);
    expect(catalogueReferences.map((r) => r.definition.manufacturer)).not.toContain('Cisco');
    expect(catalogueReferences.map((r) => r.definition.manufacturer)).not.toContain('Connectix');
    const start = createWorkspaceProject(false);
    expect(start.devices).toEqual([]);
    expect(start.cables).toEqual([]);
    expect(start.definitions.some(isRetiredDefinition)).toBe(false);
  });

  it('removes retired definitions, their devices and attached cables from an old project', () => {
    const old = legacyWorkspace(true);
    const before = serializeProject(old);
    const result = removeRetiredEquipment(old);
    expect(serializeProject(old)).toBe(before); // the input is not modified
    const p = result.project;
    expect(p.definitions.some(isRetiredDefinition)).toBe(false);
    expect(p.devices.map((d) => d.id)).toEqual(['shelf-1']);
    expect(p.cables).toEqual([]);
    expect(result.devices).toHaveLength(5);
    expect(result.cables).toBe(2);
    expect(p.definitions.find((d) => d.id === 'def-shelf')?.name).toBe('2U shelf');
    expect(p.definitions.find((d) => d.id === 'def-shelf-1')?.name).toBe('1U shelf');
    expect(validateReferences(p)).toEqual([]);
    expect(parseProject(serializeProject(p)).devices).toHaveLength(1);
    expect(retiredNotice(result)).toContain('2U rack server');
  });

  it('keeps user definitions that only share a name, and leaves a clean project untouched', () => {
    const p = legacyWorkspace(false);
    const copy = { ...clone(p.definitions.find((d) => d.id === 'def-switch')!), id: 'my-switch' };
    p.definitions.push(copy);
    const result = removeRetiredEquipment(p).project;
    expect(result.definitions.map((d) => d.id)).toContain('my-switch');
    const clean = createWorkspaceProject(false);
    expect(removeRetiredEquipment(clean).project).toBe(clean);
  });

  it('removes configured catalogue references by manufacturer and model', () => {
    const p = createWorkspaceProject(false);
    p.definitions.push({
      ...clone(p.definitions[0]),
      id: 'configured-cisco',
      name: 'My Cisco',
      manufacturer: 'Cisco',
      model: 'C1300-48P-4G',
    });
    expect(removeRetiredEquipment(p).project.definitions.map((d) => d.id)).not.toContain(
      'configured-cisco',
    );
  });

  it('detaches fixings from removed devices at their world pose and tidies cable references', () => {
    const p = legacyWorkspace(true);
    p.accessories.push({
      id: 'clip-on-switch',
      name: 'Clip on switch',
      kind: 'anchor',
      position: [10, 20, 30],
      size: [25, 5, 25],
      rotationDeg: [0, 90, 0],
      attachment: { kind: 'device', id: 'switch-1' },
      parentId: null,
      cableIds: [p.cables[0].id],
      evidence: 'user-entered',
    });
    const world = accessoryPose(p, p.accessories.at(-1)!);
    const kept = { ...clone(p.cables[0]), id: 'kept', followCableId: p.cables[0].id };
    p.devices.push({
      id: 'pc-kept',
      definitionId: 'def-user-rack-pc',
      name: 'Kept PC',
      startU: 12,
      face: 'front',
      supportId: null,
      installation: 'installed',
    });
    kept.source = { kind: 'device', deviceId: 'pc-kept', portId: 'rear-rj45' };
    kept.destination = { kind: 'external', destinationId: 'screen-1', portId: 'network' };
    kept.exitId = 'exit-1';
    p.cables.push(kept);
    const result = removeRetiredEquipment(p).project;
    const clip = result.accessories.find((a) => a.id === 'clip-on-switch')!;
    expect(clip.attachment).toBeUndefined();
    expect(clip.position).toEqual(world.position);
    expect(clip.cableIds).toEqual([]);
    expect(result.cables.find((c) => c.id === 'kept')?.followCableId).toBeNull();
    expect(validateReferences(result)).toEqual([]);
  });
});
