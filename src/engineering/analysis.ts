import type { Cable, Project } from '../model';
import { cableLabel } from '../model';
import { routeCable } from './routing';
import { calculateCableLength, validatePreterminatedLength } from './lengths';
import { calculateProcurement } from './procurement';
import { endpointLabel, endpointPort } from './connectivity';
import { hasRackEars } from './geometry';
import { positionedExternalCable } from './external';
import { racks } from './space';

export function analyseCable(project: Project, cable: Cable) {
  const route = routeCable(project, cable);
  const external = [cable.source, cable.destination].some((e) => e.kind === 'external');
  const length = calculateCableLength({
    routedLengthMm: route.lengthMm,
    externalLengthMm:
      external && !positionedExternalCable(project, cable) ? cable.externalLengthMm : undefined,
    serviceLoopMm: cable.serviceMm,
    terminationAllowanceAMm: cable.supply === 'bulk' ? cable.terminationAMm : 0,
    terminationAllowanceBMm: cable.supply === 'bulk' ? cable.terminationBMm : 0,
    otherAllowances: [{ id: 'other', label: 'Other explicit allowance', lengthMm: cable.otherMm }],
    roundingIncrementMm: cable.supply === 'bulk' ? cable.roundToMm : 0,
    manualCutLengthMm: cable.supply === 'bulk' ? (cable.manualOverrideMm ?? undefined) : undefined,
    measurementsVerified:
      racks(project).every(
        (r) =>
          r.evidence === 'verified' &&
          r.railWidthMm !== null &&
          r.railThicknessMm !== null &&
          r.members.every((m) => m.evidence === 'verified'),
      ) &&
      project.rack.railWidthMm !== null &&
      project.rack.railThicknessMm !== null &&
      project.rack.members.every((member) => member.evidence === 'verified') &&
      project.devices.every((d) => {
        const definition = project.definitions.find((v) => v.id === d.definitionId);
        return (
          definition?.evidence === 'verified' &&
          (!d.rails || d.rails.evidence === 'verified') &&
          (!hasRackEars(definition) ||
            definition.earThicknessMm !== null ||
            definition.plate !== null)
        );
      }) &&
      [cable.source, cable.destination].every((endpoint) => {
        const evidence = endpointPort(project, endpoint)?.evidence;
        return evidence === undefined || evidence === 'verified';
      }),
  });
  const requiredMm = route.valid ? length.requiredLengthMm : null;
  const preterminated =
    cable.supply === 'preterminated' && cable.suppliedLengthMm !== null
      ? validatePreterminatedLength({
          suppliedLengthMm: cable.suppliedLengthMm,
          requiredLengthMm: requiredMm,
          knownSubtotalMm: length.knownSubtotalMm,
        })
      : null;
  const status = !route.valid
    ? 'Route invalid'
    : length.status === 'provisional'
      ? 'External length unknown'
      : cable.supply === 'preterminated' && cable.suppliedLengthMm === null
        ? 'Supplied length unknown'
        : preterminated?.status === 'insufficient'
          ? 'Insufficient length'
          : cable.manualOverrideMm !== null &&
              length.calculatedLengthMm !== null &&
              cable.manualOverrideMm < length.calculatedLengthMm
            ? 'Override too short'
            : !length.measurementsVerified
              ? 'Unverified model'
              : 'Calculated';
  return {
    cable,
    route,
    length,
    requiredMm,
    preterminated,
    status,
    source: endpointLabel(project, cable.source),
    destination: endpointLabel(project, cable.destination),
  };
}
export type CableAnalysis = ReturnType<typeof analyseCable>;
const cache = new WeakMap<Project, ReturnType<typeof analyseProjectUncached>>();
function analyseProjectUncached(project: Project) {
  const cables = project.cables.map((c) => analyseCable(project, c));
  const procurement = calculateProcurement({
    products: project.products,
    cuts: cables
      .filter((a) => a.cable.supply === 'bulk')
      .map((a) => ({
        id: a.cable.id,
        productId: a.cable.productId,
        lengthMm: a.status === 'Override too short' ? null : a.requiredMm,
      })),
    stock: project.stock,
    reserve: {
      fixedMm: project.settings.reserveFixedMm,
      reelPercentage: project.settings.reservePercent,
      projectContingencyPercentage: project.settings.contingencyPercent,
    },
  });
  return {
    cables,
    procurement,
    issues: cables.filter((c) => c.status !== 'Calculated' && c.status !== 'Unverified model'),
    knownRouteMm: cables.reduce((n, c) => n + c.route.lengthMm, 0),
  };
}
export function analyseProject(project: Project) {
  let result = cache.get(project);
  if (!result) {
    result = analyseProjectUncached(project);
    cache.set(project, result);
  }
  return result;
}

export const scheduleColumns: Record<string, string> = {
  id: 'Cable number',
  name: 'Cable name',
  source: 'Source · port',
  destination: 'Destination · port',
  purpose: 'Purpose',
  type: 'Cable type',
  color: 'Colour',
  supply: 'Supply type',
  exit: 'Rack exit',
  loom: 'Loom',
  route: 'Model route (mm)',
  external: 'Manual external (mm)',
  service: 'Service (mm)',
  terminationA: 'End A allowance (mm)',
  terminationB: 'End B allowance (mm)',
  terminationTotal: 'Termination total (mm)',
  required: 'Required (mm)',
  supplied: 'Supplied (mm)',
  slack: 'Excess (mm)',
  status: 'Validation',
  installation: 'Installation',
  notes: 'Notes',
};
export function scheduleValue(
  p: Project,
  a: CableAnalysis,
  column: string,
): string | number | null {
  const c = a.cable;
  const fields: Record<string, string | number | null> = {
    id: cableLabel(c),
    name: c.name,
    source: a.source,
    destination: a.destination,
    purpose: c.purpose,
    type: c.type,
    color: c.color,
    supply: c.supply,
    exit: p.exits.find((e) => e.id === c.exitId)?.name ?? '',
    loom: p.looms
      .filter((l) => l.cableIds.includes(c.id))
      .map((l) => l.name)
      .join('; '),
    route: Math.round(a.route.lengthMm * 100) / 100,
    external: positionedExternalCable(p, c)
      ? 0
      : [c.source, c.destination].some((e) => e.kind === 'external')
        ? c.externalLengthMm
        : '',
    service: c.serviceMm,
    terminationA: c.supply === 'bulk' ? c.terminationAMm : 0,
    terminationB: c.supply === 'bulk' ? c.terminationBMm : 0,
    terminationTotal: c.supply === 'bulk' ? c.terminationAMm + c.terminationBMm : 0,
    required: a.requiredMm === null ? null : Math.round(a.requiredMm * 100) / 100,
    supplied: c.suppliedLengthMm,
    slack: a.preterminated?.availableSlackMm ?? null,
    status: a.status,
    installation: c.status,
    notes: c.notes,
  };
  return fields[column] ?? null;
}
/** Quote all text and neutralise spreadsheet formula prefixes in user-controlled cells. */
export function csv(rows: readonly (readonly (string | number | null)[])[]): string {
  return (
    '\ufeff' +
    rows
      .map((row) =>
        row
          .map((value) => {
            if (value === null) return '"Unknown"';
            if (typeof value === 'number') return String(value);
            const text = /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(','),
      )
      .join('\r\n')
  );
}
export function scheduleCsv(p: Project): string {
  const cols = p.settings.scheduleColumns.filter((c) => scheduleColumns[c]);
  return csv([
    cols.map((c) => scheduleColumns[c]),
    ...analyseProject(p).cables.map((a) => cols.map((c) => scheduleValue(p, a, c))),
  ]);
}
export function cutListCsv(p: Project): string {
  const analysis = analyseProject(p);
  return csv([
    [
      'Cable ID',
      'Supply',
      'Product',
      'Source termination',
      'Destination termination',
      'Required cut (mm)',
      'Supplied assembly (mm)',
      'Allocated reel',
      'Validation',
    ],
    ...analysis.cables.map((a) => [
      cableLabel(a.cable),
      a.cable.supply,
      p.products.find((v) => v.id === a.cable.productId)?.name ?? a.cable.type,
      a.source,
      a.destination,
      a.cable.supply === 'bulk' ? a.requiredMm : null,
      a.cable.supply === 'preterminated' ? a.cable.suppliedLengthMm : null,
      analysis.procurement.products
        .flatMap((v) => v.allocatedReels)
        .find((r) => r.cuts.some((c) => c.id === a.cable.id))?.reelId ?? '',
      a.status,
    ]),
  ]);
}
export function procurementCsv(p: Project): string {
  return csv([
    [
      'Product',
      'Status',
      'Known requirement (mm)',
      'Aggregate lower bound (reels)',
      'Proven minimum NEW reels',
      'Feasible NEW reels',
      'Recommended NEW reels',
      'Existing stock (mm)',
      'Reserve target (mm)',
      'Reason',
    ],
    ...analyseProject(p).procurement.products.map((r) => [
      r.productName,
      r.status,
      r.knownCutLengthMm,
      r.aggregateLowerBoundReels,
      r.minimumFeasibleNewReels,
      r.feasibleNewReels,
      r.recommendedNewReels,
      p.stock.filter((s) => s.productId === r.productId).reduce((n, s) => n + s.remainingMm, 0),
      r.reserveTargetMm,
      r.recommendationReason,
    ]),
  ]);
}
