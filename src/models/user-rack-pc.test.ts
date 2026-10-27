import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createUserRackPc } from './user-rack-pc';
import { baseCable, createWorkspaceProject } from '../testing/legacy-example';
import { definitionSchema, portSchema, type Device } from '../model';
import { parseProject, serializeProject } from '../data/project';
import {
  deviceChassisBoxes,
  deviceEarBoxes,
  portDirectionWorld,
  portWorld,
  validatePlacement,
} from '../engineering/geometry';
import { analyseCable } from '../engineering/analysis';
import { connectorsCompatible } from '../engineering/connectivity';

const instance = (face: Device['face'] = 'front'): Device => ({
  id: 'user-pc',
  definitionId: 'def-user-rack-pc',
  name: 'User PC',
  startU: 8,
  face,
  supportId: null,
  installation: 'installed',
});
function fixture() {
  const project = createWorkspaceProject(false);
  project.devices = [instance()];
  project.cables = [];
  return project;
}

describe('photographed user rack PC', () => {
  it('keeps measured inch conversions, confirmed 1U and unresolved physical calibration distinct', () => {
    const d = createUserRackPc();
    expect(d.widthMm).toBeCloseTo(17 * 25.4, 9);
    expect(d.depthMm).toBe(15 * 25.4);
    expect(d.faceWidthMm).toBeCloseTo(19 * 25.4, 9);
    expect(d.heightU).toBe(1);
    expect(d.heightMm).toBe(43);
    expect(d.evidence).toBe('user-entered');
    expect(d.source).toContain('PROVISIONAL');
    expect(d.earThicknessMm).toBeNull();
    expect(d.massKg).toBeNull();
    expect(d.manufacturer).toBe('');
    expect(d.model).toBe('');
  });

  it('uses all 17 digitized photo centres with opposite front/rear horizontal conventions', () => {
    const map = JSON.parse(readFileSync('docs/user-pc-port-map.json', 'utf8')) as {
      ports: {
        id: string;
        surface: string;
        uv: [number, number];
        positionXYmm: [number, number];
      }[];
    };
    const d = createUserRackPc();
    expect(d.ports).toHaveLength(17);
    expect(new Set(d.ports.map((p) => p.id)).size).toBe(17);
    expect(d.ports.filter((p) => p.surface === 'front')).toHaveLength(2);
    expect(d.ports.filter((p) => p.surface === 'rear' && p.connector === 'USB-A')).toHaveLength(6);
    for (const observation of map.ports) {
      const p = d.ports.find((port) => port.id === observation.id)!;
      expect(p.position.slice(0, 2)).toEqual(observation.positionXYmm);
      const front = p.surface === 'front';
      expect(p.position[0]).toBeCloseTo((observation.uv[0] - 0.5) * 431.8 * (front ? -1 : 1), 1);
      expect(p.position[1]).toBeCloseTo((1 - observation.uv[1]) * 43, 1);
      expect(p.position[2]).toBe(front ? -2 : 381);
      expect(p.direction).toEqual([0, 0, front ? -1 : 1]);
      expect(p.evidence).toBe('example');
      expect(p.widthMm).toBeGreaterThan(0);
      expect(p.heightMm).toBeGreaterThan(0);
    }
    expect(d.ports.find((p) => p.id === 'rear-video-top')?.connector).toBe('DisplayPort');
    expect(connectorsCompatible('Video-unconfirmed', 'DisplayPort')).toBe(false);
    expect(connectorsCompatible('IEC-C14', 'IEC-C13')).toBe(true);
  });

  it.each(['front', 'rear'] as const)(
    'mounts %s with ears touching the rail and mirrors every endpoint and normal',
    (face) => {
      const project = fixture();
      const d = project.devices[0];
      d.face = face;
      expect(validatePlacement(project, d)).toEqual([]);
      const plane = face === 'front' ? 0 : 800;
      const ear = deviceEarBoxes(project, d)[0];
      expect(face === 'front' ? ear.max[2] : ear.min[2]).toBe(plane);
      const chassis = deviceChassisBoxes(project, d)[0];
      expect(face === 'front' ? chassis.min[2] : chassis.max[2]).toBe(plane);
      expect(chassis.max[2] - chassis.min[2]).toBe(381);
      const sign = face === 'front' ? 1 : -1;
      for (const port of createUserRackPc().ports) {
        const endpoint = { kind: 'device' as const, deviceId: d.id, portId: port.id };
        expect(portWorld(project, endpoint)![0]).toBe(sign * port.position[0]);
        expect(portWorld(project, endpoint)![2]).toBe(plane + sign * port.position[2]);
        expect(portDirectionWorld(project, endpoint)![2]).toBe(sign * port.direction[2]);
      }
    },
  );

  it('preserves measured definition, photo metadata, fittings and connected endpoint IDs through move and reload', () => {
    const project = fixture();
    project.devices.push({ ...instance(), id: 'other-pc', startU: 12 });
    const cable = baseCable('0');
    cable.source = { kind: 'device', deviceId: 'user-pc', portId: 'rear-rj45' };
    cable.destination = { kind: 'device', deviceId: 'other-pc', portId: 'rear-rj45' };
    project.cables = [cable];
    const before = portWorld(project, cable.source)!;
    project.devices[0].startU++;
    const restored = parseProject(serializeProject(project));
    expect(restored).toEqual(project);
    expect(restored.cables[0].source).toEqual(cable.source);
    expect(portWorld(restored, cable.source)![1] - before[1]).toBeCloseTo(44.45, 9);
    expect(restored.definitions.find((d) => d.id === 'def-user-rack-pc')).toEqual(
      createUserRackPc(),
    );
  });

  it('keeps route calculations unverified while connected port positions are only photo estimates', () => {
    const project = fixture();
    project.devices.push({ ...instance(), id: 'other-pc', startU: 12 });
    project.rack.evidence = 'verified';
    project.rack.railWidthMm = 10;
    project.rack.railThicknessMm = 10;
    const definition = project.definitions.find((d) => d.id === 'def-user-rack-pc')!;
    definition.evidence = 'verified';
    definition.earThicknessMm = 2;
    const cable = baseCable('0');
    cable.source = { kind: 'device', deviceId: 'user-pc', portId: 'rear-rj45' };
    cable.destination = { kind: 'device', deviceId: 'other-pc', portId: 'rear-rj45' };
    expect(analyseCable(project, cable).route.valid).toBe(true);
    expect(analyseCable(project, cable).status).toBe('Unverified model');
    definition.ports.find((p) => p.id === 'rear-rj45')!.evidence = 'verified';
    expect(analyseCable(project, cable).status).toBe('Calculated');
  });

  it('accepts legacy definitions without appearance/port metadata and rejects invalid socket sizes', () => {
    const legacy = { ...createUserRackPc() } as Record<string, unknown>;
    delete legacy.appearance;
    expect(definitionSchema.parse(legacy).appearance).toBeNull();
    const port = createUserRackPc().ports[0];
    expect(portSchema.safeParse({ ...port, widthMm: 0 }).success).toBe(false);
    expect(portSchema.safeParse({ ...port, heightMm: Number.NaN }).success).toBe(false);
  });

  it('rejects imported appearance combinations that would render a chassis absent from the collision model', () => {
    const pc = createUserRackPc();
    for (const mutation of [
      { bodyMode: 'parts' },
      { mounting: 'shelf' },
      { mounting: 'freestanding' },
      { mounting: 'side' },
    ]) {
      expect(definitionSchema.safeParse({ ...pc, ...mutation }).success).toBe(false);
      expect(definitionSchema.safeParse({ ...pc, ...mutation, appearance: null }).success).toBe(
        true,
      );
    }
  });
});
