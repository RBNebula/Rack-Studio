import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../examples';
import type { Endpoint } from '../model';
import {
  connectionIssues,
  connectorsCompatible,
  endpointLabel,
  endpointPort,
} from './connectivity';

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
