import type { Endpoint, Vec3, WiringGuide } from '../model';
import { cableLabel, uid } from '../model';
import { useStore } from '../state';
import { baseCable } from '../examples';
import {
  connectionIssues,
  endpointIdentity,
  endpointLabel,
  endpointPort,
} from '../engineering/connectivity';

export function connectWiringPort(endpoint: Endpoint) {
  const s = useStore.getState();
  if (s.wiringTool !== 'connect') return;
  if (!s.wiringSource) {
    const occupied = s.project.cables.some((c) =>
      [c.source, c.destination].some((e) => endpointIdentity(e) === endpointIdentity(endpoint)),
    );
    if (occupied && !endpointPort(s.project, endpoint)?.multiple) {
      s.set({ error: `${endpointLabel(s.project, endpoint)} is already connected.` });
      return;
    }
    s.set({
      wiringSource: endpoint,
      error: '',
      notice: `Source: ${endpointLabel(s.project, endpoint)}. Select the destination port.`,
    });
    return;
  }
  const issues = connectionIssues(s.project, s.wiringSource, endpoint);
  if (issues.length) {
    s.set({ error: issues.join('\n') });
    return;
  }
  let number = 0;
  while (s.project.cables.some((c) => cableLabel(c) === String(number))) number++;
  const port = endpointPort(s.project, endpoint)!;
  const external = [s.wiringSource, endpoint].some((e) => e.kind === 'external');
  const exitId = external
    ? (s.wiringExitId ?? (s.project.exits.length === 1 ? s.project.exits[0].id : null))
    : null;
  if (external && !exitId) {
    s.set({ error: 'Choose a rack exit in Wiring tools before connecting a vehicle endpoint.' });
    return;
  }
  const cable = {
    ...baseCable(uid('cable')),
    label: String(number),
    name: `Cable ${number}`,
    source: s.wiringSource,
    destination: endpoint,
    exitId,
    type:
      port.connector === 'RJ45'
        ? 'Cat6A'
        : port.connector.startsWith('IEC')
          ? 'Power'
          : port.connector,
    // Physical cable size and supplied length must be entered for this connection.
    suppliedLengthMm: null,
    notes:
      'Created in Wiring mode. Cable diameter/clearance are provisional defaults; confirm the cable specification.',
    ...(port.connector !== 'RJ45' ? { terminationAMm: 0, terminationBMm: 0 } : {}),
  };
  if (
    s.edit(
      'Cable created. Select Link cable, then click guides in route order. Confirm cable properties in the inspector.',
      (p) => p.cables.push(cable),
    )
  )
    s.set({ selection: { kind: 'cable', id: cable.id }, wiringSource: null });
}

export function placeWiringGuide(point: Vec3, shift: boolean) {
  const s = useStore.getState();
  if (!s.wiringLineStart && shift) {
    s.set({
      wiringLineStart: point,
      notice:
        'Line start set 10 mm off the surface. Click the second surface position; Esc cancels.',
    });
    return;
  }
  const id = uid('guide');
  const name = `${s.wiringLineStart ? 'Line' : 'Point'} ${(s.project.wiringGuides?.length ?? 0) + 1}`;
  const guide: WiringGuide = s.wiringLineStart
    ? { id, name, kind: 'line', start: s.wiringLineStart, end: point }
    : { id, name, kind: 'point', position: point };
  if (
    s.edit(`${name} created. Guides stay at their world positions when equipment moves.`, (p) => {
      (p.wiringGuides ??= []).push(guide);
    })
  )
    s.set({ wiringLineStart: null, wiringGuideId: id });
}

export function clickWiringGuide(id: string) {
  const s = useStore.getState();
  s.set({ wiringGuideId: id });
  if (s.wiringTool !== 'link') return;
  if (s.selection?.kind !== 'cable') {
    s.set({ error: 'Select a cable before linking guides.' });
    return;
  }
  const cable = s.project.cables.find((c) => c.id === s.selection?.id);
  if (!cable) return;
  if (cable.guideLinks?.some((l) => l.guideId === id)) {
    s.set({ notice: 'This guide is already linked. Use the route list to reorder or reverse it.' });
    return;
  }
  s.edit('Guide linked to the end of the cable route.', (p) => {
    (p.cables.find((c) => c.id === cable.id)!.guideLinks ??= []).push({
      guideId: id,
      reverse: false,
    });
  });
}
