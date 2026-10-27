import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../state';
import { createWorkspaceProject } from '../testing/legacy-example';
import { clickWiringGuide, connectWiringPort, placeWiringGuide } from './wiringActions';
import type { Endpoint } from '../model';
import { parseProject, serializeProject } from '../data/project';
const endpoint = (id: string, portId = 'front-usb-top'): Endpoint => ({
  kind: 'device',
  deviceId: id,
  portId,
});
beforeEach(() => {
  const p = createWorkspaceProject(false);
  p.devices = [8, 12].map((startU, i) => ({
    id: `pc${i}`,
    definitionId: 'def-user-rack-pc',
    name: `PC${i}`,
    startU,
    face: 'front',
    supportId: null,
    installation: 'installed',
  }));
  useStore.getState().replace(p);
});
describe('wiring transactions', () => {
  it('rejects incompatible or occupied ports and preserves the pending valid source', () => {
    const s = useStore.getState();
    s.set({ wiringTool: 'connect' });
    connectWiringPort(endpoint('pc0'));
    connectWiringPort(endpoint('pc1', 'rear-rj45'));
    expect(useStore.getState().error).toContain('incompatible');
    expect(useStore.getState().wiringSource).toEqual(endpoint('pc0'));
    connectWiringPort(endpoint('pc1'));
    expect(useStore.getState().project.cables).toHaveLength(1);
    connectWiringPort(endpoint('pc0'));
    expect(useStore.getState().wiringSource).toBeNull();
    expect(useStore.getState().error).toContain('already connected');
  });
  it('links one shared guide to two independent cables, retaining identity through undo and portable export', () => {
    const s = useStore.getState();
    s.set({ wiringTool: 'connect' });
    connectWiringPort(endpoint('pc0'));
    connectWiringPort(endpoint('pc1'));
    connectWiringPort(endpoint('pc0', 'front-usb-bottom'));
    connectWiringPort(endpoint('pc1', 'front-usb-bottom'));
    expect(useStore.getState().project.cables.map((c) => c.label)).toEqual(['0', '1']);
    placeWiringGuide([232, 400, -10], false);
    const guideId = useStore.getState().project.wiringGuides![0].id;
    s.set({ wiringTool: 'link' });
    for (const c of useStore.getState().project.cables) {
      s.set({ selection: { kind: 'cable', id: c.id } });
      clickWiringGuide(guideId);
    }
    const saved = useStore.getState().project;
    expect(saved.cables.every((c) => c.guideLinks?.[0].guideId === guideId)).toBe(true);
    expect(parseProject(serializeProject(saved))).toEqual(saved);
    s.undo();
    expect(useStore.getState().project.cables[1].guideLinks).toBeUndefined();
    s.redo();
    expect(useStore.getState().project.cables).toEqual(saved.cables);
  });
  it('retains the first line click after a degenerate end is rejected and creates one undoable guide', () => {
    placeWiringGuide([0, 100, -10], true);
    expect(useStore.getState().project.wiringGuides).toBeUndefined();
    placeWiringGuide([0, 100, -10], false);
    expect(useStore.getState().error).toContain('at least 1 mm');
    expect(useStore.getState().wiringLineStart).toEqual([0, 100, -10]);
    placeWiringGuide([0, 200, -10], false);
    expect(useStore.getState().project.wiringGuides).toHaveLength(1);
    expect(useStore.getState().wiringLineStart).toBeNull();
    useStore.getState().undo();
    expect(useStore.getState().project.wiringGuides).toBeUndefined();
  });
  it('prevents dangling guide deletion and resets pending wiring when a project is replaced', () => {
    const s = useStore.getState();
    s.set({ wiringTool: 'connect' });
    connectWiringPort(endpoint('pc0'));
    connectWiringPort(endpoint('pc1'));
    placeWiringGuide([232, 400, -10], false);
    s.set({ wiringTool: 'link' });
    clickWiringGuide(useStore.getState().project.wiringGuides![0].id);
    expect(
      s.edit('delete', (p) => {
        p.wiringGuides = [];
      }),
    ).toBe(false);
    expect(useStore.getState().project.wiringGuides).toHaveLength(1);
    s.set({ wiringSource: endpoint('pc0'), wiringLineStart: [0, 0, 0] });
    s.replace(createWorkspaceProject(false));
    expect(useStore.getState().wiringTool).toBe('off');
    expect(useStore.getState().wiringLineStart).toBeNull();
    expect(useStore.getState().wiringSource).toBeNull();
  });
});
