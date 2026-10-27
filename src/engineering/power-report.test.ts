import { describe, expect, it } from 'vitest';
import type { DeviceDefinition, Endpoint, Port, Project } from '../model';
import { baseCable, createExampleProject } from '../testing/legacy-example';
import { analysePower } from './power';
import {
  BANK_COLUMNS,
  EQUIPMENT_COLUMNS,
  NOT_APPLICABLE,
  NOT_CONNECTED,
  buildPowerReport,
  powerReportCsv,
  reportCellText,
} from './power-report';

const iec = (id: string, connector: 'IEC-C13' | 'IEC-C14', x: number): Port => ({
  id,
  name: id === 'inlet' ? 'Inlet' : `Outlet ${id.slice(1)}`,
  connector,
  surface: 'rear',
  position: [x, 20, 302],
  direction: [0, 0, 1],
  multiple: false,
});
const definition = (
  id: string,
  name: string,
  extra: Partial<DeviceDefinition>,
): DeviceDefinition => ({
  id,
  name,
  manufacturer: 'Test',
  model: 'Fixture',
  category: 'Computers',
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
const bankRecord = (id: string, name: string, portIds: string[]) => ({
  id,
  name,
  portIds,
  maxCurrentA: 16,
  outletMaxCurrentA: 10,
  voltageV: 230,
  evidence: 'example' as const,
  source: 'Fixture',
});
const consumer = (
  id: string,
  name: string,
  nominalW: number | null,
  maxW: number | null,
  massKg: number | null,
  heightU = 1,
) =>
  definition(id, name, {
    heightU,
    massKg,
    evidence: 'user-entered',
    ports: [iec('psu1', 'IEC-C14', -100), iec('psu2', 'IEC-C14', 100)],
    power: { nominalW, maxW, evidence: 'user-entered', source: 'Fixture' },
  });
const at = (deviceId: string, portId: string): Endpoint => ({ kind: 'device', deviceId, portId });
function connect(p: Project, id: string, a: Endpoint, b: Endpoint) {
  p.cables.push({ ...baseCable(id), label: id, source: a, destination: b, type: 'Power' });
}
function place(p: Project, id: string, definitionId: string, name: string, startU: number) {
  p.devices.push({
    id,
    definitionId,
    name,
    startU,
    face: 'front',
    supportId: null,
    installation: 'installed',
  });
}

/**
 * One PDU with two banks; a dual-fed server, a PC with unknown mass, a switch with unknown draw
 * and an unpowered blanking plate.
 */
function fixture(): Project {
  const p = createExampleProject(false);
  p.definitions.push(
    definition('def-fx-pdu', 'Fixture PDU', {
      category: 'Power equipment',
      massKg: 2.5,
      ports: [
        ...Array.from({ length: 8 }, (_, i) => iec(`o${i + 1}`, 'IEC-C13', -180 + i * 40)),
        iec('inlet', 'IEC-C14', 190),
      ],
      power: { nominalW: 0, maxW: 0, evidence: 'example', source: 'Passive' },
      powerBanks: [
        bankRecord('top', 'Bank A', ['o1', 'o2', 'o3', 'o4']),
        bankRecord('bottom', 'Bank B', ['o5', 'o6', 'o7', 'o8']),
      ],
    }),
    consumer('def-fx-server', 'Fixture server', 150, 450, 12.4, 2),
    consumer('def-fx-pc', 'User rack PC', 80, 300, null),
    consumer('def-fx-switch', 'Fixture switch', null, null, 3.1),
  );
  p.definitions.find((d) => d.id === 'def-blank-1')!.massKg = 0.3;
  place(p, 'pdu', 'def-fx-pdu', 'PDU', 1);
  place(p, 'server', 'def-fx-server', 'Server', 2);
  place(p, 'pc', 'def-fx-pc', 'PC', 4);
  place(p, 'switch', 'def-fx-switch', 'Switch', 5);
  place(p, 'blank', 'def-blank-1', 'Blank', 6);
  connect(p, 'P1', at('pdu', 'o1'), at('server', 'psu1'));
  connect(p, 'P2', at('pdu', 'o5'), at('server', 'psu2'));
  connect(p, 'P3', at('pdu', 'o2'), at('pc', 'psu1'));
  connect(p, 'P4', at('pdu', 'o6'), at('switch', 'psu1'));
  return p;
}
const column = (name: (typeof EQUIPMENT_COLUMNS)[number]) => EQUIPMENT_COLUMNS.indexOf(name);
const bankColumn = (name: (typeof BANK_COLUMNS)[number]) => BANK_COLUMNS.indexOf(name);
const row = (p: Project, deviceId: string) =>
  buildPowerReport(p).equipment.rows.find((r) => r.deviceId === deviceId)!.cells;
const total = (p: Project, label: string) =>
  buildPowerReport(p).totals.find((t) => t.label === label)!;

describe('power and weights equipment table', () => {
  it('lists one row per placed device, top of the rack first, with the expected cells', () => {
    const report = buildPowerReport(fixture());
    expect(report.equipment.columns).toEqual([...EQUIPMENT_COLUMNS]);
    expect(report.equipment.rows.map((r) => r.deviceId)).toEqual([
      'blank',
      'switch',
      'pc',
      'server',
      'pdu',
    ]);
    expect(report.equipment.rows.find((r) => r.deviceId === 'server')!.cells).toEqual([
      'Server',
      'Fixture server',
      'Communications rack A · U2–3 · Front',
      12.4,
      'user-entered',
      150,
      450,
      1.96,
      'user-entered',
      'PDU · Bank A · Outlet 1; PDU · Bank B · Outlet 5 (redundant feed)',
    ]);
  });
  it('shows unknown mass and draw as Unknown, never zero', () => {
    const p = fixture();
    const pc = row(p, 'pc');
    expect(pc[column('Mass (kg)')]).toBeNull();
    expect(pc[column('Mass evidence')]).toBe(NOT_APPLICABLE);
    expect(reportCellText(pc[column('Mass (kg)')])).toBe('Unknown');
    expect(pc[column('Fed from')]).toBe('PDU · Bank A · Outlet 2');
    const sw = row(p, 'switch');
    expect(sw[column('Nominal draw (W)')]).toBeNull();
    expect(sw[column('Max draw (W)')]).toBeNull();
    expect(sw[column('Max inlet current (A)')]).toBeNull();
    expect(sw[column('Mass (kg)')]).toBe(3.1);
  });
  it('marks unpowered devices with a dash and powered but unfed devices as not connected', () => {
    const p = fixture();
    const blank = row(p, 'blank');
    for (const name of [
      'Nominal draw (W)',
      'Max draw (W)',
      'Max inlet current (A)',
      'Power evidence',
      'Fed from',
    ] as const)
      expect(blank[column(name)]).toBe(NOT_APPLICABLE);
    expect(blank[column('Mass (kg)')]).toBe(0.3);
    const pdu = row(p, 'pdu');
    expect(pdu[column('Fed from')]).toBe(NOT_CONNECTED);
    expect(pdu[column('Max inlet current (A)')]).toBe(NOT_APPLICABLE);
    expect(pdu[column('Max draw (W)')]).toBe(0);
    // A powered device without any draw record is labelled, and its draw is unknown. The
    // analysis is cached per project snapshot, so edit a fresh project.
    const q = fixture();
    delete q.definitions.find((d) => d.id === 'def-fx-switch')!.power;
    expect(row(q, 'switch')[column('Power evidence')]).toBe('No power record');
    expect(row(q, 'switch')[column('Max draw (W)')]).toBeNull();
  });
});

describe('power and weights bank summary', () => {
  it('summarises each bank of each distributor with limits, loads, status and unknowns', () => {
    const report = buildPowerReport(fixture());
    expect(report.bankColumns).toEqual([...BANK_COLUMNS]);
    expect(report.distributors).toHaveLength(1);
    const [pdu] = report.distributors;
    expect(pdu).toMatchObject({
      name: 'PDU',
      model: 'Fixture PDU',
      position: 'Communications rack A · U1 · Front',
      fedFrom: NOT_CONNECTED,
      level: 0,
      inputNominal: '≥ 230 W (incomplete)',
      inputMax: '≥ 750 W (incomplete)',
    });
    expect(pdu.banks.map((b) => b.status)).toEqual(['ok', 'incomplete']);
    expect(pdu.banks[0].cells).toEqual([
      'PDU',
      'Bank A',
      230,
      16,
      10,
      1,
      230,
      3.26,
      750,
      20.4,
      'OK',
      'Server (Outlet 1; 450 W; redundant feed); PC (Outlet 2; 300 W)',
      'None',
      'example (Fixture)',
    ]);
    const b = pdu.banks[1].cells;
    expect(b[bankColumn('Nominal (A)')]).toBe('≥ 0.65');
    expect(b[bankColumn('Nominal (W)')]).toBe('≥ 150');
    expect(b[bankColumn('Max (A)')]).toBe('≥ 1.96');
    expect(b[bankColumn('Max (W)')]).toBe('≥ 450');
    expect(b[bankColumn('Utilisation (%)')]).toBe('≥ 12.2');
    expect(b[bankColumn('Status')]).toBe('Incomplete');
    expect(b[bankColumn('Consumers (outlets; max load)')]).toBe(
      'Server (Outlet 5; 450 W; redundant feed); Switch (Outlet 6; Unknown)',
    );
    expect(b[bankColumn('Unknown draw')]).toBe(
      'Switch: No nominal or maximum draw recorded for its equipment model.',
    );
  });
  it('shows warning and over-limit statuses and a missing outlet rating', () => {
    const p = fixture();
    p.definitions.find((d) => d.id === 'def-fx-pc')!.power!.maxW = 3200;
    p.definitions.find((d) => d.id === 'def-fx-pdu')!.powerBanks![1].outletMaxCurrentA = null;
    const [pdu] = buildPowerReport(p).distributors;
    expect(pdu.banks[0].status).toBe('warning');
    expect(pdu.banks[0].cells[bankColumn('Status')]).toBe('Warning');
    expect(pdu.banks[1].cells[bankColumn('Outlet limit (A)')]).toBe('None rated');
    const q = fixture();
    q.definitions.find((d) => d.id === 'def-fx-pc')!.power!.maxW = 3500;
    expect(buildPowerReport(q).distributors[0].banks[0].cells[bankColumn('Status')]).toBe(
      'Over limit',
    );
  });
  it('lists an outlet that feeds an external destination as unknown draw', () => {
    const p = fixture();
    p.cables.push({
      ...baseCable('X1'),
      label: 'X1',
      source: at('pdu', 'o3'),
      destination: { kind: 'external', destinationId: 'desk-1', portId: 'network' },
    });
    const cells = buildPowerReport(p).distributors[0].banks[0].cells;
    expect(cells[bankColumn('Unknown draw')]).toBe(
      'Outlet 3 feeds external User position 1: draw unknown',
    );
    expect(cells[bankColumn('Max (A)')]).toBe('≥ 3.26');
  });
  it('places a UPS before the PDU it feeds and needs no change for the chain', () => {
    const p = fixture();
    p.definitions.push(
      definition('def-fx-ups', 'Fixture UPS', {
        category: 'Power equipment',
        massKg: 24,
        heightU: 2,
        ports: [iec('u1', 'IEC-C13', -100), iec('u2', 'IEC-C13', -60)],
        power: { nominalW: 20, maxW: 40, evidence: 'example', source: 'Fixture' },
        powerBanks: [{ ...bankRecord('out', 'Output', ['u1', 'u2']), maxCurrentA: 10 }],
      }),
    );
    place(p, 'ups', 'def-fx-ups', 'UPS', 8);
    connect(p, 'U1', at('ups', 'u1'), at('pdu', 'inlet'));
    const report = buildPowerReport(p);
    expect(report.distributors.map((d) => [d.name, d.level, d.fedFrom])).toEqual([
      ['UPS', 0, NOT_CONNECTED],
      ['PDU', 1, 'UPS · Output · Outlet 1'],
    ]);
    expect(report.distributors[0].banks[0].cells[bankColumn('Consumers (outlets; max load)')]).toBe(
      'PDU (Outlet 1; ≥ 750 W)',
    );
    expect(report.distributors[0].inputMax).toBe('≥ 790 W (incomplete)');
    expect(row(p, 'pdu')[column('Fed from')]).toBe('UPS · Output · Outlet 1');
    // The PDU's inlet carries everything downstream of it.
    expect(row(p, 'pdu')[column('Max inlet current (A)')]).toBe('≥ 3.26');
    expect(report.totals.map((t) => t.label)).toContain('Input load · UPS');
  });
});

describe('power and weights totals and issues', () => {
  it('reports known totals as lower bounds with the devices that are missing values', () => {
    const p = fixture();
    expect(total(p, 'Placed devices')).toMatchObject({ value: '5' });
    expect(total(p, 'Total mass')).toEqual({
      label: 'Total mass',
      value: '≥ 18.3 kg (incomplete: 1 device unknown)',
      detail:
        'Unknown mass: PC. Equipment only: the rack frame, cables and fixings are not included.',
    });
    expect(total(p, 'Total nominal draw').value).toBe('≥ 230 W (incomplete: 1 device unknown)');
    expect(total(p, 'Total maximum draw').value).toBe('≥ 750 W (incomplete: 1 device unknown)');
    expect(total(p, 'Total maximum draw').detail).toContain('Unknown maximum draw: Switch.');
    expect(total(p, 'Estimated heat output').value).toBe('≥ 785 BTU/h nominal');
    expect(total(p, 'Powered devices not connected')).toMatchObject({ value: '1' });
    expect(total(p, 'Powered devices not connected').detail).toMatch(/^PDU\./);
    expect(total(p, 'Devices with redundant feeds').detail).toMatch(/^Server\./);
    expect(total(p, 'Input load · PDU')).toMatchObject({ value: '≥ 750 W (incomplete) max' });
    expect(total(p, 'Power issues')).toEqual({
      label: 'Power issues',
      value: '1',
      detail: '0 errors · 0 warnings · 1 notice',
    });
    expect(buildPowerReport(p).summary).toEqual({
      devices: '5',
      mass: '≥ 18.3 kg',
      maxDraw: '≥ 750 W',
      issues: '1',
    });
  });
  it('shows complete totals without a lower-bound mark once every value is known', () => {
    const p = fixture();
    p.definitions.find((d) => d.id === 'def-fx-pc')!.massKg = 6.2;
    p.definitions.find((d) => d.id === 'def-fx-switch')!.power = {
      nominalW: 15,
      maxW: 25.5,
      evidence: 'verified',
      source: 'Datasheet',
    };
    expect(total(p, 'Total mass').value).toBe('24.5 kg');
    expect(total(p, 'Total nominal draw').value).toBe('245 W');
    expect(total(p, 'Total maximum draw').value).toBe('775.5 W');
    expect(total(p, 'Total maximum draw').detail).toBe(
      'Own draw of 4 powered devices, each counted once.',
    );
    expect(buildPowerReport(p).issues).toEqual([]);
  });
  it('adds mass per rack when the project has more than one rack', () => {
    const p = fixture();
    p.additionalRacks = [{ ...p.rack, id: 'rack-b', name: 'Rack B' }];
    p.devices.find((d) => d.id === 'switch')!.rackId = 'rack-b';
    expect(total(p, 'Mass · Communications rack A').value).toBe(
      '≥ 15.2 kg (incomplete: 1 device unknown)',
    );
    expect(total(p, 'Mass · Rack B').value).toBe('3.1 kg');
    expect(row(p, 'switch')[column('Position')]).toBe('Rack B · U5 · Front');
    expect(total(fixture(), 'Total mass')).toBeDefined();
    expect(buildPowerReport(fixture()).totals.some((t) => t.label.startsWith('Mass ·'))).toBe(
      false,
    );
  });
  it('lists every power issue with its severity, errors first', () => {
    const p = fixture();
    p.definitions.find((d) => d.id === 'def-fx-pc')!.power!.maxW = 3500;
    const issues = buildPowerReport(p).issues;
    expect(issues.map((i) => i.severity)).toEqual(['Error', 'Error', 'Notice']);
    expect(issues.map((i) => i.message)).toEqual(
      [...analysePower(p).issues]
        .sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1))
        .map((i) => i.message),
    );
  });
  it('flags non-verified evidence and handles a project without distributors', () => {
    expect(buildPowerReport(fixture()).provisionalNote).toMatch(
      /^5 of 5 devices and 2 of 2 banks use example/,
    );
    const empty = createExampleProject(false);
    const report = buildPowerReport(empty);
    expect(report.distributors).toEqual([]);
    expect(report.equipment.rows).toEqual([]);
    expect(report.provisionalNote).toBeNull();
    expect(powerReportCsv(empty)).toContain('"No power distributor is placed."');
  });
});

describe('power and weights CSV', () => {
  it('writes a sectioned CSV with Unknown cells and lower bounds', () => {
    const text = powerReportCsv(fixture());
    expect(text.startsWith('﻿')).toBe(true);
    const lines = text.slice(1).split('\r\n');
    expect(lines[0]).toBe('"Power and weights","Untitled rack project"');
    const section = (title: string) => lines.indexOf(`"${title}"`);
    for (const title of ['Equipment', 'Power banks', 'Totals', 'Issues', 'Notes'])
      expect(section(title)).toBeGreaterThan(0);
    expect(lines[section('Equipment') - 1]).toBe('');
    expect(lines[section('Equipment') + 1]).toBe(EQUIPMENT_COLUMNS.map((c) => `"${c}"`).join(','));
    expect(lines).toContain(
      '"PC","User rack PC","Communications rack A · U4 · Front","Unknown","—",80,300,1.3,"user-entered","PDU · Bank A · Outlet 2"',
    );
    expect(lines).toContain(
      '"Switch","Fixture switch","Communications rack A · U5 · Front",3.1,"user-entered","Unknown","Unknown","Unknown","user-entered","PDU · Bank B · Outlet 6"',
    );
    expect(lines[section('Power banks') + 1]).toBe(BANK_COLUMNS.map((c) => `"${c}"`).join(','));
    expect(lines[section('Power banks') + 3]).toMatch(
      /^"PDU","Bank B",230,16,10,"≥ 0.65","≥ 150","≥ 1.96","≥ 450","≥ 12.2","Incomplete",/,
    );
    expect(lines).toContain(
      '"Total mass","≥ 18.3 kg (incomplete: 1 device unknown)","Unknown mass: PC. Equipment only: the rack frame, cables and fixings are not included."',
    );
    expect(lines[section('Issues') + 2]).toMatch(/^"Notice","PDU · Bank B: load is incomplete/);
  });
  it('neutralises spreadsheet formula prefixes in names', () => {
    const p = fixture();
    p.devices.find((d) => d.id === 'pc')!.name = '=HYPERLINK("http://x","PC")';
    p.definitions.find((d) => d.id === 'def-fx-pdu')!.powerBanks![0].name = '+Bank';
    const text = powerReportCsv(p);
    expect(text).toContain('"\'=HYPERLINK(""http://x"",""PC"")","User rack PC"');
    expect(text).toContain('"PDU","\'+Bank",230');
    expect(text).not.toMatch(/(^|,)"=/m);
    expect(text).not.toMatch(/(^|,)"\+/m);
  });
});

describe('power and weights verification cases', () => {
  it('formats the analysis it is given and never recomputes loads from the project', () => {
    const p = fixture();
    const analysis = structuredClone(analysePower(p));
    const bank = analysis.distributors[0].banks[0];
    bank.max = { knownW: 1234.5, knownA: 5.367, complete: true };
    bank.utilisation = 0.4;
    bank.status = 'warning';
    analysis.totals.mass = { knownKg: 99, complete: true, missing: [] };
    analysis.devices.find((d) => d.deviceId === 'server')!.maxW = 777;
    const report = buildPowerReport(p, analysis);
    const cells = report.distributors[0].banks[0].cells;
    expect(cells[bankColumn('Max (A)')]).toBe(5.37);
    expect(cells[bankColumn('Max (W)')]).toBe(1234.5);
    expect(cells[bankColumn('Utilisation (%)')]).toBe(40);
    expect(cells[bankColumn('Status')]).toBe('Warning');
    expect(report.totals.find((t) => t.label === 'Total mass')!.value).toBe('99 kg');
    expect(
      report.equipment.rows.find((r) => r.deviceId === 'server')!.cells[column('Max draw (W)')],
    ).toBe(777);
    // The CSV is written from the report it is given.
    expect(powerReportCsv(p, report)).toContain('"PDU","Bank A",230,16,10,1,230,5.37,1234.5,40,');
  });
  it('is deterministic and leaves the project unchanged', () => {
    const p = fixture();
    const before = structuredClone(p);
    expect(buildPowerReport(p)).toEqual(buildPowerReport(structuredClone(p)));
    expect(powerReportCsv(p)).toBe(powerReportCsv(structuredClone(p)));
    expect(p).toEqual(before);
  });
  it('shows a load with no known part as Unknown, never as zero or "≥ 0"', () => {
    const p = fixture();
    // Bank B now only feeds the switch, whose draw is unknown.
    p.cables = p.cables.filter((c) => c.id !== 'P2');
    for (const d of p.definitions) d.massKg = null;
    const report = buildPowerReport(p);
    const cells = report.distributors[0].banks[1].cells;
    for (const name of [
      'Nominal (A)',
      'Nominal (W)',
      'Max (A)',
      'Max (W)',
      'Utilisation (%)',
    ] as const) {
      expect(cells[bankColumn(name)]).toBeNull();
      expect(reportCellText(cells[bankColumn(name)])).toBe('Unknown');
    }
    expect(cells[bankColumn('Status')]).toBe('Incomplete');
    expect(report.totals.find((t) => t.label === 'Total mass')!.value).toBe(
      'Unknown (incomplete: 5 devices unknown)',
    );
    expect(report.summary.mass).toBe('Unknown');
    const text = powerReportCsv(p);
    expect(text).not.toContain('≥ 0');
    expect(text).toMatch(
      /"PDU","Bank B",230,16,10,"Unknown","Unknown","Unknown","Unknown","Unknown","Incomplete"/,
    );
  });
  it('keeps a Warning status when the known part of an incomplete bank is already at 80 %', () => {
    const p = fixture();
    // Bank B: server 3000 W (13.04 A of 16 A, 81.5 %) plus the switch, whose draw is unknown.
    p.definitions.find((d) => d.id === 'def-fx-server')!.power!.maxW = 3000;
    const cells = buildPowerReport(p).distributors[0].banks[1].cells;
    expect(cells[bankColumn('Status')]).toBe('Warning');
    expect(cells[bankColumn('Max (A)')]).toBe('≥ 13.04');
    expect(cells[bankColumn('Max (W)')]).toBe('≥ 3,000');
    expect(cells[bankColumn('Utilisation (%)')]).toBe('≥ 81.5');
  });
  it('gives the maximum inlet current at each feeding voltage when banks differ', () => {
    const p = fixture();
    p.definitions.find((d) => d.id === 'def-fx-pdu')!.powerBanks![1].voltageV = 120;
    // 450 W / 230 V = 1.96 A; 450 W / 120 V = 3.75 A.
    expect(row(p, 'server')[column('Max inlet current (A)')]).toBe('1.96 at 230 V; 3.75 at 120 V');
    // An unknown draw stays Unknown at each voltage. The analysis is cached per project
    // snapshot, so edit a fresh project.
    const q = fixture();
    q.definitions.find((d) => d.id === 'def-fx-pdu')!.powerBanks![1].voltageV = 120;
    connect(q, 'P5', at('pdu', 'o3'), at('switch', 'psu2'));
    // Voltages follow feed order, as in the Fed from column (P4 on Bank B before P5 on Bank A).
    expect(row(q, 'switch')[column('Max inlet current (A)')]).toBe(
      'Unknown at 120 V; Unknown at 230 V',
    );
    expect(row(q, 'switch')[column('Fed from')]).toBe(
      'PDU · Bank B · Outlet 6; PDU · Bank A · Outlet 3 (redundant feed)',
    );
  });
  it('marks distributors in a distribution cycle and lists the cycle error first', () => {
    const p = fixture();
    place(p, 'pdu2', 'def-fx-pdu', 'PDU 2', 7);
    connect(p, 'C1', at('pdu', 'o4'), at('pdu2', 'inlet'));
    connect(p, 'C2', at('pdu2', 'o1'), at('pdu', 'inlet'));
    const report = buildPowerReport(p);
    expect(row(p, 'pdu')[column('Fed from')]).toBe(
      'PDU 2 · Bank A · Outlet 1 (in a distribution cycle)',
    );
    expect(row(p, 'pdu2')[column('Fed from')]).toBe(
      'PDU · Bank A · Outlet 4 (in a distribution cycle)',
    );
    expect(report.distributors.map((d) => d.name).sort()).toEqual(['PDU', 'PDU 2']);
    expect(report.issues[0].severity).toBe('Error');
    expect(report.issues[0].message).toMatch(/^Power distribution cycle: /);
    expect(report.issues.map((i) => i.severity)).toEqual(
      [...report.issues.map((i) => i.severity)].sort(
        (a, b) =>
          ['Error', 'Warning', 'Notice'].indexOf(a) - ['Error', 'Warning', 'Notice'].indexOf(b),
      ),
    );
  });
  it('orders rows by rack, then top U, then name, and lists both faces', () => {
    const p = fixture();
    place(p, 'rear-a', 'def-blank-1', 'A rear plate', 6);
    p.devices.find((d) => d.id === 'rear-a')!.face = 'rear';
    p.additionalRacks = [{ ...p.rack, id: 'rack-b', name: 'Rack B' }];
    place(p, 'low-b', 'def-blank-1', 'Rack B plate', 1);
    p.devices.find((d) => d.id === 'low-b')!.rackId = 'rack-b';
    const report = buildPowerReport(p);
    expect(report.equipment.rows.map((r) => r.deviceId)).toEqual([
      'rear-a',
      'blank',
      'switch',
      'pc',
      'server',
      'pdu',
      'low-b',
    ]);
    expect(row(p, 'rear-a')[column('Position')]).toBe('Communications rack A · U6 · Rear');
  });
  it('writes complete figures as plain numbers and lists "None" when there are no issues', () => {
    const p = fixture();
    p.definitions.find((d) => d.id === 'def-fx-switch')!.power = {
      nominalW: 1200,
      maxW: 1415,
      evidence: 'verified',
      source: 'Datasheet',
    };
    const lines = powerReportCsv(p).slice(1).split('\r\n');
    expect(lines).toContain(
      '"Switch","Fixture switch","Communications rack A · U5 · Front",3.1,"user-entered",1200,1415,6.15,"verified","PDU · Bank B · Outlet 6"',
    );
    const issues = lines.indexOf('"Issues"');
    expect(lines.slice(issues, issues + 3)).toEqual([
      '"Issues"',
      '"Severity","Message"',
      '"None","No power issues."',
    ]);
    // The header block precedes the first blank line.
    expect(lines.slice(0, 5)).toEqual([
      '"Power and weights","Untitled rack project"',
      '"Project revision",0',
      '"Racks","Communications rack A"',
      expect.stringMatching(/^"Evidence","\d+ of 5 devices and 2 of 2 banks use example/),
      '',
    ]);
  });
  it('guards every formula prefix wherever a name starts a cell, and quotes separators', () => {
    const p = fixture();
    p.devices.find((d) => d.id === 'pdu')!.name = '-PDU';
    p.devices.find((d) => d.id === 'server')!.name = '@Server';
    p.devices.find((d) => d.id === 'switch')!.name = '\tSwitch';
    p.devices.find((d) => d.id === 'pc')!.name = 'PC, "desk"\nrow 2';
    const text = powerReportCsv(p);
    // The fed-from, consumer and distributor cells all begin with a renamed device.
    expect(text).toContain('"\'-PDU · Bank A · Outlet 2"');
    expect(text).toContain('"\'-PDU","Bank A",230');
    expect(text).toContain('"\'@Server (Outlet 1; 450 W; redundant feed); PC, ""desk""\nrow 2');
    expect(text).toContain('"\'\tSwitch","Fixture switch"');
    expect(text).toContain('"PC, ""desk""\nrow 2","User rack PC"');
    for (const prefix of ['=', '+', '-', '@', '\t'])
      expect(text).not.toMatch(new RegExp(`(^|,)"\\${prefix === '\t' ? 't' : prefix}`, 'm'));
  });
});
