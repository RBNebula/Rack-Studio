import type { Endpoint, Port, Project } from '../model';
export function endpointIdentity(e: Endpoint): string {
  return JSON.stringify(
    e.kind === 'device'
      ? ['device', e.deviceId, e.portId]
      : ['external', e.destinationId, e.portId],
  );
}
export function endpointPort(p: Project, e: Endpoint): Port | undefined {
  return e.kind === 'device'
    ? p.definitions
        .find((d) => d.id === p.devices.find((v) => v.id === e.deviceId)?.definitionId)
        ?.ports.find((x) => x.id === e.portId)
    : p.destinations.find((d) => d.id === e.destinationId)?.ports.find((x) => x.id === e.portId);
}
export function endpointLabel(p: Project, e: Endpoint): string {
  const owner =
    e.kind === 'device'
      ? p.devices.find((d) => d.id === e.deviceId)?.name
      : p.destinations.find((d) => d.id === e.destinationId)?.name;
  return `${owner ?? 'Missing endpoint'} · ${endpointPort(p, e)?.name ?? 'Missing port'}`;
}
export function connectorsCompatible(a: string, b: string): boolean {
  return a === b || [a, b].sort().join('|') === 'IEC-C13|IEC-C14';
}
export function connectionIssues(
  p: Project,
  source: Endpoint,
  destination: Endpoint,
  ignoreCableId?: string,
): string[] {
  const a = endpointPort(p, source),
    b = endpointPort(p, destination);
  const issues: string[] = [];
  if (!a || !b) return ['Both endpoints must refer to existing physical ports.'];
  if (endpointIdentity(source) === endpointIdentity(destination))
    issues.push('A cable cannot connect a port to itself.');
  if (!connectorsCompatible(a.connector, b.connector))
    issues.push(
      `Connector types ${a.connector} and ${b.connector} are incompatible. Choose compatible ports.`,
    );
  for (const e of [source, destination])
    if (
      !endpointPort(p, e)?.multiple &&
      p.cables.some(
        (c) =>
          c.id !== ignoreCableId &&
          [c.source, c.destination].some((v) => endpointIdentity(v) === endpointIdentity(e)),
      )
    )
      issues.push(`${endpointLabel(p, e)} is already connected.`);
  if (source.kind === 'external' && destination.kind === 'external')
    issues.push('At least one endpoint must be inside this rack.');
  return issues;
}
