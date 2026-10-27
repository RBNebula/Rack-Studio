import { z } from 'zod';

const finite = z.number().finite();
const nonnegative = finite.nonnegative();
const positive = finite.positive();
export const vectorSchema = z.tuple([finite, finite, finite]);
export type Vec3 = z.infer<typeof vectorSchema>;
export const evidenceSchema = z.enum(['example', 'user-entered', 'verified', 'unknown']);
export const portSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  connector: z.string().min(1),
  protocol: z.string().optional(),
  surface: z.enum(['front', 'rear', 'left', 'right', 'custom']),
  position: vectorSchema,
  direction: vectorSchema,
  multiple: z.boolean().default(false),
  widthMm: positive.optional(),
  heightMm: positive.optional(),
  rotationDeg: finite.optional(),
  visualColor: z.string().optional(),
  evidence: evidenceSchema.optional(),
  source: z.string().optional(),
});
export type Port = z.infer<typeof portSchema>;
export const boxSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: vectorSchema,
  size: z.tuple([positive, positive, positive]),
});
export type PhysicalBox = z.infer<typeof boxSchema>;
export const structuralMemberSchema = boxSchema.extend({
  profile: z.enum(['box', 'angle', 'channel']).default('box'),
  profileAxis: z.enum(['x', 'y', 'z']).default('y'),
  profileRotationQuarterTurns: z.number().int().min(0).max(3).default(0),
  wallMm: positive.nullable().default(null),
  evidence: evidenceSchema.default('unknown'),
  source: z.string().default(''),
});
export type StructuralMember = z.infer<typeof structuralMemberSchema>;
export const shelfSchema = z.object({
  usableWidthMm: positive,
  usableDepthMm: positive,
  floorThicknessMm: positive,
  wallThicknessMm: positive,
  supportMode: z.enum(['front-only', 'additional-supports']),
  supports: z.array(boxSchema),
});
export type ShelfConfiguration = z.infer<typeof shelfSchema>;
export const plateSchema = z.object({
  style: z.enum(['solid', 'perforated']),
  thicknessMm: positive,
  returnDepthMm: nonnegative,
  edgeMarginMm: nonnegative,
  holeDiameterMm: positive,
  holePitchMm: positive,
  mountingCentersMm: positive.default(465.1),
  slotWidthMm: positive.default(10),
  slotHeightMm: positive.default(6),
});
export type PlateConfiguration = z.infer<typeof plateSchema>;
/** Electrical draw of one powered equipment item; null means not yet known. */
export const powerDrawSchema = z.object({
  nominalW: nonnegative.nullable(),
  maxW: nonnegative.nullable(),
  evidence: evidenceSchema,
  source: z.string(),
});
export type PowerDraw = z.infer<typeof powerDrawSchema>;
/** A group of outlet ports on a power distributor sharing one current limit. */
export const powerBankSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  portIds: z.array(z.string().min(1)).min(1),
  maxCurrentA: positive,
  outletMaxCurrentA: positive.nullable().default(null),
  voltageV: positive,
  evidence: evidenceSchema,
  source: z.string(),
});
export type PowerBank = z.infer<typeof powerBankSchema>;
/**
 * Total output rating of a power distributor (UPS or PDU) across all of its banks, for example a
 * UPS rated 3000 VA / 2700 W. Each limit is null when not rated; at least one must be set.
 * `voltageV` converts the total load to amps for `maxCurrentA`.
 */
export const powerOutputLimitSchema = z.object({
  maxVA: positive.nullable().default(null),
  maxW: positive.nullable().default(null),
  maxCurrentA: positive.nullable().default(null),
  voltageV: positive,
  evidence: evidenceSchema,
  source: z.string(),
});
export type PowerOutputLimit = z.infer<typeof powerOutputLimitSchema>;
const base64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'Expected base64 data.');
/**
 * Display mesh tessellated from an imported STEP model, in device-local millimetres: x across
 * (+X shows on the left from the front), y up from the body bottom, z rearwards from the model's
 * front face. Positions are int16 steps of `quantumMm` about the centre of `boundsMm`. Placement
 * and collisions use the definition's box dimensions, never this mesh.
 */
export const meshAssetSchema = z.object({
  source: z.literal('step'),
  fileName: z.string(),
  boundsMm: z.object({ min: vectorSchema, max: vectorSchema }),
  quantumMm: positive,
  /** Where the mesh sits relative to the chassis datum (front ear plane or shelf setback). */
  offsetMm: vectorSchema,
  groups: z
    .array(
      z.object({
        color: z.string(),
        positions: base64,
        indices: base64,
        indexBytes: z.union([z.literal(2), z.literal(4)]),
      }),
    )
    .min(1),
  triangles: z.number().int().nonnegative(),
  omittedParts: z.number().int().nonnegative(),
});
export type MeshAsset = z.infer<typeof meshAssetSchema>;
export const definitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    manufacturer: z.string(),
    model: z.string(),
    category: z.string(),
    widthMm: positive,
    heightU: z.number().int().min(1).max(60),
    heightMm: positive,
    depthMm: nonnegative,
    faceWidthMm: positive,
    earThicknessMm: positive.nullable().default(null),
    /** Freestanding equipment only: how far behind the shelf's front plane the chassis sits. */
    shelfSetbackMm: nonnegative.optional(),
    mesh: meshAssetSchema.optional(),
    shelf: shelfSchema.nullable().default(null),
    plate: plateSchema.nullable().default(null),
    lacing: z.object({ barWidthMm: positive, barHeightMm: positive }).optional(),
    appearance: z.enum(['user-rack-pc', 'generic-switch-24']).nullable().default(null),
    mounting: z.enum(['direct', 'rails', 'shelf', 'freestanding', 'bracket', 'side', 'custom']),
    bodyMode: z.enum(['box', 'parts']).default('box'),
    color: z.string(),
    evidence: evidenceSchema,
    source: z.string(),
    massKg: nonnegative.nullable(),
    power: powerDrawSchema.optional(),
    powerBanks: z.array(powerBankSchema).optional(),
    powerOutputLimit: powerOutputLimitSchema.optional(),
    railMinMm: nonnegative.nullable(),
    railMaxMm: positive.nullable(),
    screwOffsetsMm: z.array(nonnegative),
    ports: z.array(portSchema),
    parts: z.array(boxSchema),
    frontImage: z.string().nullable(),
    rearImage: z.string().nullable(),
    faceFeatures: z
      .array(
        z.object({
          id: z.string(),
          kind: z.enum(['fan', 'grille']),
          surface: z.enum(['front', 'rear']),
          x: finite,
          y: finite,
          widthMm: positive,
          heightMm: positive,
        }),
      )
      .optional(),
  })
  .superRefine((definition, context) => {
    if (
      definition.lacing &&
      (definition.bodyMode !== 'parts' ||
        definition.mounting !== 'bracket' ||
        definition.plate ||
        definition.shelf ||
        definition.appearance ||
        definition.heightU !== 1 ||
        definition.heightMm >= 44.45 ||
        definition.lacing.barHeightMm > definition.heightMm ||
        definition.depthMm <= definition.lacing.barWidthMm ||
        definition.widthMm <= 2 * definition.lacing.barWidthMm ||
        definition.faceWidthMm <= definition.widthMm ||
        definition.screwOffsetsMm.length !== 1 ||
        definition.screwOffsetsMm[0] !== 22.225)
    )
      context.addIssue({
        code: 'custom',
        path: ['lacing'],
        message:
          'A lacing bar requires 1U, bracket mounting, parts-only geometry, one middle-hole screw at 22.225 mm, ears wider than its body, and a bar profile smaller than its height, width and reach.',
      });
    if (
      definition.appearance !== null &&
      (definition.bodyMode !== 'box' ||
        definition.plate !== null ||
        definition.shelf !== null ||
        !['direct', 'rails', 'bracket'].includes(definition.mounting))
    )
      context.addIssue({
        code: 'custom',
        path: ['appearance'],
        message:
          'The detailed equipment appearance requires a chassis box with rack ears (direct, rails or bracket). Choose generic appearance for parts-only, shelf or freestanding geometry.',
      });
    const portIds = new Set(definition.ports.map((p) => p.id));
    const bankIds = new Set<string>();
    const bankedPorts = new Set<string>();
    (definition.powerBanks ?? []).forEach((bank, index) => {
      if (bankIds.has(bank.id))
        context.addIssue({
          code: 'custom',
          path: ['powerBanks', index, 'id'],
          message: `Duplicate power bank id ${bank.id}.`,
        });
      bankIds.add(bank.id);
      for (const id of bank.portIds) {
        if (!portIds.has(id) || bankedPorts.has(id))
          context.addIssue({
            code: 'custom',
            path: ['powerBanks', index, 'portIds'],
            message: portIds.has(id)
              ? `Port ${id} belongs to more than one power bank.`
              : `Power bank ${bank.id} refers to missing port ${id}.`,
          });
        bankedPorts.add(id);
      }
    });
    const outputLimit = definition.powerOutputLimit;
    if (outputLimit) {
      if (
        outputLimit.maxVA === null &&
        outputLimit.maxW === null &&
        outputLimit.maxCurrentA === null
      )
        context.addIssue({
          code: 'custom',
          path: ['powerOutputLimit'],
          message: 'A total output limit needs at least one of maxVA, maxW or maxCurrentA.',
        });
      if (!definition.powerBanks?.length)
        context.addIssue({
          code: 'custom',
          path: ['powerOutputLimit'],
          message: 'A total output limit requires power banks.',
        });
    }
    if (definition.power?.nominalW != null && definition.power.maxW != null)
      if (definition.power.nominalW > definition.power.maxW)
        context.addIssue({
          code: 'custom',
          path: ['power', 'nominalW'],
          message: 'Nominal power draw cannot exceed maximum power draw.',
        });
    if (definition.depthMm === 0 && !definition.plate)
      context.addIssue({
        code: 'custom',
        path: ['depthMm'],
        message:
          'Chassis depth must be positive; a zero-depth sheet requires an explicit plate definition.',
      });
  });
export type DeviceDefinition = z.infer<typeof definitionSchema>;
export const depthSectionSchema = z.object({
  id: z.string(),
  startU: z.number().int().positive(),
  endU: z.number().int().positive(),
  overallDepthMm: positive,
  frontRailZMm: finite.default(0),
  rearRailZMm: positive,
});
export const rackSchema = z.object({
  originMm: vectorSchema.optional(),
  id: z.string(),
  name: z.string().min(1),
  heightU: z.number().int().min(1).max(60),
  outerWidthMm: positive,
  clearWidthMm: positive,
  railCentersMm: positive,
  frontInsetMm: nonnegative,
  frameMm: positive,
  railWidthMm: positive.nullable().default(null),
  railThicknessMm: positive.nullable().default(null),
  frameStyle: z.enum(['generic', 'explicit']).default('generic'),
  endPanels: z
    .object({ top: z.boolean(), base: z.boolean(), thicknessMm: positive })
    .nullable()
    .default(null),
  depthMeaning: z.enum(['unconfirmed', 'external', 'usable', 'rail-spacing']),
  fixedFace: z.enum(['front', 'rear', 'unconfirmed']),
  holeType: z.enum(['square', 'round', 'threaded', 'unconfirmed']),
  evidence: evidenceSchema,
  color: z.string(),
  sections: z.array(depthSectionSchema).min(1),
  members: z.array(structuralMemberSchema),
  showPanels: z.boolean(),
});
export type Rack = z.infer<typeof rackSchema>;
export const deviceSchema = z.object({
  rackId: z.string().optional(),
  rails: z
    .object({
      memberLengthMm: positive.max(10000),
      profileWidthMm: positive.max(100),
      profileHeightMm: positive.max(100),
      mountHeightMm: nonnegative.max(3000).optional(),
      chassisLeadMm: nonnegative.max(10000),
      extensionMm: nonnegative.max(10000),
      evidence: evidenceSchema,
    })
    .optional(),
  id: z.string(),
  definitionId: z.string(),
  name: z.string().min(1),
  startU: z.number().int().positive(),
  face: z.enum(['front', 'rear']),
  supportId: z.string().nullable(),
  installation: z.enum(['installed', 'installing']),
});
export type Device = z.infer<typeof deviceSchema>;
export const endpointSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('device'), deviceId: z.string(), portId: z.string() }),
  z.object({ kind: z.literal('external'), destinationId: z.string(), portId: z.string() }),
]);
export type Endpoint = z.infer<typeof endpointSchema>;
export const cableSchema = z.object({
  id: z.string().min(1),
  label: z.string().default(''),
  name: z.string(),
  source: endpointSchema,
  destination: endpointSchema,
  purpose: z.string(),
  type: z.string(),
  color: z.string(),
  diameterMm: positive,
  minBendRadiusMm: positive.nullable(),
  clearanceMm: nonnegative,
  waypoints: z.array(vectorSchema),
  guideLinks: z.array(z.object({ guideId: z.string(), reverse: z.boolean() })).optional(),
  followCableId: z.string().nullable().default(null),
  followStartPercent: nonnegative.max(100).default(15),
  followEndPercent: nonnegative.max(100).default(85),
  followOffsetMm: nonnegative.nullable().default(null),
  exitId: z.string().nullable(),
  supply: z.enum(['preterminated', 'bulk']),
  productId: z.string(),
  suppliedLengthMm: positive.nullable(),
  externalLengthMm: nonnegative.nullable(),
  serviceMm: nonnegative,
  terminationAMm: nonnegative,
  terminationBMm: nonnegative,
  otherMm: nonnegative,
  roundToMm: positive,
  manualOverrideMm: positive.nullable(),
  overrideReason: z.string(),
  status: z.enum(['planned', 'installed', 'tested']),
  notes: z.string(),
});
export type Cable = z.infer<typeof cableSchema>;
export const wiringGuideSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: z.literal('point'),
    position: vectorSchema,
    accessoryId: z.string().optional(),
  }),
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    kind: z.literal('line'),
    start: vectorSchema,
    end: vectorSchema,
    trayId: z.string().optional(),
  }),
]);
export type WiringGuide = z.infer<typeof wiringGuideSchema>;
export const cableLabel = (c: Pick<Cable, 'id' | 'label'>) => c.label || c.id;
export const exitSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  position: vectorSchema,
  size: z.tuple([positive, positive]),
  direction: vectorSchema,
  evidence: evidenceSchema,
});
export type ExitPoint = z.infer<typeof exitSchema>;
export const destinationSchema = z.object({
  routeIn3D: z.boolean().optional(),
  id: z.string(),
  name: z.string().min(1),
  location: z.string(),
  notes: z.string(),
  ports: z.array(portSchema),
  position: vectorSchema.nullable(),
});
export type Destination = z.infer<typeof destinationSchema>;
export const accessorySchema = boxSchema
  .extend({
    rotationDeg: vectorSchema.optional(),
    attachment: z
      .object({ kind: z.enum(['rack', 'device', 'accessory', 'member']), id: z.string() })
      .optional(),
    openingMm: positive.optional(),
    perforated: z.boolean().optional(),
    kind: z.enum(['tray', 'anchor', 'tie', 'obstruction']),
    parentId: z.string().nullable(),
    cableIds: z.array(z.string()),
    evidence: evidenceSchema,
  })
  .superRefine((a, ctx) => {
    if (
      a.perforated &&
      (a.kind !== 'tray' ||
        a.size[0] < 10 ||
        a.size[0] > 2000 ||
        a.size[1] < 3 ||
        a.size[1] > 500 ||
        a.size[2] < 40 ||
        a.size[2] > 2000)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['size'],
        message:
          'Perforated tray requires width 10–2000 mm, height 3–500 mm and cut length 40–2000 mm.',
      });
  });
export type Accessory = z.infer<typeof accessorySchema>;
export const loomSchema = z.object({
  guideIds: z.array(z.string()).optional(),
  id: z.string(),
  name: z.string().min(1),
  cableIds: z.array(z.string()).min(2),
  waypoints: z.array(vectorSchema),
  packingFactor: positive,
});
export type Loom = z.infer<typeof loomSchema>;
export const productSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: z.string(),
  color: z.string(),
  manufacturer: z.string(),
  partNumber: z.string(),
  reelLengthMm: positive,
  wastePerCutMm: nonnegative,
});
export type Product = z.infer<typeof productSchema>;
export const stockSchema = z.object({
  id: z.string(),
  productId: z.string(),
  remainingMm: nonnegative,
});
export const projectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string(),
  rack: rackSchema,
  additionalRacks: z.array(rackSchema).optional(),
  sharedMembers: z.array(structuralMemberSchema).optional(),
  measurements: z
    .array(z.object({ id: z.string(), name: z.string(), start: vectorSchema, end: vectorSchema }))
    .optional(),
  definitions: z.array(definitionSchema),
  devices: z.array(deviceSchema),
  cables: z.array(cableSchema),
  wiringGuides: z.array(wiringGuideSchema).optional(),
  exits: z.array(exitSchema),
  destinations: z.array(destinationSchema),
  accessories: z.array(accessorySchema),
  looms: z.array(loomSchema),
  products: z.array(productSchema),
  stock: z.array(stockSchema),
  settings: z.object({
    reservePercent: nonnegative,
    reserveFixedMm: nonnegative,
    contingencyPercent: nonnegative,
    cablePrefix: z.string(),
    scheduleColumns: z.array(z.string()),
    author: z.string(),
    notes: z.string(),
  }),
});
export type Project = z.infer<typeof projectSchema>;
export const uid = (prefix = 'id') => `${prefix}-${crypto.randomUUID()}`;
export const clone = <T>(value: T): T => structuredClone(value);
