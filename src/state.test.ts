import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './state';
import { createWorkspaceProject } from './examples';
import { parseProject, serializeProject } from './data/project';

beforeEach(() => {
  useStore.getState().replace(createWorkspaceProject());
  useStore.getState().set({ dirty: false });
});
describe('atomic project edits and recovery history', () => {
  it('starts a flat rack using screw-plane depth and cable numbers from zero', () => {
    const p = useStore.getState().project;
    expect(p.rack.depthMeaning).toBe('rail-spacing');
    expect(p.rack.sections).toHaveLength(1);
    expect(p.rack.sections[0].rearRailZMm).toBe(800);
    expect(p.cables.map((c) => c.label)).toEqual(['0', '1']);
    expect(p.cables.every((c) => c.serviceMm === 0)).toBe(true);
  });
  it('uses confirmed square holes and includes both 60 mm terminations in the bulk schedule', () => {
    const p = useStore.getState().project;
    expect(p.rack.holeType).toBe('square');
    expect(p.cables[1].terminationAMm).toBe(60);
    expect(p.cables[1].terminationBMm).toBe(60);
    expect(p.settings.scheduleColumns).toEqual(
      expect.arrayContaining(['terminationA', 'terminationB', 'terminationTotal']),
    );
  });
  it('rejects an invalid edit without changing authoritative project data or undo history', () => {
    const p = useStore.getState().project;
    expect(
      useStore.getState().edit('Invalid height', (v) => {
        v.rack.heightU = 2;
      }),
    ).toBe(false);
    expect(useStore.getState().project).toBe(p);
    expect(useStore.getState().past).toHaveLength(0);
    expect(useStore.getState().error).toMatch(/height|U|top|range/i);
  });
  it('rejects a new obstruction collision rather than leaving occupied equipment inside it', () => {
    const p = useStore.getState().project;
    expect(
      useStore.getState().edit('Obstacle', (v) => {
        v.accessories.push({
          id: 'obstruction',
          name: 'Measured obstruction',
          position: [0, 700, 140],
          size: [200, 100, 200],
          kind: 'obstruction',
          parentId: null,
          cableIds: [],
          evidence: 'user-entered',
        });
      }),
    ).toBe(false);
    expect(useStore.getState().project).toBe(p);
  });
  it('renumbers labels while preserving cable identity and endpoint references across undo, redo and reload', () => {
    const before = useStore.getState().project;
    const record = before.cables[0];
    expect(
      useStore.getState().edit('Renumber', (p) => {
        p.cables[0].label = '42';
        p.cables[0].name = 'PC uplink';
      }),
    ).toBe(true);
    let after = useStore.getState().project;
    expect(after.cables[0].id).toBe(record.id);
    expect(after.cables[0].source).toEqual(record.source);
    expect(after.cables[0].label).toBe('42');
    useStore.getState().undo();
    expect(useStore.getState().project.cables[0].label).toBe('0');
    useStore.getState().redo();
    after = useStore.getState().project;
    expect(after.cables[0].label).toBe('42');
    expect(parseProject(serializeProject(after)).cables[0]).toEqual(after.cables[0]);
  });
  it('rejects duplicate visible numbers and cyclic follow references atomically', () => {
    expect(
      useStore.getState().edit('Duplicate number', (p) => {
        p.cables[1].label = '0';
      }),
    ).toBe(false);
    expect(
      useStore.getState().edit('Circular run', (p) => {
        p.cables[0].followCableId = p.cables[1].id;
        p.cables[1].followCableId = p.cables[0].id;
      }),
    ).toBe(false);
    expect(useStore.getState().project.cables[0].followCableId).toBeNull();
  });
  it('refuses unsupported imported fields instead of silently stripping user data', () => {
    const p = useStore.getState().project;
    expect(() =>
      parseProject(JSON.stringify({ ...p, futureGeometry: { outline: [1, 2, 3] } })),
    ).toThrow(/avoid discarding data/);
    expect(() =>
      parseProject(JSON.stringify({ ...p, rack: { ...p.rack, unrecognisedLoadRating: 200 } })),
    ).toThrow(/rack.unrecognisedLoadRating/);
  });
});
