import type { DeviceDefinition } from '../model';
import { portFootprint } from './ports';
export const componentPalette = [
  ['RJ45', 14, 12],
  ['SFP', 14, 9.5],
  ['USB-A', 12, 5],
  ['USB-C', 9, 4],
  ['HDMI', 14, 5],
  ['DisplayPort', 14, 5],
  ['VGA', 18, 9],
  ['PS/2', 9, 9],
  ['3.5mm', 7, 7],
  ['IEC-C14', 23, 29],
  ['IEC-C13', 23, 16],
  ['LC', 13, 8],
  ['SDI', 10, 10],
  ['DC', 8, 8],
  ['fan', 30, 30],
  ['grille', 50, 25],
] as const;
export function designerIssues(d: DeviceDefinition): string[] {
  const errors: string[] = [];
  if (d.widthMm >= 457.2)
    errors.push(
      'Chassis width must be less than 18 inches (457.2 mm). Rack clearance can impose a smaller limit.',
    );
  if (d.heightMm > d.heightU * 44.45) errors.push('Physical height exceeds allocated U.');
  const items = [
    ...d.ports.map((p) => ({
      id: p.id,
      x: p.position[0],
      y: p.position[1],
      widthMm: portFootprint(p)[0],
      heightMm: portFootprint(p)[1],
    })),
    ...(d.faceFeatures ?? []),
  ];
  for (const item of items)
    if (
      Math.abs(item.x) + item.widthMm / 2 > d.widthMm / 2 ||
      item.y - item.heightMm / 2 < 0 ||
      item.y + item.heightMm / 2 > d.heightMm
    )
      errors.push(`${item.id}: component extends beyond chassis face.`);
  return errors;
}
/** Fixed slot dimensions and pitch. Extending the tray adds complete slots at the far end. */
export function traySlots(width: number, length: number) {
  const slots: { x: number; z: number; width: number; length: number }[] = [];
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(length) ||
    width > 2000 ||
    length > 2000 ||
    width <= 0 ||
    length <= 0
  )
    return slots;
  for (let z = 20; z + 12 <= length - 8; z += 40)
    for (let x = -width / 2 + 18; x + 6 <= width / 2 - 8; x += 25)
      slots.push({ x, z, width: 12, length: 24 });
  return slots;
}
