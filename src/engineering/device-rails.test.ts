import { describe, it, expect } from 'vitest';
import { createWorkspaceProject, baseCable } from '../examples';
import type { Device } from '../model';
import {
  deviceRailBoxes,
  devicePosition,
  portWorld,
  validatePlacement,
  allObstacles,
  segmentHitsBox,
  deviceEarBoxes,
} from './geometry';
import { analyseCable } from './analysis';
import { parseProject, serializeProject } from '../data/project';
const rails = () => ({
  memberLengthMm: 520,
  profileWidthMm: 8,
  profileHeightMm: 28,
  chassisLeadMm: 100,
  extensionMm: 0,
  evidence: 'example' as const,
});
const device = (face: Device['face'] = 'front'): Device => ({
  id: 'pc',
  definitionId: 'def-user-rack-pc',
  name: 'PC',
  startU: 8,
  face,
  supportId: null,
  installation: 'installed',
  rails: rails(),
});
function fixture(face: Device['face'] = 'front') {
  const p = createWorkspaceProject(false);
  p.devices = [device(face)];
  return p;
}
describe('telescoping device rails', () => {
  it.each(['front', 'rear'] as const)(
    'seats %s brackets against the post faces without entering steel or the device ears',
    (face) => {
      const p = fixture(face),
        d = p.devices[0];
      const brackets = deviceRailBoxes(p, d).filter((b) => b.id.endsWith('bracket'));
      const posts = allObstacles(p).filter(
        (b) => b.id.startsWith('rack:') && b.id.endsWith(':rail'),
      );
      expect(brackets).toHaveLength(4);
      for (const b of brackets) {
        if (b.id.endsWith('far-bracket'))
          expect(face === 'front' ? b.min[2] : b.max[2]).toBe(face === 'front' ? 800 : 0);
        else expect(face === 'front' ? b.min[2] : b.max[2]).toBe(face === 'front' ? 10 : 790);
        for (const ear of deviceEarBoxes(p, d))
          expect(b.min.every((v, i) => v < ear.max[i] - 1e-7 && b.max[i] > ear.min[i] + 1e-7)).toBe(
            false,
          );
        for (const post of posts)
          expect(
            b.min.every((v, i) => v < post.max[i] - 1e-7 && b.max[i] > post.min[i] + 1e-7),
          ).toBe(false);
        expect(
          posts.some(
            (post) =>
              Math.min(Math.abs(b.max[2] - post.min[2]), Math.abs(b.min[2] - post.max[2])) < 1e-7 &&
              b.min[0] < post.max[0] &&
              b.max[0] > post.min[0],
          ),
        ).toBe(true);
      }
    },
  );
  it.each(['front', 'rear'] as const)(
    'keeps %s outer beams fixed while chassis, inner members and ports move outward',
    (face) => {
      const p = fixture(face),
        d = p.devices[0],
        sign = face === 'front' ? 1 : -1,
        ep = { kind: 'device' as const, deviceId: 'pc', portId: 'rear-rj45' };
      expect(validatePlacement(p, d)).toEqual([]);
      const fixed = deviceRailBoxes(p, d).filter(
          (b) => b.id.endsWith('outer') || b.id.endsWith('bracket'),
        ),
        start = portWorld(p, ep)!,
        body = devicePosition(p, d);
      d.rails!.extensionMm = 600;
      expect(validatePlacement(p, d)).toEqual([]);
      expect(portWorld(p, ep)![2] - start[2]).toBe(-sign * 600);
      expect(devicePosition(p, d)[2] - body[2]).toBe(-sign * 600);
      expect(
        deviceRailBoxes(p, d).filter((b) => b.id.endsWith('outer') || b.id.endsWith('bracket')),
      ).toEqual(fixed);
      const inner = deviceRailBoxes(p, d).find((b) => b.id.endsWith('inner'))!;
      expect(face === 'front' ? inner.min[2] : 800 - inner.max[2]).toBe(-500);
    },
  );
  it('has freely adjustable rack spans without guessed min/max constraints', () => {
    const p = fixture();
    p.rack.sections[0].rearRailZMm = 600;
    expect(validatePlacement(p, p.devices[0])).toEqual([]);
    const outer = deviceRailBoxes(p, p.devices[0]).find((b) => b.id.endsWith('outer'))!;
    expect(outer.max[2] - outer.min[2]).toBe(600);
  });
  it('puts beams and brackets into cable collision checks without treating them as connector owners', () => {
    const p = fixture();
    const b = allObstacles(p).find((b) => b.id.endsWith(':outer'))!;
    const x = (b.min[0] + b.max[0]) / 2,
      y = (b.min[1] + b.max[1]) / 2;
    expect(segmentHitsBox([x, y, b.min[2] - 10], [x, y, b.max[2] + 10], b, 2)).toBe(true);
    expect(b.id).toMatch(/^rail:/);
  });
  it('rejects loss of overlap, insufficient side clearance and an obstruction along the travel sweep', () => {
    const p = fixture(),
      d = p.devices[0];
    d.rails!.extensionMm = 1300;
    expect(validatePlacement(p, d).join()).toContain('lose overlap');
    d.rails!.extensionMm = 600;
    d.rails!.profileWidthMm = 20;
    expect(validatePlacement(p, d).join()).toContain('clear opening');
    d.rails!.profileWidthMm = 8;
    p.accessories = [
      {
        id: 'blocked',
        name: 'obstruction',
        kind: 'obstruction',
        position: [0, 330, -50],
        size: [20, 20, 20],
        parentId: null,
        cableIds: [],
        evidence: 'example',
      },
    ];
    expect(validatePlacement(p, d).join()).toContain('accessory:blocked');
  });
  it('retains fixed assembly length and endpoint IDs while the extended pose reports insufficient cable', () => {
    const p = fixture(),
      d = p.devices[0];
    p.devices.push({ ...device(), id: 'pc2', startU: 12, rails: undefined });
    const c = baseCable('0');
    c.source = { kind: 'device', deviceId: 'pc', portId: 'front-usb-top' };
    c.destination = { kind: 'device', deviceId: 'pc2', portId: 'front-usb-top' };
    c.supply = 'preterminated';
    c.suppliedLengthMm = 10000;
    const old = analyseCable(p, c);
    expect(old.route.valid).toBe(true);
    c.suppliedLengthMm = old.requiredMm! + 10;
    p.cables = [c];
    d.rails!.extensionMm = 600;
    const after = analyseCable(p, c);
    expect(after.route.valid).toBe(true);
    expect(after.status).toBe('Insufficient length');
    const restored = parseProject(serializeProject(p));
    expect(restored.devices[0].rails).toEqual(d.rails);
    expect(restored.cables[0]).toEqual(c);
  });
});
