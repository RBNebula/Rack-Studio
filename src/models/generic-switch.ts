import { definitionSchema, type DeviceDefinition, type Port } from '../model';

const source =
  'Generic editable layout inspired by the user-supplied silver switch photograph. PROVISIONAL: chassis 442.4 × 325 × 43.7 mm, 2 mm ears and all connector centres/sizes. Photo annotations do not verify an ear-to-rear datum. No manufacturer, link speed, PoE capability or optical module is inferred.';

export function switchMountingSlots(d: DeviceDefinition, railCentersMm = 465.1) {
  const bottomGap = (d.heightU * 44.45 - d.heightMm) / 2;
  return [-1, 1].flatMap((side) =>
    d.screwOffsetsMm.map((offset) => ({ x: (side * railCentersMm) / 2, y: offset - bottomGap })),
  );
}

/** +X is left in a front view; local zero is the ear bearing plane/chassis bottom. */
export function createGenericSwitch(): DeviceDefinition {
  const socket = (
    id: string,
    name: string,
    connector: string,
    x: number,
    front: boolean,
    widthMm: number,
    heightMm: number,
  ): Port => ({
    id,
    name,
    connector,
    surface: front ? 'front' : 'rear',
    position: [x, front ? 20.5 : 21.85, front ? -2 : 325],
    direction: [0, 0, front ? -1 : 1],
    multiple: false,
    widthMm,
    heightMm,
    evidence: 'example',
    source,
  });
  return definitionSchema.parse({
    id: 'def-generic-switch-24',
    name: 'Generic 24-port switch · 1U',
    manufacturer: '',
    model: '',
    category: 'Network switches',
    widthMm: 442.4,
    depthMm: 325,
    heightMm: 43.7,
    heightU: 1,
    faceWidthMm: 482.6,
    earThicknessMm: 2,
    mounting: 'direct',
    bodyMode: 'box',
    shelf: null,
    plate: null,
    appearance: 'generic-switch-24',
    color: '#b8bdc2',
    evidence: 'example',
    source,
    massKg: null,
    railMinMm: null,
    railMaxMm: null,
    screwOffsetsMm: [6.35, 38.1],
    parts: [],
    frontImage: null,
    rearImage: null,
    ports: [
      ...Array.from({ length: 24 }, (_, i) =>
        socket(`p${i + 1}`, `Ethernet ${i + 1}`, 'RJ45', 194 - i * 15, true, 14, 12.5),
      ),
      socket('sfp1', 'SFP 1 · cage', 'SFP', -184, true, 14, 9.5),
      socket('sfp2', 'SFP 2 · cage', 'SFP', -204, true, 14, 9.5),
      socket('power', 'AC power input · IEC C14', 'IEC-C14', 185, false, 28, 20),
    ],
  });
}
