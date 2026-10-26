import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './state';
import { createExampleProject, createWorkspaceProject } from './examples';
import { parseProject, serializeProject } from './data/project';
import {
  analysePower,
  setDefinitionMass,
  setDefinitionPower,
  setPowerBank,
} from './engineering/power';
import { baseCable } from './examples';

beforeEach(() => {
  useStore.getState().replace(createWorkspaceProject());
  useStore.getState().set({ dirty: false });
});
describe('atomic project edits and recovery history', () => {
  it('starts a flat rack using screw-plane depth and cable numbers from zero', () => {
    const p = useStore.getState().project;
    expect(p.rack.depthMeaning).toBe('rail-spacing');
    expect(p.rack.sections).toHaveLength(1);
    expect(p.rack.sections[0].rearRailZMm).toBe(800);
    expect(p.cables.map((c) => c.label)).toEqual(['0', '1']);
    expect(p.cables.every((c) => c.serviceMm === 0)).toBe(true);
  });
  it('uses confirmed square holes and includes both 60 mm terminations in the bulk schedule', () => {
    const p = useStore.getState().project;
    expect(p.rack.holeType).toBe('square');
    expect(p.cables[1].terminationAMm).toBe(60);
    expect(p.cables[1].terminationBMm).toBe(60);
    expect(p.settings.scheduleColumns).toEqual(
      expect.arrayContaining(['terminationA', 'terminationB', 'terminationTotal']),
    );
  });
  it('rejects an invalid edit without changing authoritative project data or undo history', () => {
    const p = useStore.getState().project;
    expect(
      useStore.getState().edit('Invalid height', (v) => {
        v.rack.heightU = 2;
      }),
    ).toBe(false);
    expect(useStore.getState().project).toBe(p);
    expect(useStore.getState().past).toHaveLength(0);
    expect(useStore.getState().error).toMatch(/height|U|top|range/i);
  });
  it('rejects a new obstruction collision rather than leaving occupied equipment inside it', () => {
    const p = useStore.getState().project;
    expect(
      useStore.getState().edit('Obstacle', (v) => {
        v.accessories.push({
          id: 'obstruction',
          name: 'Measured obstruction',
          position: [0, 700, 140],
          size: [200, 100, 200],
          kind: 'obstruction',
          parentId: null,
          cableIds: [],
          evidence: 'user-entered',
        });
      }),
    ).toBe(false);
    expect(useStore.getState().project).toBe(p);
  });
  it('renumbers labels while preserving cable identity and endpoint references across undo, redo and reload', () => {
    const before = useStore.getState().project;
    const record = before.cables[0];
    expect(
      useStore.getState().edit('Renumber', (p) => {
        p.cables[0].label = '42';
        p.cables[0].name = 'PC uplink';
      }),
    ).toBe(true);
    let after = useStore.getState().project;
    expect(after.cables[0].id).toBe(record.id);
    expect(after.cables[0].source).toEqual(record.source);
    expect(after.cables[0].label).toBe('42');
    useStore.getState().undo();
    expect(useStore.getState().project.cables[0].label).toBe('0');
    useStore.getState().redo();
    after = useStore.getState().project;
    expect(after.cables[0].label).toBe('42');
    expect(parseProject(serializeProject(after)).cables[0]).toEqual(after.cables[0]);
  });
  it('rejects duplicate visible numbers and cyclic follow references atomically', () => {
    expect(
      useStore.getState().edit('Duplicate number', (p) => {
        p.cables[1].label = '0';
      }),
    ).toBe(false);
    expect(
      useStore.getState().edit('Circular run', (p) => {
        p.cables[0].followCableId = p.cables[1].id;
        p.cables[1].followCableId = p.cables[0].id;
      }),
    ).toBe(false);
    expect(useStore.getState().project.cables[0].followCableId).toBeNull();
  });
  it('refuses unsupported imported fields instead of silently stripping user data', () => {
    const p = useStore.getState().project;
    expect(() =>
      parseProject(JSON.stringify({ ...p, futureGeometry: { outline: [1, 2, 3] } })),
    ).toThrow(/avoid discarding data/);
    expect(() =>
      parseProject(JSON.stringify({ ...p, rack: { ...p.rack, unrecognisedLoadRating: 200 } })),
    ).toThrow(/rack.unrecognisedLoadRating/);
  });
  it('edits shared equipment power, bank limits and mass atomically with undo, redo and reload', () => {
    const store = useStore.getState;
    expect(
      store().edit('Power banks', (p) => {
        p.definitions.find((d) => d.id === 'def-pdu')!.powerBanks = [
          {
            id: 'top',
            name: 'Top row',
            portIds: ['iec1', 'iec2', 'iec3'],
            maxCurrentA: 16,
            outletMaxCurrentA: 10,
            voltageV: 230,
            evidence: 'user-entered',
            source: '',
          },
        ];
        p.cables.push({
          ...baseCable('PWR-001'),
          label: 'PWR-001',
          type: 'Power',
          source: { kind: 'device', deviceId: 'pdu-1', portId: 'iec1' },
          destination: { kind: 'device', deviceId: 'server-1', portId: 'power' },
        });
      }),
    ).toBe(true);
    expect(analysePower(store().project).distributors[0].banks[0].status).toBe('incomplete');
    expect(
      store().edit('Power draw', (p) => {
        setDefinitionPower(p, 'def-server', { nominalW: 1500, maxW: 3000 });
        setDefinitionMass(p, 'def-server', 21);
      }),
    ).toBe(true);
    let bank = analysePower(store().project).distributors[0].banks[0];
    expect(bank.max.knownA).toBeCloseTo(3000 / 230, 9);
    expect(bank.status).toBe('warning');
    expect(
      store().edit('Bank limit', (p) => setPowerBank(p, 'def-pdu', 'top', { maxCurrentA: 12 })),
    ).toBe(true);
    expect(analysePower(store().project).distributors[0].banks[0].status).toBe('over');
    // Invalid values are rejected without changing the project.
    const before = store().project;
    expect(
      store().edit('Inverted draw', (p) => setDefinitionPower(p, 'def-server', { nominalW: 4000 })),
    ).toBe(false);
    expect(store().project).toBe(before);
    store().undo();
    bank = analysePower(store().project).distributors[0].banks[0];
    expect(bank.maxCurrentA).toBe(16);
    expect(bank.status).toBe('warning');
    store().undo();
    const server = store().project.definitions.find((d) => d.id === 'def-server')!;
    expect(server.power).toBeUndefined();
    expect(server.massKg).toBeNull();
    store().redo();
    store().redo();
    const after = store().project;
    expect(after.definitions.find((d) => d.id === 'def-server')).toMatchObject({
      massKg: 21,
      power: { nominalW: 1500, maxW: 3000, evidence: 'user-entered' },
    });
    expect(after.definitions.find((d) => d.id === 'def-pdu')!.powerBanks![0].maxCurrentA).toBe(12);
    const reloaded = parseProject(serializeProject(after));
    expect(reloaded.definitions).toEqual(after.definitions);
    expect(analysePower(reloaded).distributors[0].banks[0].status).toBe('over');
  });
});

describe('gendered power couplers at the edit boundary', () => {
  const outletEnd = (n: number) => ({
    kind: 'device' as const,
    deviceId: 'pdu',
    portId: `iec${n}`,
  });
  function loadWithLegacyOutletCable() {
    const project = createExampleProject(false);
    project.devices = [
      {
        id: 'pdu',
        definitionId: 'def-pdu',
        name: 'PDU',
        startU: 1,
        face: 'rear',
        supportId: null,
        installation: 'installed',
      },
      {
        id: 'sw',
        definitionId: 'def-generic-switch-24',
        name: 'Switch',
        startU: 10,
        face: 'front',
        supportId: null,
        installation: 'installed',
      },
    ];
    project.cables = [
      {
        ...baseCable('LEGACY'),
        label: 'L',
        type: 'Power',
        source: outletEnd(1),
        destination: outletEnd(2),
      },
    ];
    useStore.getState().replace(parseProject(serializeProject(project)));
  }

  it('keeps a loaded outlet-to-outlet cable editable without blocking unrelated edits', () => {
    loadWithLegacyOutletCable();
    expect(
      useStore.getState().edit('Move switch', (p) => {
        p.devices.find((d) => d.id === 'sw')!.startU = 12;
      }),
    ).toBe(true);
    const p = useStore.getState().project;
    expect(p.cables.map((c) => [c.id, c.source, c.destination])).toEqual([
      ['LEGACY', outletEnd(1), outletEnd(2)],
    ]);
    expect(p.devices.find((d) => d.id === 'sw')!.startU).toBe(12);
  });

  it('rejects an edit that adds an outlet-to-outlet cable and accepts outlet to inlet', () => {
    loadWithLegacyOutletCable();
    const before = useStore.getState().project;
    expect(
      useStore.getState().edit('Bad cable', (p) => {
        p.cables.push({
          ...baseCable('BAD'),
          label: 'B',
          source: outletEnd(3),
          destination: outletEnd(4),
        });
      }),
    ).toBe(false);
    expect(useStore.getState().project).toBe(before);
    expect(useStore.getState().error).toContain('BAD: Two IEC-C13 couplers cannot mate');
    expect(
      useStore.getState().edit('Good cable', (p) => {
        p.cables.push({
          ...baseCable('GOOD'),
          label: 'G',
          source: { kind: 'device', deviceId: 'sw', portId: 'power' },
          destination: outletEnd(3),
        });
      }),
    ).toBe(true);
    expect(useStore.getState().project.cables.map((c) => c.id)).toEqual(['LEGACY', 'GOOD']);
  });
});
