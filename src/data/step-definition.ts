import type { DeviceDefinition, MeshAsset, Vec3 } from '../model';
import { uid } from '../model';
import { U_MM } from '../engineering/geometry';

export type StepMount = 'ears' | 'shelf';

/**
 * Equipment definition for an imported STEP model. With rack ears it mounts directly on the rails:
 * the model front sits `earOffsetMm` forward of the screw plane and the body is centred in its U
 * range. Without ears it is freestanding and needs a shelf, set `setbackMm` behind the shelf front.
 */
export function stepDefinition(options: {
  asset: MeshAsset;
  sizeMm: Vec3;
  name: string;
  manufacturer: string;
  model: string;
  mount: StepMount;
  earOffsetMm: number;
  setbackMm: number;
  chassisWidthMm: number;
  frontImage: string | null;
  rearImage: string | null;
}): DeviceDefinition {
  // Float32 tessellation leaves noise such as 217.8000030517578; keep 0.01 mm.
  const [w, h, d] = options.sizeMm.map((v) => Math.round(v * 100) / 100);
  const heightU = Math.max(1, Math.ceil(h / U_MM - 1e-6));
  const ears = options.mount === 'ears';
  return {
    id: uid('def'),
    name: options.name,
    manufacturer: options.manufacturer,
    model: options.model,
    category: 'Imported models',
    widthMm: ears ? Math.min(options.chassisWidthMm, w) : w,
    heightU,
    heightMm: h,
    depthMm: ears ? d - options.earOffsetMm : d,
    faceWidthMm: w,
    earThicknessMm: ears ? options.earOffsetMm : null,
    ...(ears ? {} : { shelfSetbackMm: options.setbackMm }),
    shelf: null,
    plate: null,
    appearance: null,
    mounting: ears ? 'direct' : 'freestanding',
    bodyMode: 'box',
    color: '#30373d',
    evidence: 'user-entered',
    source: `Imported from STEP file ${options.asset.fileName}: ${options.asset.triangles} display triangles${options.asset.omittedParts ? `, ${options.asset.omittedParts} hidden internal part(s) omitted` : ''}. Dimensions are the CAD bounding box; ${ears ? `front set ${options.earOffsetMm} mm forward of the rails for the ears` : `chassis set ${options.setbackMm} mm back on its shelf`}. Ports, mass and power are not in the file.`,
    massKg: null,
    railMinMm: null,
    railMaxMm: null,
    screwOffsetsMm: heightU === 1 ? [6.35, 38.1] : [6.35, heightU * U_MM - 6.35],
    ports: [],
    parts: [],
    frontImage: options.frontImage,
    rearImage: options.rearImage,
    mesh: { ...options.asset, offsetMm: [0, 0, ears ? -options.earOffsetMm : 0] },
  };
}
