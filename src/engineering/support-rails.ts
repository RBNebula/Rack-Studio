import type { Device, Project } from '../model';
import { deviceRack, origin } from './space';
import { chassisBottomY, deviceSupportRailBoxes, railSpacingAt, uBottom, U_MM } from './geometry';

const EPS = 1e-6;
const round = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Fixed support rail assessment for one installed device. Failures (span outside a known range,
 * mass above a known rating, clearance, collisions) are placement issues in `validatePlacement`;
 * this reports the numbers and the advisories for what is unknown or not modelled.
 */
export interface SupportRailAssessment {
  /** Front-to-rear rack screw-plane spacing at the device's U, or null in a section gap. */
  spacingMm: number | null;
  /** `unverified` when either end of the rail range is unknown and the known end is satisfied. */
  span: 'within' | 'outside' | 'unverified';
  /** `unknown` when the rating or the equipment mass is unknown; never treated as zero. */
  load: 'within' | 'exceeded' | 'unknown';
  /** Equipment mass divided by the rail pair's rating, when both are known. */
  loadFraction: number | null;
  /** World Y of the flange top, equal to the chassis bottom. */
  bearingTopMm: number;
  /** How far the flange underside lies below the allocated U boundary (0 if within it). */
  belowAllocationMm: number;
  advisories: string[];
}

export function supportRailAssessment(
  project: Project,
  device: Device,
): SupportRailAssessment | null {
  const definition = project.definitions.find((d) => d.id === device.definitionId);
  const rail = definition?.supportRails;
  if (!definition || !rail) return null;
  const rack = deviceRack(project, device);
  const spacing = railSpacingAt(rack, device.startU);
  const spacingMm = Number.isFinite(spacing) ? spacing : null;
  const advisories: string[] = [];
  const outside =
    spacingMm !== null &&
    ((rail.spanMinMm !== null && spacingMm < rail.spanMinMm - EPS) ||
      (rail.spanMaxMm !== null && spacingMm > rail.spanMaxMm + EPS));
  const span = outside
    ? 'outside'
    : rail.spanMinMm === null || rail.spanMaxMm === null || spacingMm === null
      ? 'unverified'
      : 'within';
  if (span === 'unverified')
    advisories.push(
      rail.spanMinMm === null && rail.spanMaxMm === null
        ? `Fixed support rail front-to-rear range is unknown; fit to the ${spacingMm === null ? 'unknown' : `${round(spacingMm)} mm`} screw-plane spacing is unverified.`
        : `Fixed support rail ${rail.spanMinMm === null ? 'minimum' : 'maximum'} spacing is unknown; fit to the ${spacingMm === null ? 'unknown' : `${round(spacingMm)} mm`} screw-plane spacing is only partly verified.`,
    );
  const mass = definition.massKg,
    rating = rail.loadRatingKg;
  const loadFraction = mass !== null && rating !== null ? mass / rating : null;
  const load = loadFraction === null ? 'unknown' : mass! > rating! + EPS ? 'exceeded' : 'within';
  if (rating === null && mass === null)
    advisories.push(
      'Fixed support rail load rating and equipment mass are unknown; load is not checked.',
    );
  else if (rating === null)
    advisories.push(
      `Fixed support rail load rating is unknown; the ${mass} kg equipment mass is not checked against it.`,
    );
  else if (mass === null)
    advisories.push(
      `Equipment mass is unknown; the ${rating} kg fixed support rail load rating is not checked.`,
    );
  const bearingTopMm = chassisBottomY(project, device);
  const allocationBottom = origin(rack)[1] + uBottom(device.startU);
  const lowest = Math.min(
    bearingTopMm,
    ...deviceSupportRailBoxes(project, device).map((box) => box.min[1]),
  );
  const belowAllocationMm = Math.max(0, round(allocationBottom - lowest));
  if (belowAllocationMm > EPS)
    advisories.push(
      `The ${rail.thicknessMm} mm support rail flange extends ${belowAllocationMm} mm below the allocated U range${device.startU > 1 ? ` into U${device.startU - 1}` : ''}.`,
    );
  const top = origin(rack)[1] + uBottom(device.startU) + definition.heightU * U_MM;
  if (deviceSupportRailBoxes(project, device).some((box) => box.max[1] > top + EPS))
    advisories.push('The support rail vertical leg rises above the allocated U range.');
  if (rail.evidence !== 'verified')
    advisories.push(
      `Fixed support rail data is ${rail.evidence}; profile, span and rating need verification.`,
    );
  advisories.push(
    'Chassis rear tabs, rail slots and the screws are not modelled; only the rail solids and bearing level are.',
  );
  return { spacingMm, span, load, loadFraction, bearingTopMm, belowAllocationMm, advisories };
}
