import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../examples';
import { endpointPort } from '../engineering/connectivity';
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
});
