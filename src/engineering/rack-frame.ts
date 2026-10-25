import type { Rack, Vec3 } from '../model';
import type { Obstacle } from './geometry';

// The frame uses the same millimetre U datum as the independent mounting rails.
const U_MM = 44.45;

/** Illustrative framing and explicitly configured outer end panels, never rails.
 * A depth transition retains the existing generic posts and crossbeams; only
 * the true top and base receive side crossmembers or optional full-depth plates.
 * Explicit construction suppresses generic members without suppressing panels.
 */
export function genericRackFrameBoxes(rack: Rack): Obstacle[] {
  const boxes: Obstacle[] = [];
  const add = (id: string, position: Vec3, size: Vec3) => {
    boxes.push({
      id,
      min: position.map((value, axis) => value - size[axis] / 2) as Vec3,
      max: position.map((value, axis) => value + size[axis] / 2) as Vec3,
    });
  };
  const f = rack.frameMm;
  // Plates cap the outside of generic crossmembers. Explicit construction has
  // no inferred member thickness, so its plate datum stays at the U boundary.
  const endFrame = rack.frameStyle === 'explicit' ? 0 : f;
  const front = -rack.frontInsetMm;
  for (const section of rack.sections) {
    const y0 = (section.startU - 1) * U_MM;
    const y1 = section.endU * U_MM;
    const rear = section.overallDepthMm - rack.frontInsetMm;
    if (rack.frameStyle !== 'explicit') {
      for (const side of [-1, 1]) {
        const x = (side * (rack.outerWidthMm - f)) / 2;
        for (const [label, z] of [
          ['front', front + f / 2],
          ['rear', rear - f / 2],
        ] as const) {
          add(`rack:${section.id}:${side}:${label}:post`, [x, (y0 + y1) / 2, z], [f, y1 - y0, f]);
        }
      }
      for (const [label, y] of [
        ['bottom', y0 - f / 2],
        ['top', y1 + f / 2],
      ] as const) {
        add(
          `rack:${section.id}:${label}:rear-beam`,
          [0, y, rear - f / 2],
          [rack.outerWidthMm, f, f],
        );
        if (section.startU === 1 || section.endU === rack.heightU) {
          add(
            `rack:${section.id}:${label}:front-beam`,
            [0, y, front + f / 2],
            [rack.outerWidthMm, f, f],
          );
        }
        const outerEnd =
          (label === 'bottom' && section.startU === 1) ||
          (label === 'top' && section.endU === rack.heightU);
        if (outerEnd) {
          for (const side of [-1, 1]) {
            add(
              `rack:${section.id}:${label}:${side}:side-beam`,
              [(side * (rack.outerWidthMm - f)) / 2, y, (front + rear) / 2],
              [f, f, section.overallDepthMm],
            );
          }
        }
      }
    }
    if (!rack.endPanels) continue;
    const t = rack.endPanels.thicknessMm;
    if (section.startU === 1 && rack.endPanels.base) {
      add(
        'rack:panel:base',
        [0, -endFrame - t / 2, (front + rear) / 2],
        [rack.outerWidthMm, t, section.overallDepthMm],
      );
    }
    if (section.endU === rack.heightU && rack.endPanels.top) {
      add(
        'rack:panel:top',
        [0, rack.heightU * U_MM + endFrame + t / 2, (front + rear) / 2],
        [rack.outerWidthMm, t, section.overallDepthMm],
      );
    }
  }
  return boxes;
}
