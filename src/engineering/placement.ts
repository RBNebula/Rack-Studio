import type { Device, Project } from '../model';
import { validatePlacement } from './geometry';
/** Project a complete move before validation so supported objects move together. */
export function projectWithPlacement(project: Project, candidate: Device): Project {
  const old = project.devices.find((d) => d.id === candidate.id);
  const affected = new Set([candidate.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of project.devices)
      if (d.supportId && affected.has(d.supportId) && !affected.has(d.id)) {
        affected.add(d.id);
        changed = true;
      }
  }
  const delta = old ? candidate.startU - old.startU : 0;
  const devices = project.devices.map((d) =>
    d.id === candidate.id
      ? candidate
      : affected.has(d.id)
        ? { ...d, startU: d.startU + delta, face: candidate.face }
        : d,
  );
  if (!old) devices.push(candidate);
  return { ...project, devices };
}
export function placementIssues(project: Project, candidate: Device): string[] {
  const draft = projectWithPlacement(project, candidate);
  const previous = new Map(project.devices.map((device) => [device.id, device]));
  return [
    ...new Set(
      draft.devices
        .filter((d) => previous.get(d.id) !== d)
        .flatMap((d) => validatePlacement(draft, d, d.id)),
    ),
  ];
}
