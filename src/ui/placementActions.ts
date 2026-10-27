import type { Device } from '../model';
import { uid } from '../model';
import { useStore } from '../state';
import { placementIssues, projectWithPlacement } from '../engineering/placement';

/**
 * Commit a dropped placement (new or moved device) shared by the 3D viewport and the 2D
 * elevations. Nothing changes unless every placement check passes; a blocked drop only reports
 * the reason. `extraIssues` are UI-level blocks checked before the engineering rules.
 */
export function commitPlacement(
  candidate: Device | null,
  extraIssues: string[] = [],
  where = '',
  /** Device to select afterwards; defaults to the moved one (a shelf's equipment keeps focus). */
  selectId?: string,
): boolean {
  const state = useStore.getState();
  if (!candidate) {
    state.set({ error: 'Release over the rack to choose a mounting position.', previewU: null });
    return false;
  }
  const issues = [...extraIssues, ...placementIssues(state.project, candidate)];
  if (issues.length) {
    state.set({
      error: `Cannot place ${candidate.name} at U${candidate.startU}${where}: ${issues.join(' ')}`,
    });
    return false;
  }
  const moving = state.project.devices.some((device) => device.id === candidate.id);
  const installed = moving ? candidate : { ...candidate, id: uid('device') };
  const next = projectWithPlacement(state.project, installed);
  if (
    !state.edit(
      `${moving ? 'Moved' : 'Placed'} ${installed.name} at U${installed.startU}${where}. Connected cables remain linked; review their route validation. Installation animations are not implemented.`,
      (draft) => {
        draft.devices = next.devices;
      },
    )
  )
    return false;
  state.set({ selection: { kind: 'device', id: selectId ?? installed.id } });
  return true;
}
