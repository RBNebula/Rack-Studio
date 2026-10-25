import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { portSchema } from '../model';
import { createUserRackPc } from '../models/user-rack-pc';
import { baseCable, createWorkspaceProject } from '../examples';
import { portFaceAngle, portPanelCorners, portFootprint, portRotationDeg } from './ports';
import { portAperture } from '../ui/portGeometry';
import { designerIssues } from './model-designer';
import { parseProject, serializeProject } from '../data/project';
import { portWorld, portDirectionWorld } from './geometry';
import { routeCable } from './routing';

describe('connector roll about its face centre', () => {
  it('keeps legacy angles absent, normalizes signed/full-turn values and rejects non-finite angles', () => {
    const p = createUserRackPc().ports[0];
    expect(portRotationDeg(p)).toBe(0);
    expect(portSchema.parse(p)).not.toHaveProperty('rotationDeg');
    expect(portRotationDeg({ ...p, rotationDeg: -90 })).toBe(270);
    expect(portRotationDeg({ ...p, rotationDeg: 450 })).toBe(90);
    expect(portRotationDeg({ ...p, rotationDeg: 360 })).toBe(0);
    for (const rotationDeg of [NaN, Infinity, -Infinity])
      expect(portSchema.safeParse({ ...p, rotationDeg }).success).toBe(false);
  });
  it('computes exact quarter-turn and arbitrary-angle footprints without stretching the socket', () => {
    const p = { ...createUserRackPc().ports[0], widthMm: 12, heightMm: 5, rotationDeg: 90 };
    expect(portFootprint(p)).toEqual([5, 12]);
    p.rotationDeg = 30;
    expect(portFootprint(p)[0]).toBeCloseTo(12 * Math.cos(Math.PI / 6) + 2.5, 10);
    expect(portFootprint(p)[1]).toBeCloseTo(6 + 5 * Math.cos(Math.PI / 6), 10);
    expect(p.widthMm).toBe(12);
    expect(p.heightMm).toBe(5);
  });
  it('rejects a rotated socket that crosses a chassis edge even when its unrotated layout fits', () => {
    const d = createUserRackPc();
    d.ports = [{ ...d.ports[0], position: [0, 4, -2] }];
    expect(designerIssues(d)).toEqual([]);
    d.ports[0].rotationDeg = 90;
    expect(designerIssues(d).join()).toContain('beyond chassis face');
  });
  it.each(['front', 'rear'] as const)(
    'matches the rolled %s glyph to the shell aperture with the same viewed clockwise angle',
    (surface) => {
      const p = { ...createUserRackPc().ports[0], surface, rotationDeg: 37 };
      const corners = portPanelCorners(p),
        path = portAperture(p).getPoints();
      corners.forEach(([x, y], i) => {
        expect(path[i].x).toBeCloseTo(x, 10);
        expect(path[i].y).toBeCloseTo(y, 10);
      });
      const w = p.widthMm! / 2,
        h = p.heightMm! / 2;
      for (const [x, y] of [
        [-w, -h],
        [-w, h],
        [w, h],
        [w, -h],
      ]) {
        const v = new THREE.Vector3(x, y, 0).applyAxisAngle(
          new THREE.Vector3(0, 0, 1),
          portFaceAngle(p),
        );
        if (surface === 'front') v.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
        const distance = Math.min(
          ...corners.map(([cx, cy]) =>
            Math.hypot(cx - p.position[0] - v.x, cy - p.position[1] - v.y),
          ),
        );
        expect(distance).toBeLessThan(1e-9);
      }
    },
  );
  it('preserves connection identity, cable path, centre and exit direction when a connected socket rotates', () => {
    const p = createWorkspaceProject(false);
    p.devices = [8, 12].map((startU, i) => ({
      id: `pc${i}`,
      name: `PC ${i}`,
      definitionId: 'def-user-rack-pc',
      startU,
      face: 'front',
      supportId: null,
      installation: 'installed',
    }));
    const c = {
      ...baseCable('rotated'),
      source: { kind: 'device' as const, deviceId: 'pc0', portId: 'front-usb-top' },
      destination: { kind: 'device' as const, deviceId: 'pc1', portId: 'front-usb-top' },
    };
    p.cables = [c];
    const centre = portWorld(p, c.source),
      direction = portDirectionWorld(p, c.source),
      route = routeCable(p, c),
      cable = structuredClone(c);
    p.definitions.find((d) => d.id === 'def-user-rack-pc')!.ports[0].rotationDeg = 135;
    expect(portWorld(p, c.source)).toEqual(centre);
    expect(portDirectionWorld(p, c.source)).toEqual(direction);
    expect(routeCable(p, c)).toEqual(route);
    expect(c).toEqual(cable);
  });
  it('retains independent front/rear rotation and old unrotated ports through JSON round trips', () => {
    const p = createWorkspaceProject(false),
      d = p.definitions.find((d) => d.id === 'def-user-rack-pc')!;
    d.ports[0].rotationDeg = -30;
    d.ports[2].rotationDeg = 90;
    const restored = parseProject(serializeProject(p));
    expect(restored).toEqual(p);
    expect(restored.definitions.find((v) => v.id === d.id)!.ports[1]).not.toHaveProperty(
      'rotationDeg',
    );
  });
});
