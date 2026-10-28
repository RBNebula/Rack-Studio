import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../testing/legacy-example';
import { endpointPort } from '../engineering/connectivity';
import { analysePower } from '../engineering/power';
import { baseCable } from '../testing/legacy-example';
import type { Project } from '../model';
import { parseProject, serializeProject, validateReferences } from './project';

function example(): Project {
  const project = createExampleProject();
  project.looms = [
    {
      id: 'loom-1',
      name: 'Network loom',
      cableIds: project.cables.map((cable) => cable.id),
      waypoints: [],
      packingFactor: 1.3,
    },
  ];
  project.stock = [{ id: 'stock-1', productId: project.products[0].id, remainingMm: 86000 }];
  return project;
}

describe('versioned project persistence and authoritative relationships', () => {
  it('preserves cable endpoints, exits, destinations, shelf relationships and unknown distances after reload', () => {
    const original = example();
    const restored = parseProject(serializeProject(original));
    expect(restored).toEqual(original);
    expect(restored).not.toBe(original);
    expect(restored.cables).toHaveLength(2);
    const internal = restored.cables.find((cable) => cable.id === 'NET-001')!;
    expect(internal.source).toEqual({ kind: 'device', deviceId: 'pc-1', portId: 'net' });
    expect(internal.destination).toEqual({
      kind: 'device',
      deviceId: 'switch-1',
      portId: 'uplink',
    });
    expect(endpointPort(restored, internal.source)?.name).toBe('Ethernet');
    expect(endpointPort(restored, internal.destination)?.name).toBe('Rear uplink');
    const external = restored.cables.find((cable) => cable.id === 'NET-002')!;
    expect(external.exitId).toBe('exit-1');
    expect(external.destination).toEqual({
      kind: 'external',
      destinationId: 'desk-1',
      portId: 'network',
    });
    expect(external.externalLengthMm).toBeNull();
    expect(restored.devices.find((device) => device.id === 'pc-1')?.supportId).toBe('shelf-1');
    expect(restored.looms[0].cableIds).toEqual(['NET-001', 'NET-002']);
    expect(restored.stock[0].remainingMm).toBe(86000);
  });

  it('validates relationships without changing project records', () => {
    const project = example();
    const before = JSON.stringify(project);
    expect(validateReferences(project)).toEqual([]);
    expect(JSON.stringify(project)).toBe(before);
  });

  it.each([
    'definitions',
    'devices',
    'cables',
    'exits',
    'destinations',
    'accessories',
    'looms',
    'products',
    'stock',
  ] as const)(
    'rejects duplicated IDs in %s rather than silently retaining ambiguous records',
    (collection) => {
      const project = example();
      const items = project[collection] as Array<{ id: string }>;
      items.push(structuredClone(items[0]));
      expect(() => parseProject(JSON.stringify(project))).toThrow(/Duplicate .* ID/);
    },
  );

  it('rejects duplicate device-definition port IDs and external port IDs', () => {
    const devicePorts = example();
    devicePorts.definitions[0].ports.push(structuredClone(devicePorts.definitions[0].ports[0]));
    expect(() => parseProject(JSON.stringify(devicePorts))).toThrow(/Duplicate .* port ID/);
    const externalPorts = example();
    externalPorts.destinations[0].ports.push(
      structuredClone(externalPorts.destinations[0].ports[0]),
    );
    expect(() => parseProject(JSON.stringify(externalPorts))).toThrow(/Duplicate .* port ID/);
  });

  it('rejects missing device definitions, devices, ports and external destination records', () => {
    const mutations: Array<(project: Project) => void> = [
      (project) => {
        project.devices[0].definitionId = 'deleted-definition';
      },
      (project) => {
        project.cables[0].source = { kind: 'device', deviceId: 'deleted-device', portId: 'net' };
      },
      (project) => {
        project.cables[0].source = { kind: 'device', deviceId: 'pc-1', portId: 'deleted-port' };
      },
      (project) => {
        project.cables[1].destination = {
          kind: 'external',
          destinationId: 'deleted-destination',
          portId: 'network',
        };
      },
    ];
    for (const mutate of mutations) {
      const project = example();
      mutate(project);
      expect(() => parseProject(JSON.stringify(project))).toThrow(
        /missing device definition|missing endpoint or port/,
      );
    }
  });

  it('rejects missing, self-referential and circular shelf support relationships', () => {
    const missing = example();
    missing.devices.find((device) => device.id === 'pc-1')!.supportId = 'deleted-shelf';
    expect(() => parseProject(JSON.stringify(missing))).toThrow(/missing or invalid support/);
    const self = example();
    self.devices.find((device) => device.id === 'pc-1')!.supportId = 'pc-1';
    expect(() => parseProject(JSON.stringify(self))).toThrow(/invalid support|circular support/);
    const circular = example();
    circular.devices.find((device) => device.id === 'shelf-1')!.supportId = 'pc-1';
    expect(() => parseProject(JSON.stringify(circular))).toThrow(/circular support/);
  });

  it('requires a present rack exit for an external cable', () => {
    const missing = example();
    missing.cables[1].exitId = 'deleted-exit';
    expect(() => parseProject(JSON.stringify(missing))).toThrow(/missing exit point/);
    const unspecified = example();
    unspecified.cables[1].exitId = null;
    expect(() => parseProject(JSON.stringify(unspecified))).toThrow(
      /external connection requires a rack exit/,
    );
  });

  it('rejects self connections and duplicate use of a single-connection port', () => {
    const self = example();
    self.cables[0].destination = structuredClone(self.cables[0].source);
    expect(() => parseProject(JSON.stringify(self))).toThrow(/cannot connect a port to itself/);
    const reused = example();
    reused.cables.push({ ...structuredClone(reused.cables[0]), id: 'NET-DUPLICATE' });
    expect(() => parseProject(JSON.stringify(reused))).toThrow(/port is already connected/);
  });

  it('applies the same connector compatibility and rack-side endpoint rules on import as in the connection editor', () => {
    const incompatible = example();
    incompatible.cables[0].source = { kind: 'device', deviceId: 'pc-1', portId: 'usb' };
    expect(() => parseProject(JSON.stringify(incompatible))).toThrow(/incompatible/);
    const outside = example();
    outside.cables[0].source = { kind: 'external', destinationId: 'screen-1', portId: 'network' };
    outside.cables[0].destination = {
      kind: 'external',
      destinationId: 'desk-1',
      portId: 'network',
    };
    // Remove the second cable so occupied-port rejection cannot mask this rule.
    outside.cables = [outside.cables[0]];
    outside.cables[0].exitId = 'exit-1';
    outside.looms = [];
    expect(() => parseProject(JSON.stringify(outside))).toThrow(/inside this rack|rack-side/);
  });

  it('rejects dangling or repeated loom members and missing product references', () => {
    const dangling = example();
    dangling.looms[0].cableIds[1] = 'deleted-cable';
    expect(() => parseProject(JSON.stringify(dangling))).toThrow(/missing cable deleted-cable/);
    const repeated = example();
    repeated.looms[0].cableIds = ['NET-001', 'NET-001'];
    expect(() => parseProject(JSON.stringify(repeated))).toThrow(/duplicate loom member/);
    const product = example();
    product.cables[1].productId = 'deleted-product';
    expect(() => parseProject(JSON.stringify(product))).toThrow(/missing bulk cable product/);
    const stock = example();
    stock.stock[0].productId = 'deleted-product';
    expect(() => parseProject(JSON.stringify(stock))).toThrow(/missing stock product/);
  });

  it('requires reasons for manual cable length overrides', () => {
    const project = example();
    project.cables[1].manualOverrideMm = 3000;
    expect(() => parseProject(JSON.stringify(project))).toThrow(/manual override needs a reason/);
  });

  it('rejects malformed JSON, unsupported schemas and invalid engineering quantities', () => {
    expect(() => parseProject('{broken')).toThrow();
    const unsupported = { ...example(), schemaVersion: 999 };
    expect(() => parseProject(JSON.stringify(unsupported))).toThrow(/Invalid project/);
    const zeroHeight = example();
    zeroHeight.rack.heightU = 0;
    expect(() => parseProject(JSON.stringify(zeroHeight))).toThrow(/Invalid project/);
    const outside = example();
    outside.devices[0].startU = 99;
    expect(() => parseProject(JSON.stringify(outside))).toThrow(/exceeds rack height/);
  });

  it('rejects remote and executable image references rather than fetching imported content', () => {
    for (const image of [
      'https://example.com/remote.png',
      'javascript:alert(1)',
      'data:image/svg+xml,<svg/>',
    ]) {
      const project = example();
      project.definitions[0].frontImage = image;
      expect(() => parseProject(JSON.stringify(project))).toThrow(/embedded PNG, JPEG or WebP/);
    }
  });

  it('round-trips equipment power draw, power banks and mass, and keeps legacy definitions without them', () => {
    const project = example();
    const pdu = project.definitions.find((d) => d.id === 'def-pdu')!;
    pdu.powerBanks = [
      {
        id: 'top',
        name: 'Top row',
        portIds: ['iec1', 'iec2', 'iec3'],
        maxCurrentA: 16,
        outletMaxCurrentA: 10,
        voltageV: 230,
        evidence: 'user-entered',
        source: 'Rating label',
      },
      {
        id: 'bottom',
        name: 'Bottom row',
        portIds: ['iec4', 'iec5', 'iec6'],
        maxCurrentA: 16,
        outletMaxCurrentA: null,
        voltageV: 230,
        evidence: 'unknown',
        source: '',
      },
    ];
    const server = project.definitions.find((d) => d.id === 'def-server')!;
    server.power = { nominalW: 180, maxW: 450, evidence: 'verified', source: 'Datasheet' };
    server.massKg = 18.4;
    project.cables.push({
      ...baseCable('PWR-001'),
      label: 'PWR-001',
      type: 'Power',
      source: { kind: 'device', deviceId: 'pdu-1', portId: 'iec1' },
      destination: { kind: 'device', deviceId: 'server-1', portId: 'power' },
    });
    const restored = parseProject(serializeProject(project));
    expect(restored).toEqual(project);
    const restoredPdu = restored.definitions.find((d) => d.id === 'def-pdu')!;
    expect(restoredPdu.powerBanks!.map((b) => [b.id, b.maxCurrentA, b.outletMaxCurrentA])).toEqual([
      ['top', 16, 10],
      ['bottom', 16, null],
    ]);
    expect(restored.definitions.find((d) => d.id === 'def-server')).toMatchObject({
      massKg: 18.4,
      power: { nominalW: 180, maxW: 450, evidence: 'verified', source: 'Datasheet' },
    });
    expect(restored.definitions.find((d) => d.id === 'def-switch')).not.toHaveProperty('power');
    const top = analysePower(restored).distributors[0].banks[0];
    expect(top.consumers.map((c) => c.deviceId)).toEqual(['server-1']);
    expect(top.max.knownA).toBeCloseTo(450 / 230, 9);
    // A missing bank port or nominal above maximum is rejected on import.
    const missingPort = structuredClone(project);
    missingPort.definitions.find((d) => d.id === 'def-pdu')!.powerBanks![0].portIds.push('nope');
    expect(() => parseProject(JSON.stringify(missingPort))).toThrow(/missing port nope/);
    const inverted = structuredClone(project);
    inverted.definitions.find((d) => d.id === 'def-server')!.power!.nominalW = 900;
    expect(() => parseProject(JSON.stringify(inverted))).toThrow(/Invalid project/);
  });

  it('round-trips a distributor total output limit and rejects an invalid one on import', () => {
    const project = example();
    const pdu = project.definitions.find((d) => d.id === 'def-pdu')!;
    pdu.powerBanks = [
      {
        id: 'top',
        name: 'Group 1',
        portIds: ['iec1', 'iec2'],
        maxCurrentA: 10,
        outletMaxCurrentA: null,
        voltageV: 230,
        evidence: 'verified',
        source: 'Datasheet',
      },
    ];
    pdu.powerOutputLimit = {
      maxVA: 3000,
      maxW: 2700,
      maxCurrentA: null,
      voltageV: 230,
      evidence: 'verified',
      source: 'Datasheet',
    };
    const restored = parseProject(serializeProject(project));
    expect(restored).toEqual(project);
    expect(restored.definitions.find((d) => d.id === 'def-pdu')!.powerOutputLimit).toEqual(
      pdu.powerOutputLimit,
    );
    expect(analysePower(restored).distributors[0].outputLimit).toMatchObject({
      maxVA: 3000,
      maxW: 2700,
      maxCurrentA: null,
      status: 'ok',
    });
    // Definitions without the field load unchanged.
    expect(restored.definitions.find((d) => d.id === 'def-switch')).not.toHaveProperty(
      'powerOutputLimit',
    );
    const unrated = structuredClone(project);
    unrated.definitions.find((d) => d.id === 'def-pdu')!.powerOutputLimit!.maxVA = null;
    unrated.definitions.find((d) => d.id === 'def-pdu')!.powerOutputLimit!.maxW = null;
    expect(() => parseProject(JSON.stringify(unrated))).toThrow(/at least one of maxVA/);
    const unbanked = structuredClone(project);
    delete unbanked.definitions.find((d) => d.id === 'def-pdu')!.powerBanks;
    expect(() => parseProject(JSON.stringify(unbanked))).toThrow(/requires power banks/);
  });
  it('opens retired unconfirmed and threaded hole types as square and round', () => {
    const project = example();
    const stored = JSON.parse(serializeProject(project)) as { rack: { holeType: string } };
    stored.rack.holeType = 'unconfirmed';
    expect(parseProject(JSON.stringify(stored)).rack.holeType).toBe('square');
    stored.rack.holeType = 'threaded';
    expect(parseProject(JSON.stringify(stored)).rack.holeType).toBe('round');
    stored.rack.holeType = 'oval';
    expect(() => parseProject(JSON.stringify(stored))).toThrow();
  });
});
