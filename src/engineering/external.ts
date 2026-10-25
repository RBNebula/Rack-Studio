import type { Cable, Endpoint, Project } from '../model';
export const positionedEndpoint = (p: Project, e: Endpoint) =>
  e.kind === 'external' &&
  p.destinations.some((d) => d.id === e.destinationId && d.routeIn3D && d.position);
export const positionedExternalCable = (p: Project, c: Cable) =>
  [c.source, c.destination].some((e) => positionedEndpoint(p, e));
