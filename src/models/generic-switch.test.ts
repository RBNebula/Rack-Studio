import { describe, it, expect } from 'vitest';
import { createGenericSwitch, switchMountingSlots } from './generic-switch';
import { createWorkspaceProject, baseCable } from '../examples';
import { parseProject, serializeProject } from '../data/project';
import {
  deviceEarBoxes,
  mountingPlane,
  portWorld,
  portDirectionWorld,
  validatePlacement,
} from '../engineering/geometry';
import { designerIssues } from '../engineering/model-designer';
import { connectionIssues } from '../engineering/connectivity';
import { analyseCable } from '../engineering/analysis';
import type { Device } from '../model';

const installed = (face: Device['face'] = 'front'): Device => ({
  id: 'generic-switch',
  name: 'Generic switch',
  definitionId: 'def-generic-switch-24',
  startU: 8,
  face,
  supportId: null,
  installation: 'installed',
});
describe('generic single-row network switch', () => {
  it('provides exactly the requested 24 RJ45, two SFP cages and one rear AC input', () => {
    const d = createGenericSwitch();
    expect(d.ports).toHaveLength(27);
    expect(d.ports.filter((p) => p.connector === 'RJ45')).toHaveLength(24);
    expect(d.ports.filter((p) => p.connector === 'SFP').map((p) => p.surface)).toEqual([
      'front',
      'front',
    ]);
    expect(d.ports.filter((p) => p.surface === 'rear').map((p) => p.connector)).toEqual([
      'IEC-C14',
    ]);
    expect(d.faceFeatures ?? []).toEqual([]);
    expect(d.parts).toEqual([]);
    expect(d.manufacturer).toBe('');
    expect(d.evidence).toBe('example');
    expect(d.source).toContain('PROVISIONAL');
    expect(d.ports.every((p) => p.protocol === undefined)).toBe(true);
  });
  it('orders 1–24 left-to-right in one row without overlapping the two right-hand SFP cages', () => {
    const d = createGenericSwitch(),
      front = d.ports.filter((p) => p.surface === 'front');
    const bottomGap = (44.45 - d.heightMm) / 2;
    expect(switchMountingSlots(d).map((s) => s.y + bottomGap)).toEqual([6.35, 38.1, 6.35, 38.1]);
    expect(
      new Set(front.filter((p) => p.connector === 'RJ45').map((p) => p.position[1])).size,
    ).toBe(1);
    expect(front.slice(0, 24).map((p) => p.id)).toEqual(
      Array.from({ length: 24 }, (_, i) => `p${i + 1}`),
    );
    for (let i = 1; i < front.length; i++)
      expect(front[i - 1].position[0] - front[i].position[0]).toBeGreaterThan(
        (front[i - 1].widthMm! + front[i].widthMm!) / 2,
      );
    expect(designerIssues(d)).toEqual([]);
  });
  it.each(['front', 'rear'] as const)(
    'keeps %s ears tangent to the post plane and moves real sockets with that mounting orientation',
    (face) => {
      const p = createWorkspaceProject(false),
        device = installed(face);
      p.devices = [device];
      expect(validatePlacement(p, device)).toEqual([]);
      const plane = mountingPlane(p, device),
        ears = deviceEarBoxes(p, device);
      for (const ear of ears) expect(face === 'front' ? ear.max[2] : ear.min[2]).toBe(plane);
      expect(
        portWorld(p, { kind: 'device', deviceId: device.id, portId: 'power' })![2],
      ).toBeCloseTo(plane + (face === 'front' ? 325 : -325), 8);
      const direction = portDirectionWorld(p, {
        kind: 'device',
        deviceId: device.id,
        portId: 'p1',
      })!;
      expect(Math.abs(direction[0])).toBe(0);
      expect(direction[1]).toBe(0);
      expect(direction[2]).toBe(face === 'front' ? -1 : 1);
    },
  );
  it('uses the rear inlet as an actual power endpoint and retains sockets and geometry after a project round trip', () => {
    const p = createWorkspaceProject(false),
      device = installed();
    p.devices = [device, { ...device, id: 'pdu', definitionId: 'def-pdu', startU: 3 }];
    const c = {
      ...baseCable('switch-power'),
      type: 'Power',
      supply: 'preterminated' as const,
      suppliedLengthMm: 2000,
      source: { kind: 'device' as const, deviceId: 'pdu', portId: 'iec1' },
      destination: { kind: 'device' as const, deviceId: device.id, portId: 'power' },
      terminationAMm: 0,
      terminationBMm: 0,
    };
    expect(connectionIssues(p, c.source, c.destination)).toEqual([]);
    p.cables = [c];
    expect(analyseCable(p, c).route.valid).toBe(true);
    const restored = parseProject(serializeProject(p));
    expect(restored.definitions.find((d) => d.id === device.definitionId)).toEqual(
      createGenericSwitch(),
    );
    expect(restored.cables[0]).toEqual(c);
    expect(
      restored.definitions.find((d) => d.id === 'def-switch')!.ports.some((p) => p.id === 'uplink'),
    ).toBe(true);
  });
});
