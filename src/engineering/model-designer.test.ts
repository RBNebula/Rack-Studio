import { expect, it } from 'vitest';
import { designerIssues, traySlots } from './model-designer';
import { createUserRackPc } from '../models/user-rack-pc';
import { createWorkspaceProject } from '../examples';
import { parseProject, serializeProject } from '../data/project';
it('rejects an 18-inch chassis and components extending outside the face', () => {
  const d = createUserRackPc();
  expect(designerIssues(d)).toEqual([]);
  d.widthMm = 457.2;
  expect(designerIssues(d).join()).toContain('less than 18');
  d.widthMm = 431.8;
  d.ports[0].position[1] = 43;
  expect(designerIssues(d).join()).toContain('beyond');
});
it('adds complete fixed slots at the far end without changing earlier slot dimensions or positions', () => {
  const a = traySlots(110, 200),
    b = traySlots(110, 400);
  expect(b.length).toBeGreaterThan(a.length);
  expect(b.slice(0, a.length)).toEqual(a);
  expect(b.every((v) => v.width === 12 && v.length === 24)).toBe(true);
  expect(traySlots(110, 40)).toEqual(b.slice(0, 4));
});
it('retains ports and decorative features separately through project persistence', () => {
  const p = createWorkspaceProject(false);
  const d = p.definitions[0];
  d.faceFeatures = [
    { id: 'fan1', kind: 'fan', surface: 'rear', x: 0, y: 21, widthMm: 30, heightMm: 30 },
  ];
  expect(parseProject(serializeProject(p)).definitions[0]).toEqual(d);
  expect(d.ports.some((port) => port.id === 'fan1')).toBe(false);
});
it('uses the annotated user photo for rear connector identities and interface labels', () => {
  const d = createUserRackPc();
  expect(d.ports.find((p) => p.id === 'rear-video-top')?.connector).toBe('DisplayPort');
  expect(d.ports.find((p) => p.id === 'rear-usb-middle-top')?.protocol).toBe('USB 3.0');
  expect(d.ports.filter((p) => p.protocol === 'USB 2.0')).toHaveLength(5);
});
