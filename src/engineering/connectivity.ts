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
/**
 * IEC 60320 appliance couplers are gendered: a C13 or C19 connector (socket) mates only with the
 * matching C14 or C20 inlet. Two sockets or two inlets never connect directly.
 */
const IEC_60320_MATES: ReadonlyMap<string, string> = new Map([
  ['IEC-C13', 'IEC-C14'],
  ['IEC-C14', 'IEC-C13'],
  ['IEC-C19', 'IEC-C20'],
  ['IEC-C20', 'IEC-C19'],
]);
export function connectorsCompatible(a: string, b: string): boolean {
  if (IEC_60320_MATES.has(a) || IEC_60320_MATES.has(b)) return IEC_60320_MATES.get(a) === b;
  return a === b;
}
/** Two IEC 60320 couplers of the same gender, such as an outlet joined to another outlet. */
export function sameGenderCouplers(a: string, b: string): boolean {
  return a === b && IEC_60320_MATES.has(a);
}
const sameGenderIssue = (connector: string): string =>
  `Two ${connector} couplers cannot mate: IEC 60320 connectors are gendered. Join a C13 to a C14 or a C19 to a C20.`;
export interface ConnectionIssueOptions {
  /**
   * Accept a stored same-gender IEC pair so existing projects still load and stay editable; the
   * power analysis reports it as outlet-to-outlet. New or re-pointed connections never use this.
   */
  tolerateSameGender?: boolean;
}
export function connectionIssues(
  p: Project,
  source: Endpoint,
  destination: Endpoint,
  ignoreCableId?: string,
  options: ConnectionIssueOptions = {},
): string[] {
  const a = endpointPort(p, source),
    b = endpointPort(p, destination);
  const issues: string[] = [];
  if (!a || !b) return ['Both endpoints must refer to existing physical ports.'];
  if (endpointIdentity(source) === endpointIdentity(destination))
    issues.push('A cable cannot connect a port to itself.');
  if (sameGenderCouplers(a.connector, b.connector)) {
    if (!options.tolerateSameGender) issues.push(sameGenderIssue(a.connector));
  } else if (!connectorsCompatible(a.connector, b.connector))
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
/**
 * Same-gender IEC connections that an edit creates: a new cable, a cable whose endpoints moved,
 * or a connector change that turns an existing cable into one. A stored legacy cable left
 * unchanged is not reported, so it never blocks unrelated edits.
 */
export function newSameGenderConnections(previous: Project, next: Project): string[] {
  const before = new Map(previous.cables.map((c) => [c.id, c]));
  const sameGender = (p: Project, source: Endpoint, destination: Endpoint): string | null => {
    const a = endpointPort(p, source),
      b = endpointPort(p, destination);
    return a && b && sameGenderCouplers(a.connector, b.connector) ? a.connector : null;
  };
  return next.cables.flatMap((c) => {
    const connector = sameGender(next, c.source, c.destination);
    if (!connector) return [];
    const old = before.get(c.id);
    const unchanged =
      old &&
      endpointIdentity(old.source) === endpointIdentity(c.source) &&
      endpointIdentity(old.destination) === endpointIdentity(c.destination) &&
      sameGender(previous, old.source, old.destination) !== null;
    return unchanged ? [] : [`${c.id}: ${sameGenderIssue(connector)}`];
  });
}
