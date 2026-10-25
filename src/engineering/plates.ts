import type { DeviceDefinition, PhysicalBox, PlateConfiguration } from '../model';

const U_MM = 44.45;
export const MAX_PLATE_APERTURES = 4000;
export interface PlateAperture {
  x: number;
  y: number;
  radius: number;
}
export interface PlateSlot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function makePlateConfiguration(
  style: PlateConfiguration['style'] = 'solid',
): PlateConfiguration {
  return {
    style,
    thicknessMm: 1.5,
    returnDepthMm: 10,
    edgeMarginMm: 5,
    holeDiameterMm: 4,
    holePitchMm: 7,
    mountingCentersMm: 465.1,
    slotWidthMm: 10,
    slotHeightMm: 6,
  };
}

/** Staggered circular holes in the central field; mounting flanges remain solid. */
export function plateApertures(definition: DeviceDefinition): PlateAperture[] {
  const plate = definition.plate;
  if (!plate || plate.style !== 'perforated') return [];
  const radius = plate.holeDiameterMm / 2;
  const pitch = plate.holePitchMm;
  const verticalPitch = (pitch * Math.sqrt(3)) / 2;
  const xLimit = definition.widthMm / 2 - plate.edgeMarginMm - radius;
  const yLimit = definition.heightMm / 2 - plate.edgeMarginMm - radius;
  if (xLimit < 0 || yLimit < 0 || !Number.isFinite(pitch) || pitch <= plate.holeDiameterMm)
    return [];
  const rows = Math.floor((2 * yLimit) / verticalPitch) + 1;
  const columns = Math.floor((2 * xLimit) / pitch) + 1;
  if (rows * (columns + 1) > MAX_PLATE_APERTURES) return [];
  const apertures: PlateAperture[] = [];
  for (let row = 0; row < rows; row++) {
    const y = definition.heightMm / 2 + (row - (rows - 1) / 2) * verticalPitch;
    const shift = row % 2 ? 0.5 : 0;
    for (
      let column = Math.ceil(-xLimit / pitch - shift);
      column <= Math.floor(xLimit / pitch - shift);
      column++
    ) {
      apertures.push({ x: (column + shift) * pitch, y, radius });
    }
  }
  return apertures;
}

/** Screw offsets use the allocated U bottom; physical sheet Y starts after its clearance. */
export function plateMountingSlots(definition: DeviceDefinition): PlateSlot[] {
  const plate = definition.plate;
  if (!plate) return [];
  const clearance = (definition.heightU * U_MM - definition.heightMm) / 2;
  return [-1, 1].flatMap((side) =>
    definition.screwOffsetsMm.map((offset) => ({
      x: (side * plate.mountingCentersMm) / 2,
      y: offset - clearance,
      width: plate.slotWidthMm,
      height: plate.slotHeightMm,
    })),
  );
}

/** Inward top/bottom returns stop before the integral mounting flanges. */
export function plateFoldBoxes(definition: DeviceDefinition): PhysicalBox[] {
  const plate = definition.plate;
  if (!plate || plate.returnDepthMm === 0) return [];
  return [false, true].map((top) => ({
    id: `plate-return-${top ? 'top' : 'bottom'}`,
    name: `${top ? 'Top' : 'Bottom'} folded return`,
    position: [
      0,
      top ? definition.heightMm - plate.thicknessMm / 2 : plate.thicknessMm / 2,
      plate.returnDepthMm / 2,
    ],
    size: [definition.widthMm, plate.thicknessMm, plate.returnDepthMm],
  }));
}

export function validatePlateDefinition(definition: DeviceDefinition): string[] {
  const plate = definition.plate;
  if (!plate) return [];
  const issues: string[] = [];
  if (definition.parts.length || definition.ports.length)
    issues.push(
      'Blanking plates use sheet and fold geometry without equipment ports or extra compound parts.',
    );
  if (!['direct', 'bracket'].includes(definition.mounting))
    issues.push('Blanking plates require direct or bracket rack mounting.');
  if (Math.abs(definition.depthMm - plate.returnDepthMm) > 1e-6)
    issues.push(
      'Plate depth must equal the inward return depth; the front sheet extends outward from its mounting plane.',
    );
  if (plate.thicknessMm * 2 >= definition.heightMm)
    issues.push('Plate thickness leaves no space between its folded edges.');
  if (plate.slotWidthMm < plate.slotHeightMm)
    issues.push('Horizontal mounting-slot width must be at least its height.');
  if (!definition.screwOffsetsMm.length)
    issues.push('Plate mounting-slot heights must be specified.');
  if (
    plateMountingSlots(definition).some(
      (slot) =>
        Math.abs(slot.x) + slot.width / 2 >= definition.faceWidthMm / 2 ||
        Math.abs(slot.x) - slot.width / 2 <= definition.widthMm / 2 ||
        slot.y - slot.height / 2 <= 0 ||
        slot.y + slot.height / 2 >= definition.heightMm,
    )
  )
    issues.push(
      'Mounting slots must fit inside the integral flanges and the physical plate height.',
    );
  if (plate.style === 'perforated') {
    if (plate.edgeMarginMm <= 0 || plate.holeDiameterMm >= plate.holePitchMm)
      issues.push(
        'Perforations need a positive edge margin and a pitch greater than the hole diameter.',
      );
    else if (!plateApertures(definition).length)
      issues.push(
        `No valid perforation field fits, or it exceeds the ${MAX_PLATE_APERTURES}-hole geometry limit. Adjust margin, diameter, pitch or panel size.`,
      );
  }
  return issues;
}
