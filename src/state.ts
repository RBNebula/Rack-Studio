import { create } from 'zustand';
import type { Project, Endpoint, Vec3 } from './model';
import { clone } from './model';
import { createWorkspaceProject } from './examples';
import { projectSchema } from './model';
import { validateReferences } from './data/project';
import { validatePlacement, validateRack } from './engineering/geometry';

type View = 'orbit' | 'front' | 'rear' | 'left' | 'right' | 'top';
export type Workspace =
  | 'designer'
  | 'model'
  | 'library'
  | 'connections'
  | 'schedule'
  | 'cuts'
  | 'procurement'
  | 'settings';
export type Selection = {
  kind: 'device' | 'cable' | 'exit' | 'accessory' | 'guide' | 'destination' | 'rack' | 'member';
  id: string;
} | null;
interface State {
  project: Project;
  past: Project[];
  future: Project[];
  workspace: Workspace;
  selection: Selection;
  view: View;
  orthographic: boolean;
  showCables: boolean;
  showLabels: boolean;
  showMeasurements: boolean;
  showGround: boolean;
  notice: string;
  error: string;
  hydrated: boolean;
  dirty: boolean;
  saveStatus: string;
  dragDefinitionId: string | null;
  dragDeviceId: string | null;
  previewU: number | null;
  placeFace: 'front' | 'rear';
  wiringTool: 'off' | 'select' | 'connect' | 'waypoints' | 'link';
  wiringSource: Endpoint | null;
  wiringExitId: string | null;
  wiringLineStart: Vec3 | null;
  wiringGuideId: string | null;
  activeRackId: string | null;
  showModelTools: boolean;
  modelTool: 'select' | 'translate' | 'rotate' | 'measure' | 'anchor' | 'tie';
  hiddenKeys: string[];
  isolateKey: string | null;
  measureStart: Vec3 | null;
  modelPreview: { selection: NonNullable<Selection>; position: Vec3; rotationDeg: Vec3 } | null;
  edit: (label: string, fn: (p: Project) => void) => boolean;
  replace: (p: Project) => void;
  undo: () => void;
  redo: () => void;
  set: (patch: Partial<State>) => void;
}
export const useStore = create<State>((set, get) => ({
  project: createWorkspaceProject(),
  past: [],
  future: [],
  workspace: 'designer',
  selection: null,
  view: 'orbit',
  orthographic: false,
  showCables: true,
  showLabels: true,
  showMeasurements: false,
  showGround: true,
  notice:
    'Example project loaded. Rack depth is screw-plane spacing; numerical dimensions need confirmation.',
  error: '',
  hydrated: false,
  dirty: false,
  saveStatus: 'Not saved yet',
  dragDefinitionId: null,
  dragDeviceId: null,
  previewU: null,
  placeFace: 'front',
  wiringTool: 'off',
  wiringSource: null,
  wiringExitId: null,
  wiringLineStart: null,
  wiringGuideId: null,
  activeRackId: null,
  showModelTools: false,
  modelTool: 'select',
  hiddenKeys: [],
  isolateKey: null,
  measureStart: null,
  modelPreview: null,
  set: (patch) => set(patch),
  edit: (label, fn) => {
    try {
      const state = get();
      const draft = clone(state.project);
      fn(draft);
      const next = projectSchema.parse(draft);
      const issues = [...validateReferences(next), ...validateRack(next.rack)];
      for (const d of next.devices) {
        const old = state.project.devices.find((v) => v.id === d.id);
        const previous = old ? validatePlacement(state.project, old, old.id) : [];
        issues.push(
          ...validatePlacement(next, d, d.id)
            .filter((issue) => !previous.includes(issue))
            .map((issue) => `${d.name}: ${issue}`),
        );
      }
      if (issues.length) throw new Error([...new Set(issues)].join('\n'));
      next.revision++;
      next.updatedAt = new Date().toISOString();
      set({
        project: next,
        past: [...state.past.slice(-49), state.project],
        future: [],
        dirty: true,
        notice: label,
        error: '',
      });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  },
  replace: (p) =>
    set({
      project: clone(p),
      past: [],
      future: [],
      selection: null,
      wiringTool: 'off',
      wiringSource: null,
      wiringExitId: null,
      wiringLineStart: null,
      wiringGuideId: null,
      activeRackId: null,
      showModelTools: false,
      modelTool: 'select',
      hiddenKeys: [],
      isolateKey: null,
      measureStart: null,
      modelPreview: null,
      dirty: false,
      notice: 'Project opened.',
      error: '',
    }),
  undo: () => {
    const s = get();
    const p = s.past.at(-1);
    if (p)
      set({
        project: { ...p, revision: s.project.revision + 1, updatedAt: new Date().toISOString() },
        past: s.past.slice(0, -1),
        future: [s.project, ...s.future],
        dirty: true,
        selection: null,
        wiringSource: null,
        wiringLineStart: null,
        wiringGuideId: null,
        notice: 'Change undone.',
        modelPreview: null,
        measureStart: null,
        error: '',
      });
  },
  redo: () => {
    const s = get();
    const p = s.future[0];
    if (p)
      set({
        project: { ...p, revision: s.project.revision + 1, updatedAt: new Date().toISOString() },
        past: [...s.past, s.project],
        future: s.future.slice(1),
        dirty: true,
        selection: null,
        wiringSource: null,
        wiringLineStart: null,
        wiringGuideId: null,
        notice: 'Change redone.',
        modelPreview: null,
        measureStart: null,
        error: '',
      });
  },
}));
