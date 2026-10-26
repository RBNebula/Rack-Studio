import { describe, expect, it } from 'vitest';
import type { Cable, DeviceDefinition, Endpoint, Port, Project } from '../model';
import { baseCable, createExampleProject } from '../examples';
import { analyseProject } from './analysis';
import {
  POWER_WARNING_UTILISATION,
  analysePower,
  powerDefinitionIssues,
  powerStatus,
  setDefinitionMass,
  setDefinitionPower,
  setPowerBank,
} from './power';

const iec = (id: string, connector: 'IEC-C13' | 'IEC-C14', x: number): Port => ({
  id,
  name: id,
  connector,
  surface: 'rear',
  position: [x, 20, 302],
  direction: [0, 0, 1],
  multiple: false,
});
const baseDefinition = (id: string, extra: Partial<DeviceDefinition>): DeviceDefinition => ({
  id,
  name: id,
  manufacturer: 'Test',
  model: 'Fixture',
  category: 'Power equipment',
  widthMm: 430,
  heightU: 1,
  heightMm: 43,
  depthMm: 300,
  faceWidthMm: 482.6,
  earThicknessMm: 2,
  shelf: null,
  plate: null,
  appearance: null,
  mounting: 'direct',
  bodyMode: 'box',
  color: '#333333',
  evidence: 'example',
  source: 'Unit-test fixture',
  massKg: null,
  railMinMm: null,
  railMaxMm: null,
  screwOffsetsMm: [6.35, 38.1],
  ports: [],
  parts: [],
  frontImage: null,
  rearImage: null,
  ...extra,
});
/** Two banks of four C13 outlets: 16 A per bank, 10 A per outlet, 230 V, plus a C14 inlet. */
const pduDefinition = (id = 'def-fixture-pdu'): DeviceDefinition =>
  baseDefinition(id, {
    ports: [
      ...Array.from({ length: 8 }, (_, i) => iec(`o${i + 1}`, 'IEC-C13', -180 + i * 40)),
      iec('inlet', 'IEC-C14', 190),
    ],
    power: { nominalW: 0, maxW: 0, evidence: 'example', source: 'Passive fixture' },
    powerBanks: [
      {
        id: 'top',
        name: 'Top row',
        portIds: ['o1', 'o2', 'o3', 'o4'],
        maxCurrentA: 16,
        outletMaxCurrentA: 10,
        voltageV: 230,
        evidence: 'example',
        source: 'Fixture',
      },
      {
        id: 'bottom',
        name: 'Bottom row',
        portIds: ['o5', 'o6', 'o7', 'o8'],
        maxCurrentA: 16,
        outletMaxCurrentA: 10,
        voltageV: 230,
        evidence: 'example',
        source: 'Fixture',
      },
    ],
  });
const consumerDefinition = (
  id: string,
  nominalW: number | null,
  maxW: number | null,
  massKg: number | null = null,
): DeviceDefinition =>
  baseDefinition(id, {
    category: 'Computers',
    massKg,
    ports: [iec('psu1', 'IEC-C14', -100), iec('psu2', 'IEC-C14', 100)],
    power: { nominalW, maxW, evidence: 'user-entered', source: 'Fixture' },
  });

function fixture(): Project {
  const p = createExampleProject(false);
  p.definitions.push(pduDefinition());
  p.devices.push({
    id: 'pdu',
    definitionId: 'def-fixture-pdu',
    name: 'PDU',
    startU: 1,
    face: 'front',
    supportId: null,
    installation: 'installed',
  });
  return p;
}
let unit = 2;
function addConsumer(p: Project, id: string, nominalW: number | null, maxW: number | null) {
  p.definitions.push(consumerDefinition(`def-c-${id}`, nominalW, maxW));
  p.devices.push({
    id,
    definitionId: `def-c-${id}`,
    name: id,
    startU: unit++,
    face: 'front',
    supportId: null,
    installation: 'installed',
  });
}
const device = (deviceId: string, portId: string): Endpoint => ({
  kind: 'device',
  deviceId,
  portId,
});
function connect(p: Project, id: string, source: Endpoint, destination: Endpoint) {
  const cable: Cable = { ...baseCable(id), label: id, source, destination, type: 'Power' };
  p.cables.push(cable);
}
const bank = (p: Project, bankId: string, distributor = 'pdu') =>
  analysePower(p)
    .distributors.find((d) => d.deviceId === distributor)!
    .banks.find((b) => b.bankId === bankId)!;

/** Four consumers on the top row, one per outlet, each drawing `maxW` at maximum. */
function topRowAt(maxW: number) {
  const p = fixture();
  for (let i = 1; i <= 4; i++) {
    addConsumer(p, `pc${i}`, maxW / 2, maxW);
    connect(p, `P${i}`, device('pdu', `o${i}`), device(`pc${i}`, 'psu1'));
  }
  return p;
}

describe('power bank utilisation thresholds', () => {
  it('uses an 80 % warning threshold and over only above 100 %', () => {
    expect(POWER_WARNING_UTILISATION).toBe(0.8);
    expect(powerStatus(0.79, true)).toBe('ok');
    expect(powerStatus(0.8, true)).toBe('warning');
    expect(powerStatus(1, true)).toBe('warning');
    expect(powerStatus(1.01, true)).toBe('over');
    expect(powerStatus(0.5, false)).toBe('incomplete');
    expect(powerStatus(0.85, false)).toBe('warning');
  });
  it.each([
    // total W = utilisation × 16 A × 230 V, split over four outlets
    [0.79, 2907.2, 'ok'],
    [0.8, 2944, 'warning'],
    [1, 3680, 'warning'],
    [1.01, 3716.8, 'over'],
  ] as const)('reports a 16 A bank at %s utilisation as %s', (utilisation, totalW, status) => {
    const result = bank(topRowAt(totalW / 4), 'top');
    expect(result.max.knownW).toBeCloseTo(totalW, 6);
    expect(result.max.knownA).toBeCloseTo(utilisation * 16, 6);
    expect(result.nominal.knownW).toBeCloseTo(totalW / 2, 6);
    expect(result.utilisation).toBeCloseTo(utilisation, 9);
    expect(result.status).toBe(status);
    expect(result.max.complete).toBe(true);
    expect(result.consumers.map((c) => c.deviceId)).toEqual(['pc1', 'pc2', 'pc3', 'pc4']);
    // Each outlet carries a quarter of the load, well below its 10 A rating.
    expect(result.outlets.map((o) => o.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(result.outlets[0].max.knownA).toBeCloseTo((utilisation * 16) / 4, 6);
    const other = bank(topRowAt(totalW / 4), 'bottom');
    expect(other.max.knownW).toBe(0);
    expect(other.status).toBe('ok');
    const codes = analysePower(topRowAt(totalW / 4)).issues.map((i) => i.code);
    expect(codes).toEqual(
      status === 'ok' ? [] : status === 'over' ? ['bank-over'] : ['bank-warning'],
    );
  });
  it('checks each outlet against its own current rating', () => {
    const p = fixture();
    addConsumer(p, 'heater', 1500, 2400);
    addConsumer(p, 'server', 1000, 1840);
    connect(p, 'P1', device('pdu', 'o1'), device('heater', 'psu1'));
    connect(p, 'P2', device('pdu', 'o2'), device('server', 'psu1'));
    const top = bank(p, 'top');
    expect(top.outlets[0].max.knownA).toBeCloseTo(2400 / 230, 9);
    expect(top.outlets[0].utilisation).toBeCloseTo(2400 / 230 / 10, 9);
    expect(top.outlets[0].status).toBe('over');
    expect(top.outlets[1].max.knownA).toBeCloseTo(8, 9);
    expect(top.outlets[1].status).toBe('warning');
    expect(top.outlets[2]).toMatchObject({ status: 'ok', cableIds: [], consumerDeviceIds: [] });
    // Bank: 4240 W / 230 V = 18.43 A of 16 A.
    expect(top.max.knownA).toBeCloseTo(4240 / 230, 9);
    expect(top.status).toBe('over');
    const issues = analysePower(p).issues;
    expect(issues.map((i) => [i.code, i.portId])).toEqual([
      ['outlet-over', 'o1'],
      ['outlet-warning', 'o2'],
      ['bank-over', null],
    ]);
    expect(issues[0].message).toContain('10.43 A of 10.0 A');
  });
});

describe('unknown power values', () => {
  it('lists an unknown consumer and keeps the known part, never counting it as zero load', () => {
    const p = fixture();
    addConsumer(p, 'known', 400, 600);
    addConsumer(p, 'unknown', 200, null);
    connect(p, 'P1', device('pdu', 'o1'), device('known', 'psu1'));
    connect(p, 'P2', device('unknown', 'psu1'), device('pdu', 'o2'));
    const top = bank(p, 'top');
    expect(top.status).toBe('incomplete');
    expect(top.max).toMatchObject({ knownW: 600, complete: false });
    expect(top.nominal).toMatchObject({ knownW: 600, complete: true });
    expect(top.unknownConsumers).toEqual([
      {
        deviceId: 'unknown',
        name: 'unknown',
        reason: 'No maximum draw recorded for its equipment model.',
      },
    ]);
    expect(top.outlets[1].status).toBe('incomplete');
    const issues = analysePower(p).issues;
    expect(issues.map((i) => i.code)).toEqual(['bank-incomplete']);
    expect(issues[0].message).toContain('unknown draw for unknown');
  });
  it('treats a consumer without any power record as unknown', () => {
    const p = fixture();
    addConsumer(p, 'pc', 100, 200);
    delete p.definitions.find((d) => d.id === 'def-c-pc')!.power;
    connect(p, 'P1', device('pdu', 'o1'), device('pc', 'psu1'));
    const top = bank(p, 'top');
    expect(top.status).toBe('incomplete');
    expect(top.unknownConsumers[0].reason).toBe(
      'No nominal or maximum draw recorded for its equipment model.',
    );
    expect(analysePower(p).totals.power.missing).toEqual([
      { deviceId: 'pc', name: 'pc', missingNominal: true, missingMax: true },
    ]);
  });
  it('lets a known overload win over incompleteness', () => {
    const p = fixture();
    addConsumer(p, 'big', 3000, 3800);
    addConsumer(p, 'unknown', null, null);
    connect(p, 'P1', device('pdu', 'o1'), device('big', 'psu1'));
    connect(p, 'P2', device('pdu', 'o2'), device('unknown', 'psu1'));
    const top = bank(p, 'top');
    expect(top.status).toBe('over');
    expect(top.max.complete).toBe(false);
    expect(analysePower(p).issues.map((i) => i.code)).toEqual([
      'outlet-over',
      'bank-over',
      'bank-incomplete',
    ]);
  });
  it('ignores an external endpoint as a consumer but reports it and marks the bank incomplete', () => {
    const p = fixture();
    p.destinations.push({
      id: 'van',
      name: 'Vehicle socket',
      location: '',
      notes: '',
      ports: [{ ...iec('in', 'IEC-C14', 0) }],
      position: null,
    });
    addConsumer(p, 'pc', 100, 200);
    connect(p, 'P1', device('pdu', 'o1'), device('pc', 'psu1'));
    p.cables.push({
      ...baseCable('X1'),
      label: 'X1',
      source: device('pdu', 'o3'),
      destination: { kind: 'external', destinationId: 'van', portId: 'in' },
      exitId: 'exit-1',
    });
    const top = bank(p, 'top');
    expect(top.externalOutlets).toEqual([{ portId: 'o3', cableId: 'X1', destinationId: 'van' }]);
    expect(top.consumers.map((c) => c.deviceId)).toEqual(['pc']);
    expect(top.unknownConsumers).toEqual([]);
    expect(top.max).toMatchObject({ knownW: 200, complete: false });
    expect(top.status).toBe('incomplete');
    expect(top.outlets[2]).toMatchObject({
      externalDestinationIds: ['van'],
      status: 'incomplete',
    });
    const issues = analysePower(p).issues;
    expect(issues.map((i) => i.code)).toEqual(['external-on-bank', 'bank-incomplete']);
    expect(issues[0]).toMatchObject({ cableId: 'X1', portId: 'o3', bankId: 'top' });
  });
});

describe('redundant feeds and chained distributors', () => {
  it('counts a dual-fed device fully against each feeding bank but once in totals', () => {
    const p = fixture();
    addConsumer(p, 'server', 450, 750);
    connect(p, 'A', device('pdu', 'o1'), device('server', 'psu1'));
    connect(p, 'B', device('pdu', 'o5'), device('server', 'psu2'));
    const analysis = analysePower(p);
    for (const id of ['top', 'bottom']) {
      const b = bank(p, id);
      expect(b.max.knownW).toBe(750);
      expect(b.max.knownA).toBeCloseTo(750 / 230, 9);
      expect(b.consumers[0]).toMatchObject({ deviceId: 'server', redundantFeed: true });
    }
    const server = analysis.devices.find((d) => d.deviceId === 'server')!;
    expect(server.redundantFeed).toBe(true);
    expect(server.feeds.map((f) => [f.bankId, f.outletPortId, f.inletPortId])).toEqual([
      ['top', 'o1', 'psu1'],
      ['bottom', 'o5', 'psu2'],
    ]);
    expect(analysis.totals.power.max).toEqual({ knownW: 750, complete: true });
    expect(analysis.totals.power.nominal).toEqual({ knownW: 450, complete: true });
    // The PDU's own inlet carries the server once.
    expect(analysis.distributors[0].input.max).toEqual({ knownW: 750, complete: true });
  });
  it('counts a device fed from two outlets of one bank once in that bank', () => {
    const p = fixture();
    addConsumer(p, 'server', 450, 750);
    connect(p, 'A', device('pdu', 'o1'), device('server', 'psu1'));
    connect(p, 'B', device('pdu', 'o2'), device('server', 'psu2'));
    const top = bank(p, 'top');
    expect(top.max.knownW).toBe(750);
    expect(top.outlets[0].max.knownW).toBe(750);
    expect(top.outlets[1].max.knownW).toBe(750);
    expect(top.consumers).toHaveLength(1);
    expect(top.consumers[0].outletPortIds).toEqual(['o1', 'o2']);
  });
  it('adds a chained distributor’s own draw and downstream load to its upstream bank', () => {
    let p = fixture();
    p.definitions.push({
      ...pduDefinition('def-ups'),
      power: { nominalW: 30, maxW: 40, evidence: 'example', source: '' },
    });
    p.devices.push({
      id: 'ups',
      definitionId: 'def-ups',
      name: 'UPS',
      startU: 15,
      face: 'front',
      supportId: null,
      installation: 'installed',
    });
    p.definitions.find((d) => d.id === 'def-fixture-pdu')!.power = {
      nominalW: 10,
      maxW: 15,
      evidence: 'example',
      source: '',
    };
    addConsumer(p, 'pc1', 500, 800);
    addConsumer(p, 'pc2', 300, 600);
    connect(p, 'U1', device('ups', 'o1'), device('pdu', 'inlet'));
    connect(p, 'P1', device('pdu', 'o1'), device('pc1', 'psu1'));
    connect(p, 'P2', device('pdu', 'o5'), device('pc2', 'psu1'));
    const upstream = bank(p, 'top', 'ups');
    expect(upstream.consumers.map((c) => c.deviceId)).toEqual(['pdu']);
    expect(upstream.max).toMatchObject({ knownW: 15 + 800 + 600, complete: true });
    expect(upstream.nominal).toMatchObject({ knownW: 10 + 500 + 300, complete: true });
    expect(upstream.max.knownA).toBeCloseTo(1415 / 230, 9);
    expect(upstream.status).toBe('ok');
    expect(bank(p, 'top').max.knownW).toBe(800);
    const analysis = analysePower(p);
    expect(analysis.distributors.map((d) => [d.deviceId, d.input.max.knownW])).toEqual([
      ['pdu', 1415],
      ['ups', 1455],
    ]);
    // Totals count every device's own draw once: 15 + 40 + 800 + 600.
    expect(analysis.totals.power.max).toEqual({ knownW: 1455, complete: true });
    // An unknown downstream draw propagates upstream as incomplete.
    p = structuredClone(p);
    p.definitions.find((d) => d.id === 'def-c-pc2')!.power!.maxW = null;
    const incomplete = bank(p, 'top', 'ups');
    expect(incomplete.status).toBe('incomplete');
    expect(incomplete.unknownConsumers).toEqual([
      { deviceId: 'pdu', name: 'PDU', reason: 'Its downstream load is incomplete.' },
    ]);
    expect(incomplete.max).toMatchObject({ knownW: 815, complete: false });
  });
  it('counts a device shared by two chained distributors once upstream', () => {
    const p = fixture();
    p.definitions.push(pduDefinition('def-ups'));
    p.definitions.push(pduDefinition('def-pdu-b'));
    for (const [id, def, u] of [
      ['ups', 'def-ups', 15],
      ['pdu-b', 'def-pdu-b', 16],
    ] as const)
      p.devices.push({
        id,
        definitionId: def,
        name: id,
        startU: u,
        face: 'front',
        supportId: null,
        installation: 'installed',
      });
    addConsumer(p, 'server', 400, 700);
    connect(p, 'U1', device('ups', 'o1'), device('pdu', 'inlet'));
    connect(p, 'U2', device('ups', 'o2'), device('pdu-b', 'inlet'));
    connect(p, 'A', device('pdu', 'o1'), device('server', 'psu1'));
    connect(p, 'B', device('pdu-b', 'o1'), device('server', 'psu2'));
    expect(bank(p, 'top').max.knownW).toBe(700);
    expect(bank(p, 'top', 'pdu-b').max.knownW).toBe(700);
    expect(bank(p, 'top', 'ups').max).toMatchObject({ knownW: 700, complete: true });
  });
  it('reports a distribution cycle without recursing forever', () => {
    const p = fixture();
    p.definitions.push(pduDefinition('def-pdu-b'));
    p.devices.push({
      id: 'pdu-b',
      definitionId: 'def-pdu-b',
      name: 'PDU B',
      startU: 16,
      face: 'front',
      supportId: null,
      installation: 'installed',
    });
    addConsumer(p, 'pc', 100, 200);
    connect(p, 'C1', device('pdu', 'o1'), device('pdu-b', 'inlet'));
    connect(p, 'C2', device('pdu-b', 'o1'), device('pdu', 'inlet'));
    connect(p, 'P1', device('pdu-b', 'o2'), device('pc', 'psu1'));
    const analysis = analysePower(p);
    const cycles = analysis.issues.filter((i) => i.code === 'distribution-cycle');
    expect(cycles).toHaveLength(1);
    expect(cycles[0].message).toContain('PDU → PDU B');
    expect(analysis.devices.filter((d) => d.inCycle).map((d) => d.deviceId)).toEqual([
      'pdu',
      'pdu-b',
    ]);
    const top = bank(p, 'top');
    expect(top.status).toBe('incomplete');
    expect(top.unknownConsumers[0]).toMatchObject({
      deviceId: 'pdu-b',
      reason: 'Part of a power distribution cycle.',
    });
    // The consumer outside the cycle is still resolved.
    expect(analysis.devices.find((d) => d.deviceId === 'pc')!.input.max).toEqual({
      knownW: 200,
      complete: true,
    });
  });
  it('does not count a cable joining two banked outlets as a feed', () => {
    const p = fixture();
    connect(p, 'BAD', device('pdu', 'o1'), device('pdu', 'o5'));
    const analysis = analysePower(p);
    expect(analysis.issues.map((i) => i.code)).toEqual(['outlet-to-outlet']);
    expect(bank(p, 'top').consumers).toEqual([]);
    expect(analysis.distributors[0].banks[0].status).toBe('ok');
  });
});

describe('project totals and the existing example', () => {
  it('reports known mass and power sums with the devices missing values', () => {
    const p = fixture();
    p.definitions.find((d) => d.id === 'def-fixture-pdu')!.massKg = 2.5;
    addConsumer(p, 'pc', 60, 250);
    addConsumer(p, 'nas', null, 90);
    p.definitions.find((d) => d.id === 'def-c-pc')!.massKg = 9.75;
    p.devices.push({
      id: 'blank',
      definitionId: 'def-blank-1',
      name: 'Blank',
      startU: 18,
      face: 'front',
      supportId: null,
      installation: 'installed',
    });
    const { totals, devices } = analysePower(p);
    expect(totals.deviceCount).toBe(4);
    expect(totals.mass.knownKg).toBeCloseTo(12.25, 9);
    expect(totals.mass.complete).toBe(false);
    expect(totals.mass.missing).toEqual([
      { deviceId: 'nas', name: 'nas' },
      { deviceId: 'blank', name: 'Blank' },
    ]);
    // The blank plate has no power record or inlet and is not a powered device.
    expect(devices.find((d) => d.deviceId === 'blank')!.powered).toBe(false);
    expect(totals.power.poweredDeviceCount).toBe(3);
    expect(totals.power.nominal).toEqual({ knownW: 60, complete: false });
    expect(totals.power.max).toEqual({ knownW: 340, complete: true });
    expect(totals.power.missing).toEqual([
      { deviceId: 'nas', name: 'nas', missingNominal: true, missingMax: false },
    ]);
  });
  it('leaves the example project without power issues and its cable analysis unchanged', () => {
    const p = createExampleProject();
    const power = analysePower(p);
    expect(power.distributors).toEqual([]);
    expect(power.issues).toEqual([]);
    expect(power.totals.deviceCount).toBe(p.devices.length);
    expect(power.totals.mass.knownKg).toBe(0);
    expect(power.totals.mass.missing).toHaveLength(p.devices.length);
    // Only the server has a power inlet; its draw is unknown, not zero.
    expect(power.totals.power.poweredDeviceCount).toBe(1);
    expect(power.totals.power.max).toEqual({ knownW: 0, complete: false });
    const analysis = analyseProject(p);
    expect(Object.keys(analysis)).toEqual([
      'cables',
      'procurement',
      'issues',
      'knownRouteMm',
      'power',
    ]);
    expect(analysis.power).toBe(power);
    expect(JSON.parse(JSON.stringify(power))).toEqual(power);
  });
  it('is deterministic and serialisable', () => {
    const a = analysePower(topRowAt(800));
    const b = analysePower(topRowAt(800));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('equipment model power and mass edits', () => {
  it('updates shared definition values and marks edited values user-entered', () => {
    const p = fixture();
    addConsumer(p, 'pc', 100, 200);
    p.definitions.find((d) => d.id === 'def-c-pc')!.power!.evidence = 'verified';
    setDefinitionPower(p, 'def-c-pc', { maxW: 350 });
    expect(p.definitions.find((d) => d.id === 'def-c-pc')!.power).toMatchObject({
      nominalW: 100,
      maxW: 350,
      evidence: 'user-entered',
    });
    setDefinitionPower(p, 'def-c-pc', { evidence: 'verified', source: 'Datasheet rev B' });
    expect(p.definitions.find((d) => d.id === 'def-c-pc')!.power!.evidence).toBe('verified');
    setDefinitionMass(p, 'def-c-pc', 7.2);
    expect(p.definitions.find((d) => d.id === 'def-c-pc')!.massKg).toBe(7.2);
    const blank = p.definitions.find((d) => d.id === 'def-blank-1')!;
    expect(blank.power).toBeUndefined();
    setDefinitionPower(p, 'def-blank-1', { nominalW: 0 });
    expect(blank.power).toEqual({
      nominalW: 0,
      maxW: null,
      evidence: 'user-entered',
      source: '',
    });
    setPowerBank(p, 'def-fixture-pdu', 'top', { maxCurrentA: 13, outletMaxCurrentA: null });
    expect(p.definitions.find((d) => d.id === 'def-fixture-pdu')!.powerBanks![0]).toMatchObject({
      maxCurrentA: 13,
      outletMaxCurrentA: null,
      evidence: 'user-entered',
    });
    expect(() => setPowerBank(p, 'def-fixture-pdu', 'missing', { maxCurrentA: 1 })).toThrow();
  });
  it('explains invalid definition power data before saving', () => {
    const d = pduDefinition();
    expect(powerDefinitionIssues(d)).toEqual([]);
    d.power = { nominalW: 20, maxW: 10, evidence: 'user-entered', source: '' };
    d.powerBanks![1].portIds = ['o4', 'missing'];
    d.powerBanks![0].maxCurrentA = 0;
    expect(powerDefinitionIssues(d)).toEqual([
      'Nominal power draw cannot exceed maximum power draw.',
      'Power bank Top row needs a positive current limit.',
      'Port o4 belongs to more than one power bank.',
      'Power bank Bottom row refers to a missing port.',
    ]);
  });
});

describe('independent verification cases', () => {
  /** One consumer drawing `maxW` on outlet o1 of the top row. */
  function oneOutlet(maxW: number | null, nominalW: number | null = 0) {
    const p = fixture();
    addConsumer(p, 'load', nominalW, maxW);
    connect(p, 'P1', device('pdu', 'o1'), device('load', 'psu1'));
    return p;
  }

  it.each([
    // W = utilisation × 10 A × 230 V on one outlet; the 16 A bank stays below 80 %.
    [0.79, 1817, 'ok', []],
    [0.8, 1840, 'warning', ['outlet-warning']],
    [1, 2300, 'warning', ['outlet-warning']],
    [1.01, 2323, 'over', ['outlet-over']],
  ] as const)(
    'pins the per-outlet threshold at %s utilisation as %s',
    (utilisation, maxW, status, codes) => {
      const p = oneOutlet(maxW);
      const top = bank(p, 'top');
      expect(top.outlets[0].max.knownA).toBeCloseTo(utilisation * 10, 9);
      expect(top.outlets[0].utilisation).toBeCloseTo(utilisation, 9);
      expect(top.outlets[0].status).toBe(status);
      expect(top.utilisation).toBeCloseTo((utilisation * 10) / 16, 9);
      expect(top.status).toBe('ok');
      expect(analysePower(p).issues.map((i) => i.code)).toEqual(codes);
    },
  );

  it('reproduces the browser scenario: 3000 W at 230 V is 13.04 A, 81.5 % of 16 A', () => {
    const p = oneOutlet(3000, 1200);
    let top = bank(p, 'top');
    expect(top.max.knownA).toBeCloseTo(13.0434782609, 9);
    expect(top.max.knownA.toFixed(2)).toBe('13.04');
    expect((top.utilisation * 100).toFixed(1)).toBe('81.5');
    expect(top.status).toBe('warning');
    expect(top.nominal.knownA.toFixed(2)).toBe('5.22');
    expect(top.outlets[0].status).toBe('over');
    expect((top.outlets[0].utilisation! * 100).toFixed(1)).toBe('130.4');
    setPowerBank(p, 'def-fixture-pdu', 'top', { maxCurrentA: 20 });
    top = bank(structuredClone(p), 'top');
    expect((top.utilisation * 100).toFixed(1)).toBe('65.2');
    expect(top.status).toBe('ok');
    setPowerBank(p, 'def-fixture-pdu', 'top', { maxCurrentA: 12 });
    top = bank(structuredClone(p), 'top');
    expect((top.utilisation * 100).toFixed(1)).toBe('108.7');
    expect(top.status).toBe('over');
  });

  it('leaves an outlet without a rating unchecked but still incomplete when its load is unknown', () => {
    const p = oneOutlet(5000);
    p.definitions.find((d) => d.id === 'def-fixture-pdu')!.powerBanks![0].outletMaxCurrentA = null;
    const top = bank(p, 'top');
    expect(top.outlets[0]).toMatchObject({ limitA: null, utilisation: null, status: 'ok' });
    expect(top.status).toBe('over');
    expect(analysePower(p).issues.map((i) => i.code)).toEqual(['bank-over']);
    const unknown = oneOutlet(null);
    unknown.definitions.find((d) => d.id === 'def-fixture-pdu')!.powerBanks![0].outletMaxCurrentA =
      null;
    expect(bank(unknown, 'top').outlets[0]).toMatchObject({
      utilisation: null,
      status: 'incomplete',
    });
  });

  it('marks a bank incomplete when only the nominal draw is unknown', () => {
    const p = oneOutlet(600, null);
    const top = bank(p, 'top');
    expect(top.max).toMatchObject({ knownW: 600, complete: true });
    expect(top.nominal).toMatchObject({ knownW: 0, complete: false });
    expect(top.status).toBe('incomplete');
    expect(top.unknownConsumers).toEqual([
      {
        deviceId: 'load',
        name: 'load',
        reason: 'No nominal draw recorded for its equipment model.',
      },
    ]);
    // The outlet check uses maximum draw only, so it is complete and OK.
    expect(top.outlets[0].status).toBe('ok');
    expect(analysePower(p).issues.map((i) => i.code)).toEqual(['bank-incomplete']);
  });

  it('uses the bank voltage for the current estimate', () => {
    const p = oneOutlet(1200);
    p.definitions.find((d) => d.id === 'def-fixture-pdu')!.powerBanks![0].voltageV = 120;
    const top = bank(p, 'top');
    expect(top.max.knownA).toBeCloseTo(10, 9);
    expect(top.outlets[0].status).toBe('warning');
    expect(top.utilisation).toBeCloseTo(10 / 16, 9);
  });

  it('reports a distributor feeding its own inlet as a cycle', () => {
    const p = fixture();
    connect(p, 'SELF', device('pdu', 'o1'), device('pdu', 'inlet'));
    const analysis = analysePower(p);
    expect(analysis.issues.map((i) => i.code)).toEqual(['distribution-cycle', 'bank-incomplete']);
    expect(analysis.devices.find((d) => d.deviceId === 'pdu')!.inCycle).toBe(true);
    const top = bank(p, 'top');
    expect(top.status).toBe('incomplete');
    expect(top.unknownConsumers).toEqual([
      { deviceId: 'pdu', name: 'PDU', reason: 'Part of a power distribution cycle.' },
    ]);
  });

  it('never counts a chained distributor with no recorded own draw as zero', () => {
    const p = fixture();
    // The fixture PDU's own draw becomes unknown; its downstream consumer is fully known.
    delete p.definitions.find((d) => d.id === 'def-fixture-pdu')!.power;
    p.definitions.push({
      ...pduDefinition('def-ups'),
      power: { nominalW: 0, maxW: 0, evidence: 'example', source: '' },
    });
    p.devices.push({
      id: 'ups',
      definitionId: 'def-ups',
      name: 'UPS',
      startU: 15,
      face: 'front',
      supportId: null,
      installation: 'installed',
    });
    addConsumer(p, 'pc', 100, 200);
    connect(p, 'U1', device('ups', 'o1'), device('pdu', 'inlet'));
    connect(p, 'P1', device('pdu', 'o1'), device('pc', 'psu1'));
    expect(bank(p, 'top').status).toBe('ok');
    const upstream = bank(p, 'top', 'ups');
    expect(upstream.max).toMatchObject({ knownW: 200, complete: false });
    expect(upstream.status).toBe('incomplete');
    expect(upstream.unknownConsumers[0]).toMatchObject({
      deviceId: 'pdu',
      reason: 'No nominal or maximum draw recorded for its equipment model.',
    });
  });

  it('ignores cables whose consumer or distributor no longer exists', () => {
    const p = fixture();
    connect(p, 'GONE', device('pdu', 'o1'), device('removed-device', 'psu1'));
    addConsumer(p, 'pc', 100, 200);
    connect(p, 'ORPHAN', device('removed-pdu', 'o1'), device('pc', 'psu1'));
    const analysis = analysePower(p);
    expect(analysis.issues).toEqual([]);
    expect(bank(p, 'top').consumers).toEqual([]);
    expect(analysis.devices.find((d) => d.deviceId === 'pc')!.feeds).toEqual([]);
  });
});
