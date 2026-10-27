import { describe, expect, it } from 'vitest';
import { baseCable, createExampleProject } from '../testing/legacy-example';
import type { Cable, Endpoint, Project } from '../model';
import { parseProject, serializeProject, validateReferences } from '../data/project';
import {
  connectionIssues,
  connectorsCompatible,
  endpointLabel,
  endpointPort,
  newSameGenderConnections,
  sameGenderCouplers,
} from './connectivity';
import { analysePower } from './power';

describe('stable port-to-port connectivity', () => {
  it('resolves device and logical external ports by their authoritative IDs', () => {
    const project = createExampleProject();
    expect(endpointPort(project, project.cables[0].source)?.id).toBe('net');
    expect(endpointLabel(project, project.cables[0].source)).toBe('PC 1 · Ethernet');
    expect(endpointLabel(project, project.cables[1].destination)).toBe(
      'User position 1 · Network port 1',
    );
    expect(
      endpointPort(project, { kind: 'device', deviceId: 'missing', portId: 'net' }),
    ).toBeUndefined();
    expect(endpointLabel(project, { kind: 'device', deviceId: 'missing', portId: 'net' })).toBe(
      'Missing endpoint · Missing port',
    );
  });

  it.each([
    ['RJ45', 'RJ45', true],
    ['USB-C', 'USB-C', true],
    ['HDMI', 'RJ45', false],
    ['USB-A', 'USB-C', false],
    ['IEC-C13', 'IEC-C14', true],
    ['IEC-C14', 'IEC-C13', true],
    ['IEC-C19', 'IEC-C20', true],
    ['IEC-C20', 'IEC-C19', true],
    ['IEC-C13', 'IEC-C13', false],
    ['IEC-C14', 'IEC-C14', false],
    ['IEC-C19', 'IEC-C19', false],
    ['IEC-C20', 'IEC-C20', false],
    ['IEC-C13', 'IEC-C20', false],
    ['IEC-C19', 'IEC-C14', false],
    ['IEC-C13', 'RJ45', false],
    ['SFP', 'SFP', true],
  ])('applies the explicit connector mapping for %s and %s', (a, b, compatible) => {
    expect(connectorsCompatible(a, b)).toBe(compatible);
  });

  it('validates an existing cable without confusing its own occupied ports with another cable', () => {
    const project = createExampleProject();
    const cable = project.cables[0];
    expect(connectionIssues(project, cable.source, cable.destination, cable.id)).toEqual([]);
    expect(connectionIssues(project, cable.source, cable.destination).join(' ')).toContain(
      'already connected',
    );
  });

  it('rejects missing endpoint owners and missing port IDs', () => {
    const project = createExampleProject();
    const destination: Endpoint = { kind: 'device', deviceId: 'switch-1', portId: 'p1' };
    expect(
      connectionIssues(
        project,
        { kind: 'device', deviceId: 'missing', portId: 'net' },
        destination,
      ),
    ).toEqual(['Both endpoints must refer to existing physical ports.']);
    expect(
      connectionIssues(
        project,
        { kind: 'device', deviceId: 'pc-1', portId: 'missing' },
        destination,
      ),
    ).toEqual(['Both endpoints must refer to existing physical ports.']);
  });

  it('rejects self-connections and incompatible physical connector selections', () => {
    const project = createExampleProject();
    const same: Endpoint = { kind: 'device', deviceId: 'switch-1', portId: 'p1' };
    expect(connectionIssues(project, same, same).join(' ')).toContain(
      'cannot connect a port to itself',
    );
    const incompatible = connectionIssues(
      project,
      { kind: 'device', deviceId: 'pc-1', portId: 'usb' },
      same,
    );
    expect(incompatible.join(' ')).toContain('USB-C and RJ45 are incompatible');
  });

  it('permits shared endpoints only when their physical port definition explicitly allows it', () => {
    const project = createExampleProject();
    const cable = project.cables[0];
    project.definitions
      .find((definition) => definition.id === 'def-pc')!
      .ports.find((port) => port.id === 'net')!.multiple = true;
    project.definitions
      .find((definition) => definition.id === 'def-switch')!
      .ports.find((port) => port.id === 'uplink')!.multiple = true;
    expect(connectionIssues(project, cable.source, cable.destination)).toEqual([]);
  });

  it('requires at least one rack-side endpoint', () => {
    const project = createExampleProject();
    const source: Endpoint = { kind: 'external', destinationId: 'desk-1', portId: 'network' };
    const destination: Endpoint = {
      kind: 'external',
      destinationId: 'screen-1',
      portId: 'network',
    };
    expect(connectionIssues(project, source, destination).join(' ')).toContain(
      'At least one endpoint must be inside this rack',
    );
  });

  it('treats equal endpoint identifiers as equal regardless of object property insertion order', () => {
    const project = createExampleProject();
    const reordered: Endpoint = { portId: 'net', deviceId: 'pc-1', kind: 'device' };
    const destination: Endpoint = { kind: 'device', deviceId: 'switch-1', portId: 'p1' };
    expect(connectionIssues(project, reordered, destination).join(' ')).toContain(
      'already connected',
    );
  });
});

/** A PDU with six C13 outlets in one bank and a switch with a C14 inlet. */
function powerProject(): Project {
  const project = createExampleProject(false);
  project.devices = [
    {
      id: 'pdu',
      definitionId: 'def-pdu',
      name: 'PDU',
      startU: 1,
      face: 'front',
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
  project.cables = [];
  project.definitions.find((d) => d.id === 'def-pdu')!.powerBanks = [
    {
      id: 'b1',
      name: 'Bank 1',
      portIds: ['iec1', 'iec2', 'iec3', 'iec4', 'iec5', 'iec6'],
      maxCurrentA: 16,
      outletMaxCurrentA: 10,
      voltageV: 230,
      evidence: 'example',
      source: 'test fixture',
    },
  ];
  return project;
}
const outlet = (n: number): Endpoint => ({ kind: 'device', deviceId: 'pdu', portId: `iec${n}` });
const inlet: Endpoint = { kind: 'device', deviceId: 'sw', portId: 'power' };
const powerCable = (id: string, source: Endpoint, destination: Endpoint): Cable => ({
  ...baseCable(id),
  label: id,
  type: 'Power',
  source,
  destination,
});

describe('gendered IEC 60320 power couplers', () => {
  it('identifies only same-gender IEC pairs, leaving other identical connectors compatible', () => {
    expect(sameGenderCouplers('IEC-C13', 'IEC-C13')).toBe(true);
    expect(sameGenderCouplers('IEC-C20', 'IEC-C20')).toBe(true);
    expect(sameGenderCouplers('IEC-C13', 'IEC-C14')).toBe(false);
    expect(sameGenderCouplers('RJ45', 'RJ45')).toBe(false);
    expect(connectorsCompatible('RJ45', 'RJ45')).toBe(true);
    // Not inherited object keys: an unusual connector name is still compared literally.
    expect(connectorsCompatible('constructor', 'constructor')).toBe(true);
    expect(connectorsCompatible('constructor', 'IEC-C13')).toBe(false);
  });

  it('accepts an outlet-to-inlet cable and rejects a new outlet-to-outlet cable', () => {
    const project = powerProject();
    expect(connectionIssues(project, inlet, outlet(1))).toEqual([]);
    expect(connectionIssues(project, outlet(1), inlet)).toEqual([]);
    expect(connectionIssues(project, outlet(1), outlet(2))).toEqual([
      'Two IEC-C13 couplers cannot mate: IEC 60320 connectors are gendered. Join a C13 to a C14 or a C19 to a C20.',
    ]);
  });

  it('still loads and round-trips a stored outlet-to-outlet cable, which power analysis flags', () => {
    const project = powerProject();
    project.cables = [powerCable('LEGACY', outlet(1), outlet(2))];
    expect(validateReferences(project)).toEqual([]);
    expect(
      connectionIssues(project, outlet(1), outlet(2), 'LEGACY', { tolerateSameGender: true }),
    ).toEqual([]);
    const loaded = parseProject(serializeProject(project));
    expect(loaded.cables.map((c) => [c.id, c.source, c.destination])).toEqual([
      ['LEGACY', outlet(1), outlet(2)],
    ]);
    expect(analysePower(loaded).issues.map((i) => i.code)).toEqual(['outlet-to-outlet']);
  });

  it('reports same-gender connections that an edit creates but not an unchanged stored one', () => {
    const previous = powerProject();
    previous.cables = [
      powerCable('LEGACY', outlet(1), outlet(2)),
      powerCable('GOOD', inlet, outlet(3)),
    ];
    const message =
      'Two IEC-C13 couplers cannot mate: IEC 60320 connectors are gendered. Join a C13 to a C14 or a C19 to a C20.';
    // Unchanged legacy cable, or an unrelated change, raises nothing.
    const unrelated = structuredClone(previous);
    unrelated.cables[1].label = 'Renamed';
    expect(newSameGenderConnections(previous, unrelated)).toEqual([]);
    // A new outlet-to-outlet cable is reported.
    const added = structuredClone(previous);
    added.cables.push(powerCable('NEW', outlet(4), outlet(5)));
    expect(newSameGenderConnections(previous, added)).toEqual([`NEW: ${message}`]);
    // Re-pointing a cable, even the legacy one, to another outlet is a new connection.
    const repointed = structuredClone(previous);
    repointed.cables[0].destination = outlet(6);
    repointed.cables[1].source = outlet(4);
    expect(newSameGenderConnections(previous, repointed)).toEqual([
      `LEGACY: ${message}`,
      `GOOD: ${message}`,
    ]);
    // Changing the inlet's connector type turns the existing good cable into a C13 pair.
    const retyped = structuredClone(previous);
    retyped.definitions
      .find((d) => d.id === 'def-generic-switch-24')!
      .ports.find((p) => p.id === 'power')!.connector = 'IEC-C13';
    expect(newSameGenderConnections(previous, retyped)).toEqual([`GOOD: ${message}`]);
  });
});
