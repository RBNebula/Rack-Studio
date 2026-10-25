import { definitionSchema, type DeviceDefinition, type PhysicalBox } from '../model';

/** Reach is the inside face of the crossbar: a clear 150 mm inward return by default. */
export function lacingBarParts(d: DeviceDefinition): PhysicalBox[] {
  if (!d.lacing) return [];
  const { barWidthMm: w, barHeightMm: h } = d.lacing;
  const t = d.earThicknessMm ?? 2;
  return [
    ...[-1, 1].map((side): PhysicalBox => ({
      id: `lacing-return-${side}`,
      name: `${side < 0 ? 'Left' : 'Right'} lacing return`,
      position: [(side * (d.widthMm - w)) / 2, d.heightMm / 2, (d.depthMm - t) / 2],
      size: [w, h, d.depthMm + t],
    })),
    {
      id: 'lacing-crossbar',
      name: 'Lacing crossbar',
      position: [0, d.heightMm / 2, d.depthMm - w / 2],
      size: [d.widthMm - 2 * w, h, w],
    },
  ];
}

export function createLacingBar(): DeviceDefinition {
  return definitionSchema.parse({
    id: 'def-lacing-bar',
    name: 'Adjustable lacing bar · middle hole',
    category: 'Cable management',
    manufacturer: '',
    model: '',
    widthMm: 430,
    faceWidthMm: 482.6,
    heightU: 1,
    heightMm: 14,
    depthMm: 156,
    earThicknessMm: 2,
    mounting: 'bracket',
    bodyMode: 'parts',
    lacing: { barWidthMm: 6, barHeightMm: 8 },
    color: '#333b40',
    evidence: 'example',
    source:
      'User requested one middle-hole screw per side, a 150 mm inward return and a crossbar. Generic editable example: reach to inside face 150 mm; 6 × 8 mm bar, 14 mm tabs and 2 mm ears are provisional. No load rating or manufacturer compatibility is established.',
    massKg: null,
    railMinMm: null,
    railMaxMm: null,
    screwOffsetsMm: [22.225],
    ports: [],
    parts: [],
    frontImage: null,
    rearImage: null,
  });
}
