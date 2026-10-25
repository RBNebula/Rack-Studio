import type { DeviceDefinition, PhysicalBox, ShelfConfiguration } from '../model';
import { lacingBarParts } from '../models/lacing-bar';

/** Editable example dimensions; these never establish a manufacturer specification. */
export function makeShelfConfiguration(definition: DeviceDefinition): ShelfConfiguration {
  const wall = Math.min(4, definition.widthMm / 4);
  return {
    usableWidthMm: definition.widthMm - 2 * wall,
    usableDepthMm: definition.depthMm,
    floorThicknessMm: Math.min(4, definition.heightMm / 4),
    wallThicknessMm: wall,
    supportMode: 'front-only',
    supports: [],
  };
}

export function validateShelfDefinition(definition: DeviceDefinition): string[] {
  const shelf = definition.mounting === 'shelf' ? definition.shelf : null;
  if (!shelf) return [];
  const issues: string[] = [];
  if (shelf.floorThicknessMm >= definition.heightMm)
    issues.push('Shelf floor thickness must be less than the physical shelf height.');
  if (2 * shelf.wallThicknessMm >= definition.widthMm)
    issues.push('Shelf walls leave no usable width.');
  if (shelf.usableWidthMm > definition.widthMm - 2 * shelf.wallThicknessMm + 1e-6)
    issues.push('Shelf usable width exceeds the space between its side walls.');
  if (shelf.usableDepthMm > definition.depthMm + 1e-6)
    issues.push('Shelf usable depth exceeds its overall depth.');
  if (shelf.supportMode === 'additional-supports' && !shelf.supports.length)
    issues.push('Additional shelf supports need explicit component dimensions and positions.');
  const ids = [...generatedShelfParts(definition), ...definition.parts, ...shelf.supports].map(
    (part) => part.id,
  );
  if (new Set(ids).size !== ids.length) issues.push('Shelf component IDs must be unique.');
  return issues;
}

/** Shelf-local solids; rack depth and mounting-face selection never resize a shelf. */
export function generatedShelfParts(definition: DeviceDefinition): PhysicalBox[] {
  const shelf = definition.mounting === 'shelf' ? definition.shelf : null;
  if (!shelf) return [];
  const { widthMm: width, heightMm: height, depthMm: depth } = definition;
  const { floorThicknessMm: floor, wallThicknessMm: wall } = shelf;
  if (floor >= height || 2 * wall >= width) return [];
  return [
    {
      id: 'shelf-floor',
      name: 'Parametric shelf floor',
      position: [0, floor / 2, depth / 2],
      size: [width, floor, depth],
    },
    ...[-1, 1].map((side): PhysicalBox => ({
      id: `shelf-wall-${side}`,
      name: `${side < 0 ? 'Left' : 'Right'} shelf wall`,
      position: [(side * (width - wall)) / 2, (height + floor) / 2, depth / 2],
      size: [wall, height - floor, depth],
    })),
  ];
}

export function definitionParts(definition: DeviceDefinition): PhysicalBox[] {
  const shelf = definition.mounting === 'shelf' ? definition.shelf : null;
  return [
    ...generatedShelfParts(definition),
    ...lacingBarParts(definition),
    ...definition.parts,
    ...(shelf?.supportMode === 'additional-supports' ? shelf.supports : []),
  ];
}
