import type {
  Device,
  DeviceDefinition,
  Endpoint,
  PhysicalBox,
  Project,
  Rack,
  StructuralMember,
  Vec3,
} from '../model';
import { definitionParts, validateShelfDefinition } from './shelves';
import { plateFoldBoxes, validatePlateDefinition } from './plates';
import { genericRackFrameBoxes } from './rack-frame';
import {
  add as addPosition,
  deviceRack,
  origin,
  racks,
  boxesIntersect,
  pointToLocal,
} from './space';
import { accessoryBoxes } from './attachments';

/** Millimetres: x is horizontal (+x appears left in the front camera), y up, z rearwards. */
export const U_MM = 44.45;
const EPS = 1e-6;
// EIA universal 5/8–5/8–1/2 inch pitch, centred within each 1.75 inch U.
// https://www.nvent.com/en-us/hoffman/products/open-frame-rack-4-post-0
export const MOUNTING_HOLE_OFFSETS_MM = [6.35, 22.225, 38.1] as const;
export interface Obstacle {
  id: string;
  min: Vec3;
  max: Vec3;
  oriented?: { position: Vec3; rotationDeg: Vec3; size: Vec3 };
}

export function mmToScene(value: number): number;
export function mmToScene(value: Vec3): Vec3;
export function mmToScene(value: number | Vec3): number | Vec3 {
  return typeof value === 'number' ? value / 1000 : (value.map((v) => v / 1000) as Vec3);
}
export function sceneToMm(value: number): number;
export function sceneToMm(value: Vec3): Vec3;
export function sceneToMm(value: number | Vec3): number | Vec3 {
  return typeof value === 'number' ? value * 1000 : (value.map((v) => v * 1000) as Vec3);
}
export const uBottom = (u: number): number => (u - 1) * U_MM;
/** Hole index is zero based: 0, 1, 2. */
export function mountingHoleY(u: number, index: number): number {
  if (!Number.isInteger(u) || u < 1 || !Number.isInteger(index) || index < 0 || index > 2) {
    throw new RangeError('Mounting holes require U >= 1 and a hole index of 0, 1 or 2.');
  }
  return uBottom(u) + MOUNTING_HOLE_OFFSETS_MM[index];
}

export function validateRack(rack: Rack): string[] {
  const issues: string[] = [];
  if (!Number.isInteger(rack.heightU) || rack.heightU < 1)
    issues.push('Rack height must be a positive whole number of U.');
  for (const key of ['outerWidthMm', 'clearWidthMm', 'railCentersMm', 'frameMm'] as const) {
    if (!Number.isFinite(rack[key]) || rack[key] <= 0)
      issues.push(`${key} must be a positive finite dimension.`);
  }
  if (!Number.isFinite(rack.frontInsetMm) || rack.frontInsetMm < 0)
    issues.push('Front inset must be finite and nonnegative.');
  const railWidth = effectiveRailWidthMm(rack);
  const railThickness = effectiveRailThicknessMm(rack);
  if (!Number.isFinite(railWidth) || railWidth <= 0)
    issues.push('Rail width must be a positive finite dimension.');
  if (!Number.isFinite(railThickness) || railThickness <= 0)
    issues.push('Rail thickness must be a positive finite dimension.');
  if (rack.clearWidthMm >= rack.outerWidthMm)
    issues.push('Clear opening must be narrower than the rack exterior.');
  if (rack.railCentersMm <= rack.clearWidthMm || rack.railCentersMm >= rack.outerWidthMm) {
    issues.push('Rail centres must lie outside the clear opening and inside the exterior width.');
  }
  if (rack.railWidthMm !== null && rack.railCentersMm + railWidth > rack.outerWidthMm + EPS)
    issues.push('Mounting rails extend outside the rack exterior width.');
  if (rack.railWidthMm !== null && rack.railCentersMm - railWidth < rack.clearWidthMm - EPS)
    issues.push('Mounting rails intrude into the configured clear opening.');
  const sections = [...rack.sections].sort((a, b) => a.startU - b.startU || a.endU - b.endU);
  let next = 1;
  if (!sections.length) issues.push('At least one depth section is required.');
  for (const section of sections) {
    if (
      !Number.isInteger(section.startU) ||
      !Number.isInteger(section.endU) ||
      section.startU < 1 ||
      section.endU < section.startU ||
      section.endU > rack.heightU
    ) {
      issues.push(`Depth section ${section.id} has an invalid U range.`);
    }
    if (section.startU !== next)
      issues.push(
        `Depth sections must cover every U exactly once; expected U${next} before ${section.id}.`,
      );
    next = section.endU + 1;
    const rearExternal = section.overallDepthMm - rack.frontInsetMm;
    const frameMargin = rack.frameStyle === 'explicit' ? 0 : rack.frameMm;
    if (!Number.isFinite(section.overallDepthMm) || section.overallDepthMm <= frameMargin * 2) {
      issues.push(`Depth section ${section.id} has no usable depth inside the exterior frame.`);
    }
    if (
      !Number.isFinite(section.frontRailZMm) ||
      section.frontRailZMm < -rack.frontInsetMm + frameMargin - EPS ||
      section.frontRailZMm + railThickness > rearExternal - frameMargin + EPS
    ) {
      issues.push(`Front rail for ${section.id} must lie inside the front and rear frame.`);
    }
    if (
      !Number.isFinite(section.rearRailZMm) ||
      section.rearRailZMm <= section.frontRailZMm ||
      section.rearRailZMm - railThickness < -rack.frontInsetMm + frameMargin - EPS ||
      section.rearRailZMm > rearExternal - frameMargin + EPS
    ) {
      issues.push(
        `Rear rail for ${section.id} must be behind the front rail and inside the rear frame.${rack.depthMeaning === 'external' ? '' : ' Adjust the illustrative exterior frame separately from the screw-plane spacing.'}`,
      );
    }
    if (section.rearRailZMm - section.frontRailZMm < railThickness * 2 - EPS)
      issues.push(`Front and rear rails overlap in depth section ${section.id}.`);
  }
  if (sections.length && next !== rack.heightU + 1)
    issues.push('Depth sections must finish at the top U of the rack.');
  if (
    rack.fixedFace === 'front' &&
    sections.some((s) => Math.abs(s.frontRailZMm - sections[0].frontRailZMm) > EPS)
  ) {
    issues.push(
      'A fixed front mounting face requires the same front rail position in every depth section.',
    );
  }
  if (
    rack.fixedFace === 'rear' &&
    sections.some((s) => Math.abs(s.rearRailZMm - sections[0].rearRailZMm) > EPS)
  ) {
    issues.push(
      'A fixed rear mounting face requires the same rear rail position in every depth section.',
    );
  }
  for (const member of rack.members) issues.push(...structuralMemberIssues(member));
  return [...new Set(issues)];
}

/** Evidence advisories are separate from geometric consistency failures. */
export function rackSpecificationIssues(rack: Rack): string[] {
  const issues: string[] = [];
  if (rack.depthMeaning !== 'external') {
    issues.push(
      'Exterior frame dimensions are illustrative: screw-plane spacing does not establish enclosure depth or clearance beyond the rails. Configure and verify the exterior envelope separately.',
    );
  }
  if (rack.evidence !== 'verified') {
    issues.push(
      'Rack dimensions and generic frame members are unverified; a rack name does not identify a measured manufacturer specification.',
    );
  }
  if (rack.railWidthMm === null || rack.railThicknessMm === null)
    issues.push(
      'Mounting rail dimensions are unspecified; legacy previews use half the generic frame thickness until rail width and thickness are entered independently.',
    );
  if (
    rack.railWidthMm === null &&
    (rack.railCentersMm - effectiveRailWidthMm(rack) < rack.clearWidthMm - EPS ||
      rack.railCentersMm + effectiveRailWidthMm(rack) > rack.outerWidthMm + EPS)
  )
    issues.push(
      'The legacy rail preview conflicts with the clear opening or exterior width. Enter a measured rail width and check the frame dimensions before treating the fit as verified.',
    );
  if (rack.members.some((member) => member.evidence !== 'verified'))
    issues.push('Additional structural members contain unverified dimensions or profile details.');
  if (rack.fixedFace === 'unconfirmed')
    issues.push('The fixed mounting face has not been confirmed.');
  return issues;
}

/** A gap is deliberately NaN, never a silently borrowed neighbouring depth. */
export function frontRailAt(rack: Rack, u: number): number {
  const found = rack.sections.filter((s) => u >= s.startU && u <= s.endU);
  return found.length === 1 ? found[0].frontRailZMm : Number.NaN;
}
export function rearRailAt(rack: Rack, u: number): number {
  const found = rack.sections.filter((s) => u >= s.startU && u <= s.endU);
  return found.length === 1 ? found[0].rearRailZMm : Number.NaN;
}
export const railSpacingAt = (rack: Rack, u: number): number =>
  rearRailAt(rack, u) - frontRailAt(rack, u);
/** Null preserves older projects' illustrative geometry without claiming measured rails. */
export const effectiveRailWidthMm = (rack: Rack): number => rack.railWidthMm ?? rack.frameMm / 2;
export const effectiveRailThicknessMm = (rack: Rack): number =>
  rack.railThicknessMm ?? rack.frameMm / 2;
const definitionFor = (project: Project, device: Device): DeviceDefinition | undefined =>
  project.definitions.find((d) => d.id === device.definitionId);
const boxFromCenter = (id: string, position: Vec3, size: Vec3): Obstacle => ({
  id,
  min: position.map((v, i) => v - size[i] / 2) as Vec3,
  max: position.map((v, i) => v + size[i] / 2) as Vec3,
});

function bodyBottom(project: Project, device: Device, seen = new Set<string>()): number {
  const definition = definitionFor(project, device);
  if (!definition) return uBottom(device.startU);
  if (definition.mounting === 'freestanding' && device.supportId && !seen.has(device.id)) {
    const support = project.devices.find((d) => d.id === device.supportId);
    if (support && !seen.has(support.id)) {
      const supportDefinition = definitionFor(project, support);
      if (supportDefinition) {
        const nextSeen = new Set(seen).add(device.id);
        const base = bodyBottom(project, support, nextSeen);
        if (supportDefinition.mounting === 'shelf' && supportDefinition.shelf)
          return base + supportDefinition.shelf.floorThicknessMm;
        // A shelf's solid floor is represented as a thin, horizontal part.
        const floors = definitionParts(supportDefinition).filter(
          (p) =>
            p.size[1] <= 12 && p.size[0] >= definition.widthMm && p.size[2] >= definition.depthMm,
        );
        if (floors.length)
          return base + Math.max(...floors.map((p) => p.position[1] + p.size[1] / 2));
        return base + supportDefinition.heightMm;
      }
    }
  }
  return (
    origin(deviceRack(project, device))[1] +
    uBottom(device.startU) +
    (definition.heightU * U_MM - definition.heightMm) / 2
  );
}

export function rackMountingPlane(project: Project, device: Device): number {
  if (definitionFor(project, device)?.mounting === 'freestanding' && device.supportId) {
    const support = project.devices.find((d) => d.id === device.supportId);
    if (support && support.id !== device.id) return rackMountingPlane(project, support);
  }
  const rack = deviceRack(project, device);
  return (
    origin(rack)[2] +
    (device.face === 'rear' ? rearRailAt(rack, device.startU) : frontRailAt(rack, device.startU))
  );
}

/** Moving chassis datum. Rack posts and outer rail brackets retain their fixed datum. */
export function mountingPlane(project: Project, device: Device): number {
  const definition = definitionFor(project, device);
  const setback =
    definition?.mounting === 'freestanding' && device.supportId
      ? (definition.shelfSetbackMm ?? 0)
      : 0;
  return (
    rackMountingPlane(project, device) +
    (device.face === 'rear' ? 1 : -1) * ((device.rails?.extensionMm ?? 0) - setback)
  );
}

export function deviceRailBoxes(project: Project, device: Device): Obstacle[] {
  const rail = device.rails,
    definition = definitionFor(project, device);
  if (!rail || !definition) return [];
  const sign = device.face === 'rear' ? -1 : 1,
    plane = rackMountingPlane(project, device);
  const span = railSpacingAt(deviceRack(project, device), device.startU);
  if (!Number.isFinite(span)) return [];
  const bottom = bodyBottom(project, device),
    height = rail.profileHeightMm,
    w = rail.profileWidthMm;
  const boxes: Obstacle[] = [];
  for (const side of [-1, 1]) {
    const stages = [
      {
        name: 'outer',
        x: definition.widthMm / 2 + w * 0.75,
        width: w * 0.5,
        start: 0,
        length: span,
      },
      {
        name: 'middle',
        x: definition.widthMm / 2 + w * 0.45,
        width: w * 0.2,
        start: rail.chassisLeadMm - rail.extensionMm / 2,
        length: rail.memberLengthMm,
      },
      {
        name: 'inner',
        x: definition.widthMm / 2 + w * 0.15,
        width: w * 0.3,
        start: rail.chassisLeadMm - rail.extensionMm,
        length: rail.memberLengthMm,
      },
    ];
    for (const stage of stages)
      boxes.push(
        boxFromCenter(
          `rail:${device.id}:${side}:${stage.name}`,
          [
            origin(deviceRack(project, device))[0] + sign * side * stage.x,
            bottom + (rail.mountHeightMm ?? definition.heightMm / 2),
            plane + sign * (stage.start + stage.length / 2),
          ],
          [stage.width, height, stage.length],
        ),
      );
    for (const [index, z] of [0, span].entries()) {
      const edge = definition.widthMm / 2 + w,
        hole = deviceRack(project, device).railCentersMm / 2;
      boxes.push(
        boxFromCenter(
          `rail:${device.id}:${side}:${index ? 'far' : 'near'}-bracket`,
          [
            origin(deviceRack(project, device))[0] + (sign * side * (edge + hole)) / 2,
            bottom + (rail.mountHeightMm ?? definition.heightMm / 2),
            // Near plate bears on the inside of its post, leaving the outside
            // face clear for the device ear. Far plate bears on the outer face.
            plane +
              sign * (z + (index ? 1 : effectiveRailThicknessMm(deviceRack(project, device)) + 1)),
          ],
          [Math.abs(hole - edge) + 2, height, 2],
        ),
      );
    }
  }
  return boxes;
}

export function deviceRailIssues(project: Project, device: Device): string[] {
  const r = device.rails,
    d = definitionFor(project, device);
  if (!r || !d) return [];
  const issues: string[] = [];
  if (
    d.plate ||
    d.shelf ||
    d.bodyMode !== 'box' ||
    !['direct', 'rails', 'bracket'].includes(d.mounting)
  )
    issues.push(
      'This rail assembly requires a rack chassis; shelf-supported and plate models need a separate support design.',
    );
  if (d.widthMm + 2 * r.profileWidthMm > deviceRack(project, device).clearWidthMm)
    issues.push('Chassis and side rails exceed the rack clear opening.');
  if (r.profileHeightMm > d.heightMm) issues.push('Rail profile exceeds chassis height.');
  const mountHeight = r.mountHeightMm ?? d.heightMm / 2;
  if (mountHeight - r.profileHeightMm / 2 < 0 || mountHeight + r.profileHeightMm / 2 > d.heightMm)
    issues.push('Rail profile lies outside the chassis height.');
  const middleStart = r.chassisLeadMm - r.extensionMm / 2,
    innerStart = r.chassisLeadMm - r.extensionMm;
  const span = railSpacingAt(deviceRack(project, device), device.startU);
  if (
    Math.min(middleStart + r.memberLengthMm, span) - Math.max(middleStart, 0) <= 0 ||
    r.memberLengthMm - r.extensionMm / 2 <= 0 ||
    innerStart + r.memberLengthMm <= middleStart
  )
    issues.push(
      'Telescopic members lose overlap at this extension. Increase member length or reduce pull-out.',
    );
  for (let u = device.startU; u < device.startU + d.heightU; u++)
    if (
      frontRailAt(deviceRack(project, device), u) !==
        frontRailAt(deviceRack(project, device), device.startU) ||
      rearRailAt(deviceRack(project, device), u) !==
        rearRailAt(deviceRack(project, device), device.startU)
    )
      issues.push('A rail assembly cannot span a change of front/rear post planes.');
  if (d.supportRails)
    issues.push(
      'Sliding rails cannot be fitted to equipment carried on its fixed support rails. Remove the sliding rail assembly.',
    );
  return issues;
}

/** World Y of the chassis bottom: the bearing level for shelves and fixed support rails. */
export const chassisBottomY = (project: Project, device: Device): number =>
  bodyBottom(project, device);

/**
 * Fixed L-section support rails of the device's definition, one per side, as real solids.
 * Each rail runs between the inner faces of the front and rear posts at the device's U position,
 * whatever face the device is mounted on. In device-local millimetres (x outward from the chassis
 * side, z inward from the mounting face) the vertical leg occupies x [w/2, w/2 + t] and the
 * flange x [w/2 + t - flange, w/2]; the flange top is the chassis bottom, so the chassis keeps
 * the height its ears set. End tabs (thickness t, leg height) bear on the inside of each post and
 * reach the post's outer edge where the screws pass; their outline is illustrative.
 */
export function deviceSupportRailBoxes(project: Project, device: Device): Obstacle[] {
  const definition = definitionFor(project, device);
  const rail = definition?.supportRails;
  if (!definition || !rail || definition.mounting !== 'rails') return [];
  const rack = deviceRack(project, device);
  const span = railSpacingAt(rack, device.startU);
  if (!Number.isFinite(span)) return [];
  const sign = device.face === 'rear' ? -1 : 1,
    plane = rackMountingPlane(project, device),
    x0 = origin(rack)[0],
    post = effectiveRailThicknessMm(rack),
    bottom = bodyBottom(project, device),
    t = rail.thicknessMm,
    side0 = definition.widthMm / 2,
    tabOuter = rack.railCentersMm / 2 + effectiveRailWidthMm(rack) / 2;
  const legY: [number, number] = [bottom - t, bottom - t + rail.legHeightMm];
  const box = (
    id: string,
    side: number,
    x: [number, number],
    y: [number, number],
    z: [number, number],
  ): Obstacle => {
    const wx = x.map((v) => x0 + sign * side * v),
      wz = z.map((v) => plane + sign * v);
    return {
      id: `support-rail:${device.id}:${side < 0 ? 'left' : 'right'}:${id}`,
      min: [Math.min(...wx), y[0], Math.min(...wz)],
      max: [Math.max(...wx), y[1], Math.max(...wz)],
    };
  };
  const boxes: Obstacle[] = [];
  for (const side of [-1, 1]) {
    boxes.push(box('leg', side, [side0, side0 + t], legY, [post, span - post]));
    if (rail.flangeWidthMm > t)
      boxes.push(
        box(
          'flange',
          side,
          [side0 + t - rail.flangeWidthMm, side0],
          [bottom - t, bottom],
          [post, span - post],
        ),
      );
    if (tabOuter > side0 + t) {
      boxes.push(box('near-tab', side, [side0 + t, tabOuter], legY, [post, post + t]));
      boxes.push(box('far-tab', side, [side0 + t, tabOuter], legY, [span - post - t, span - post]));
    }
  }
  return boxes;
}

/** Placement failures caused by fixed support rails. Unknown data is advisory, not a failure. */
export function deviceSupportRailIssues(project: Project, device: Device): string[] {
  const definition = definitionFor(project, device);
  const rail = definition?.supportRails;
  if (!definition || !rail) return [];
  const issues: string[] = [];
  const rack = deviceRack(project, device);
  if (definition.widthMm + 2 * rail.thicknessMm > rack.clearWidthMm + EPS)
    issues.push('Chassis and fixed support rail legs exceed the rack clear opening.');
  for (let u = device.startU; u < device.startU + definition.heightU; u++)
    if (
      frontRailAt(rack, u) !== frontRailAt(rack, device.startU) ||
      rearRailAt(rack, u) !== rearRailAt(rack, device.startU)
    )
      issues.push('Fixed support rails cannot span a change of front/rear post planes.');
  const span = railSpacingAt(rack, device.startU);
  if (
    Number.isFinite(span) &&
    ((rail.spanMinMm !== null && span < rail.spanMinMm - EPS) ||
      (rail.spanMaxMm !== null && span > rail.spanMaxMm + EPS))
  )
    issues.push(
      `Rack screw-plane spacing ${round(span)} mm is outside the fixed support rail range ${rail.spanMinMm ?? 'unknown'}–${rail.spanMaxMm ?? 'unknown'} mm.`,
    );
  const boxes = deviceSupportRailBoxes(project, device);
  if (boxes.some((b) => b.min[1] < origin(rack)[1] - EPS))
    issues.push('Fixed support rail extends below the bottom of the rack U volume.');
  if (boxes.some((b) => b.max[1] > origin(rack)[1] + rack.heightU * U_MM + EPS))
    issues.push('Fixed support rail extends above the top of the rack U volume.');
  if (
    definition.massKg !== null &&
    rail.loadRatingKg !== null &&
    definition.massKg > rail.loadRatingKg + EPS
  )
    issues.push(
      `Equipment mass ${definition.massKg} kg exceeds the fixed support rail load rating of ${rail.loadRatingKg} kg.`,
    );
  return issues;
}
const round = (value: number): number => Math.round(value * 1000) / 1000;

function localToWorld(project: Project, device: Device, position: Vec3): Vec3 {
  const sign = device.face === 'rear' ? -1 : 1;
  return [
    origin(deviceRack(project, device))[0] + sign * position[0],
    bodyBottom(project, device) + position[1],
    mountingPlane(project, device) + sign * position[2],
  ];
}

export function devicePosition(project: Project, device: Device): Vec3 {
  const definition = definitionFor(project, device);
  return localToWorld(project, device, [
    0,
    (definition?.heightMm ?? 0) / 2,
    (definition?.depthMm ?? 0) / 2,
  ]);
}

/** Bearing chassis and custom parts, excluding mounting ears and front plate. */
export function deviceChassisBoxes(project: Project, device: Device): Obstacle[] {
  const definition = definitionFor(project, device);
  if (!definition) return [];
  const boxes: Obstacle[] = [];
  const parts = definitionParts(definition);
  if (definition.plate) {
    boxes.push(
      boxFromCenter(
        `device:${device.id}:plate-sheet`,
        localToWorld(project, device, [
          0,
          definition.heightMm / 2,
          -definition.plate.thicknessMm / 2,
        ]),
        [definition.widthMm, definition.heightMm, definition.plate.thicknessMm],
      ),
    );
    for (const part of plateFoldBoxes(definition))
      boxes.push(
        boxFromCenter(
          `device:${device.id}:part:${part.id}`,
          localToWorld(project, device, part.position),
          part.size,
        ),
      );
  } else if (
    definition.bodyMode !== 'parts' &&
    (definition.mounting !== 'shelf' || parts.length === 0)
  ) {
    boxes.push(
      boxFromCenter(`device:${device.id}:body`, devicePosition(project, device), [
        definition.widthMm,
        definition.heightMm,
        definition.depthMm,
      ]),
    );
  }
  for (const part of parts) {
    boxes.push(
      boxFromCenter(
        `device:${device.id}:part:${part.id}`,
        localToWorld(project, device, part.position),
        part.size,
      ),
    );
  }
  return boxes;
}

export const hasRackEars = (definition: DeviceDefinition): boolean =>
  ['direct', 'rails', 'shelf', 'bracket'].includes(definition.mounting);

/** Unknown thickness uses an explicitly illustrative 2 mm preview, not a measured fact. */
export const effectiveEarThicknessMm = (definition: DeviceDefinition): number =>
  definition.plate?.thicknessMm ?? definition.earThicknessMm ?? 2;

/** The ear rear bearing face contacts the rack screw plane exactly, on either face. */
export function deviceEarBoxes(project: Project, device: Device): Obstacle[] {
  const definition = definitionFor(project, device);
  if (!definition || !hasRackEars(definition)) return [];
  const width = (definition.faceWidthMm - definition.widthMm) / 2;
  if (width <= 0) return [];
  const t = effectiveEarThicknessMm(definition);
  return [-1, 1].map((side) =>
    boxFromCenter(
      `device:${device.id}:ear:${side < 0 ? 'left' : 'right'}`,
      localToWorld(project, device, [
        side * (definition.widthMm / 2 + width / 2),
        definition.heightMm / 2,
        -t / 2,
      ]),
      [width, definition.heightMm, t],
    ),
  );
}

/** All rendered physical solids also participate in placement and cable clearance. */
export function deviceBoxes(project: Project, device: Device): Obstacle[] {
  const definition = definitionFor(project, device);
  if (!definition) return [];
  const boxes = [...deviceChassisBoxes(project, device), ...deviceEarBoxes(project, device)];
  if (
    hasRackEars(definition) &&
    !definition.plate &&
    definition.mounting !== 'shelf' &&
    definition.bodyMode !== 'parts'
  ) {
    const t = effectiveEarThicknessMm(definition);
    boxes.push(
      boxFromCenter(
        `device:${device.id}:fascia`,
        localToWorld(project, device, [0, definition.heightMm / 2, -t / 2]),
        [definition.widthMm, definition.heightMm, t],
      ),
    );
  }
  return boxes;
}

export function deviceBounds(project: Project, device: Device): { min: Vec3; max: Vec3 } {
  const boxes = deviceBoxes(project, device);
  if (!boxes.length) {
    const point = devicePosition(project, device);
    return { min: point, max: [...point] };
  }
  return {
    min: [0, 1, 2].map((axis) => Math.min(...boxes.map((b) => b.min[axis]))) as Vec3,
    max: [0, 1, 2].map((axis) => Math.max(...boxes.map((b) => b.max[axis]))) as Vec3,
  };
}

export function portWorld(project: Project, endpoint: Endpoint): Vec3 | null {
  if (endpoint.kind === 'device') {
    const device = project.devices.find((d) => d.id === endpoint.deviceId);
    const port =
      device && definitionFor(project, device)?.ports.find((p) => p.id === endpoint.portId);
    if (!device || !port) return null;
    const point = localToWorld(project, device, port.position);
    return point.every(Number.isFinite) ? point : null;
  }
  const destination = project.destinations.find((d) => d.id === endpoint.destinationId);
  const port = destination?.ports.find((p) => p.id === endpoint.portId);
  return destination?.position && port
    ? (destination.position.map((v, i) => v + port.position[i]) as Vec3)
    : null;
}

/** Outward connector direction, including the 180-degree rear mounting transform. */
export function portDirectionWorld(project: Project, endpoint: Endpoint): Vec3 | null {
  if (endpoint.kind === 'device') {
    const device = project.devices.find((d) => d.id === endpoint.deviceId);
    const port =
      device && definitionFor(project, device)?.ports.find((p) => p.id === endpoint.portId);
    if (!device || !port) return null;
    const sign = device.face === 'rear' ? -1 : 1;
    return [port.direction[0] * sign, port.direction[1], port.direction[2] * sign];
  }
  return (
    project.destinations
      .find((d) => d.id === endpoint.destinationId)
      ?.ports.find((p) => p.id === endpoint.portId)?.direction ?? null
  );
}

/** Cross-section coordinates use the remaining world axes in ascending XYZ order. */
export function structuralMemberCrossAxes(member: StructuralMember): [number, number] {
  const along = { x: 0, y: 1, z: 2 }[member.profileAxis];
  return [0, 1, 2].filter((axis) => axis !== along) as [number, number];
}

export function structuralMemberIssues(member: StructuralMember): string[] {
  if (member.profile === 'box') return [];
  const axes = structuralMemberCrossAxes(member);
  return member.wallMm === null ||
    !Number.isFinite(member.wallMm) ||
    member.wallMm <= 0 ||
    member.wallMm * 2 >= Math.min(...axes.map((axis) => member.size[axis]))
    ? [
        `Structural member ${member.id} requires a positive wall thickness smaller than half both profile dimensions.`,
      ]
    : [];
}

/**
 * Open profiles are physical wall plates, not filled envelope boxes. At turn 0 an
 * angle occupies the negative sides of both cross-section axes; a channel also
 * occupies the positive first-axis side. A quarter turn maps -first to -second.
 */
export function structuralMemberBoxes(member: StructuralMember): Obstacle[] {
  const id = `rack:member:${member.id}`;
  if (member.profile === 'box') return [worldBox(id, member)];
  if (structuralMemberIssues(member).length || member.wallMm === null) return [];
  const axes = structuralMemberCrossAxes(member),
    thickness = member.wallMm;
  const sides =
    member.profile === 'angle'
      ? [
          [-1, 0],
          [0, -1],
        ]
      : [
          [-1, 0],
          [1, 0],
          [0, -1],
        ];
  return sides.map((side, index) => {
    let [a, b] = side;
    for (let turn = 0; turn < member.profileRotationQuarterTurns; turn++) [a, b] = [-b, a];
    const crossAxis = a === 0 ? 1 : 0,
      worldAxis = axes[crossAxis],
      direction = a === 0 ? b : a;
    const size: Vec3 = [...member.size],
      position: Vec3 = [...member.position];
    size[worldAxis] = thickness;
    position[worldAxis] += (direction * (member.size[worldAxis] - thickness)) / 2;
    return boxFromCenter(`${id}:wall:${index}`, position, size);
  });
}

/** Independent rails plus an optional illustrative frame and explicit structural members. */
export function rackObstacles(project: Project, rack: Rack): Obstacle[] {
  const railWidth = effectiveRailWidthMm(rack),
    railThickness = effectiveRailThicknessMm(rack);
  const boxes: Obstacle[] = genericRackFrameBoxes(rack);
  for (const section of rack.sections) {
    const y0 = uBottom(section.startU),
      y1 = section.endU * U_MM;
    for (const side of [-1, 1])
      for (const [label, z] of [
        ['front', section.frontRailZMm],
        ['rear', section.rearRailZMm],
      ] as const)
        boxes.push(
          boxFromCenter(
            `rack:${section.id}:${side}:${label}:rail`,
            [
              (side * rack.railCentersMm) / 2,
              (y0 + y1) / 2,
              z + (label === 'front' ? railThickness / 2 : -railThickness / 2),
            ],
            [railWidth, y1 - y0, railThickness],
          ),
        );
  }
  for (const member of rack.members) boxes.push(...structuralMemberBoxes(member));
  return boxes.map((b) => ({
    ...b,
    id: rack.id === project.rack.id ? b.id : `rack:${rack.id}:${b.id}`,
    min: addPosition(b.min, origin(rack)),
    max: addPosition(b.max, origin(rack)),
  }));
}
export function allObstacles(project: Project): Obstacle[] {
  return [
    ...racks(project).flatMap((r) => rackObstacles(project, r)),
    ...(project.sharedMembers ?? []).flatMap((m) =>
      structuralMemberBoxes(m).map((b) => ({ ...b, id: `shared:${b.id}` })),
    ),
    ...project.devices.flatMap((d) => [
      ...deviceBoxes(project, d),
      ...deviceRailBoxes(project, d),
      ...deviceSupportRailBoxes(project, d),
    ]),
    ...project.accessories.flatMap((a) => accessoryBoxes(project, a)),
  ];
}
const intersects = boxesIntersect;
const worldBox = (id: string, box: PhysicalBox): Obstacle =>
  boxFromCenter(id, box.position, box.size);

export function validatePlacement(project: Project, device: Device, ignoreId?: string): string[] {
  const definition = definitionFor(project, device);
  if (!definition) return ['Device definition is missing.'];
  const issues: string[] = [
    ...deviceRailIssues(project, device),
    ...deviceSupportRailIssues(project, device),
    ...validateShelfDefinition(definition),
    ...validatePlateDefinition(definition),
  ];
  const rack = deviceRack(project, device);
  const offset = origin(rack);
  const boxes = deviceBoxes(project, device),
    bounds = deviceBounds(project, device);
  // The installed (seated) pose is always inside the exterior envelope. Only sliding service
  // travel may carry the chassis out of the rack, and only in its extended pose.
  const seatedBounds = device.rails?.extensionMm
    ? deviceBounds(project, { ...device, rails: { ...device.rails, extensionMm: 0 } })
    : bounds;
  const sweptBoxes = boxes.map((box) => {
    const dz = (device.face === 'rear' ? -1 : 1) * (device.rails?.extensionMm ?? 0);
    return {
      ...box,
      min: [box.min[0], box.min[1], Math.min(box.min[2], box.min[2] + dz)] as Vec3,
      max: [box.max[0], box.max[1], Math.max(box.max[2], box.max[2] + dz)] as Vec3,
    };
  });
  if (!definition.plate && definition.bodyMode === 'parts' && !definitionParts(definition).length)
    issues.push(
      'The parts-only body has no solid parts; its physical collision envelope is undefined.',
    );
  if (
    !Number.isInteger(device.startU) ||
    device.startU < 1 ||
    device.startU + definition.heightU - 1 > rack.heightU
  )
    issues.push('Allocated U range is outside the rack.');
  if (bounds.min[1] < offset[1] - EPS || bounds.max[1] > offset[1] + rack.heightU * U_MM + EPS)
    issues.push('Physical device height extends outside the rack U volume.');
  if (definition.heightMm > definition.heightU * U_MM + EPS)
    issues.push('Chassis height exceeds its allocated U height.');
  if (definition.widthMm > rack.clearWidthMm + EPS)
    issues.push('Chassis width exceeds the clear opening.');
  if (definition.faceWidthMm > rack.outerWidthMm + EPS)
    issues.push('Faceplate width exceeds the rack exterior.');
  const covered = rack.sections.filter(
    (s) =>
      bounds.max[1] > offset[1] + uBottom(s.startU) + EPS &&
      bounds.min[1] < offset[1] + s.endU * U_MM - EPS,
  );
  for (let u = device.startU; u < device.startU + definition.heightU; u++) {
    if (!Number.isFinite(rearRailAt(rack, u)) || !Number.isFinite(frontRailAt(rack, u)))
      issues.push(`U${u} does not have exactly one depth section.`);
  }
  for (const section of covered) {
    if (
      seatedBounds.min[2] < offset[2] - rack.frontInsetMm - EPS ||
      seatedBounds.max[2] >
        offset[2] +
          section.overallDepthMm -
          rack.frontInsetMm -
          (rack.frameStyle === 'explicit' ? 0 : rack.frameMm) +
          EPS
    ) {
      issues.push(`Physical depth exceeds the usable envelope in depth section ${section.id}.`);
    }
    const facePlane =
      offset[2] + (device.face === 'rear' ? section.rearRailZMm : section.frontRailZMm);
    if (Math.abs(facePlane - rackMountingPlane(project, device)) > EPS)
      issues.push(
        `${device.face === 'rear' ? 'Rear' : 'Front'}-mounted equipment spans a change in ${device.face} mounting plane.`,
      );
    // Fixed support rails carry their own spacing range (checked in deviceSupportRailIssues).
    if (definition.mounting === 'rails' && !device.rails && !definition.supportRails) {
      if (definition.railMinMm === null || definition.railMaxMm === null)
        issues.push(
          'Rail mounting requires an explicit compatible minimum and maximum rail spacing.',
        );
      else if (
        definition.railMinMm > definition.railMaxMm ||
        section.rearRailZMm - section.frontRailZMm < definition.railMinMm - EPS ||
        section.rearRailZMm - section.frontRailZMm > definition.railMaxMm + EPS
      ) {
        issues.push(`Rail spacing in ${section.id} is outside the device rail adjustment range.`);
      }
    }
  }
  if (['direct', 'rails', 'shelf', 'bracket'].includes(definition.mounting)) {
    if (definition.plate && Math.abs(definition.plate.mountingCentersMm - rack.railCentersMm) > 0.5)
      issues.push('Plate slot centres do not match the rack mounting-hole columns.');
    const ears = deviceEarBoxes(project, device);
    if (
      ears.length !== 2 ||
      ![-1, 1].every((side) =>
        ears.some(
          (ear) =>
            offset[0] + (side * rack.railCentersMm) / 2 >= ear.min[0] - EPS &&
            offset[0] + (side * rack.railCentersMm) / 2 <= ear.max[0] + EPS,
        ),
      )
    )
      issues.push(
        'Rack ears must extend from the chassis across both mounting-hole columns. Check chassis and faceplate widths.',
      );
    if (!definition.screwOffsetsMm.length) issues.push('Mounting-hole offsets are unspecified.');
    for (const offset of definition.screwOffsetsMm) {
      const modulo = ((offset % U_MM) + U_MM) % U_MM;
      if (
        offset > definition.heightU * U_MM ||
        !MOUNTING_HOLE_OFFSETS_MM.some((hole) => Math.abs(hole - modulo) <= 0.5)
      ) {
        issues.push(
          `Mounting-hole offset ${offset} mm does not align with the generic U hole pattern.`,
        );
      }
    }
    if (rack.holeType === 'unconfirmed')
      issues.push(
        'Rack hole type is unconfirmed; mounting hardware compatibility needs verification.',
      );
  }
  if (definition.mounting === 'side' || definition.mounting === 'custom')
    issues.push('Side or custom mounting requires an explicitly verified support design.');
  if (definition.mounting === 'freestanding') {
    const support = project.devices.find((d) => d.id === device.supportId && d.id !== device.id);
    const supportDefinition = support && definitionFor(project, support);
    if (!support || !supportDefinition || supportDefinition.mounting !== 'shelf')
      issues.push('Freestanding equipment requires a shelf support.');
    else {
      const shelfBoxes = deviceChassisBoxes(project, support);
      const shelfBounds = supportDefinition.shelf
        ? boxFromCenter(
            'shelf-bearing',
            localToWorld(project, support, [
              0,
              supportDefinition.shelf.floorThicknessMm / 2,
              supportDefinition.shelf.usableDepthMm / 2,
            ]),
            [
              supportDefinition.shelf.usableWidthMm,
              supportDefinition.shelf.floorThicknessMm,
              supportDefinition.shelf.usableDepthMm,
            ],
          )
        : {
            min: [0, 1, 2].map((axis) =>
              Math.min(...shelfBoxes.map((box) => box.min[axis])),
            ) as Vec3,
            max: [0, 1, 2].map((axis) =>
              Math.max(...shelfBoxes.map((box) => box.max[axis])),
            ) as Vec3,
          };
      // Bearing is checked against the chassis footprint; a nonbearing lid can
      // overhang while remaining part of every physical collision check.
      const bearing = boxFromCenter('bearing', devicePosition(project, device), [
        definition.widthMm,
        definition.heightMm,
        definition.depthMm,
      ]);
      if (
        bearing.min[0] < shelfBounds.min[0] - EPS ||
        bearing.max[0] > shelfBounds.max[0] + EPS ||
        bearing.min[2] < shelfBounds.min[2] - EPS ||
        bearing.max[2] > shelfBounds.max[2] + EPS
      ) {
        issues.push('Freestanding chassis extends beyond its shelf support footprint.');
      }
      if (support.face !== device.face)
        issues.push('Freestanding equipment and its shelf must use the same mounting face.');
    }
  }
  for (const other of project.devices) {
    if (other.id === device.id || other.id === ignoreId) continue;
    if (sweptBoxes.some((a) => deviceBoxes(project, other).some((b) => intersects(a, b))))
      issues.push(`Physical collision with ${other.name}.`);
  }
  for (const obstacle of allObstacles(project)) {
    if (obstacle.id.startsWith('device:')) continue;
    if (obstacle.id.startsWith(`rail:${device.id}:`)) continue;
    if (sweptBoxes.some((box) => intersects(box, obstacle)))
      issues.push(`Physical collision with ${obstacle.id}.`);
  }
  // The device's own chassis against its own fixed support rails is already checked above
  // (the flange top and leg side are tangent contact, not penetration).
  for (const ownRail of [
    ...deviceRailBoxes(project, device),
    ...deviceSupportRailBoxes(project, device),
  ])
    for (const obstacle of allObstacles(project)) {
      if (
        obstacle.id.startsWith(`rail:${device.id}:`) ||
        obstacle.id.startsWith(`support-rail:${device.id}:`) ||
        obstacle.id.startsWith(`device:${device.id}:`)
      )
        continue;
      if (intersects(ownRail, obstacle)) issues.push(`Rail collision with ${obstacle.id}.`);
    }
  return [...new Set(issues)];
}

/** Slab intersection against an AABB expanded by cable radius plus clearance. */
export function segmentHitsBox(a: Vec3, b: Vec3, box: Obstacle, expansionMm = 0): boolean {
  if (box.oriented) {
    const pose = box.oriented;
    return segmentHitsBox(
      pointToLocal(pose, a),
      pointToLocal(pose, b),
      {
        id: box.id,
        min: pose.size.map((v) => -v / 2) as Vec3,
        max: pose.size.map((v) => v / 2) as Vec3,
      },
      expansionMm,
    );
  }
  let low = 0,
    high = 1;
  for (let axis = 0; axis < 3; axis++) {
    const delta = b[axis] - a[axis],
      min = box.min[axis] - expansionMm,
      max = box.max[axis] + expansionMm;
    if (Math.abs(delta) <= EPS) {
      if (a[axis] < min || a[axis] > max) return false;
    } else {
      const t1 = (min - a[axis]) / delta,
        t2 = (max - a[axis]) / delta;
      low = Math.max(low, Math.min(t1, t2));
      high = Math.min(high, Math.max(t1, t2));
      if (low > high) return false;
    }
  }
  return low <= high;
}
