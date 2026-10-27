import type { Device, DeviceDefinition, Project } from '../model';
import { csv } from './analysis';
import { analysePower } from './power';
import type {
  DevicePowerInfo,
  PowerAnalysis,
  PowerBankResult,
  PowerIssue,
  PowerLoad,
  PowerOutputLimitResult,
  PowerStatus,
} from './power';
import { deviceRack, racks } from './space';

/**
 * The power and weights document. Every figure comes from `analysePower`; this module only
 * selects, labels and formats it. A `null` cell is unknown and is shown as "Unknown", never 0.
 * A string starting with "≥" is the known part of an incomplete load (a lower bound).
 */
export type ReportCell = string | number | null;
export const NOT_APPLICABLE = '—';
export const NOT_CONNECTED = 'Not connected';
/** Conversion used for the heat-output estimate. */
export const BTU_PER_HOUR_PER_WATT = 3.412;
export const POWER_STATUS_TEXT: Record<PowerStatus, string> = {
  ok: 'OK',
  warning: 'Warning',
  over: 'Over limit',
  incomplete: 'Incomplete',
};
export const EQUIPMENT_COLUMNS = [
  'Device',
  'Model',
  'Position',
  'Mass (kg)',
  'Mass evidence',
  'Nominal draw (W)',
  'Max draw (W)',
  'Max inlet current (A)',
  'Power evidence',
  'Fed from',
] as const;
export const BANK_COLUMNS = [
  'Distributor',
  'Bank',
  'Voltage (V)',
  'Bank limit (A)',
  'Outlet limit (A)',
  'Nominal (A)',
  'Nominal (W)',
  'Max (A)',
  'Max (W)',
  'Utilisation (%)',
  'Status',
  'Consumers (outlets; max load)',
  'Unknown draw',
  'Rating evidence',
] as const;
/** Columns of a distributor's total output row (`DeviceDefinition.powerOutputLimit`). */
export const OUTPUT_LIMIT_COLUMNS = [
  'Distributor',
  'Limit (VA)',
  'Limit (W)',
  'Limit (A)',
  'Voltage (V)',
  'Nominal (W)',
  'Max (W)',
  'Max (A)',
  'Utilisation (%)',
  'Utilisation by limit',
  'Status',
  'Unknown draw',
  'Rating evidence',
] as const;
/** A total output limit that is not rated, e.g. a UPS rated in VA and W but not in amps. */
export const NOT_RATED = 'Not rated';

export interface PowerReportEquipmentRow {
  deviceId: string;
  cells: ReportCell[];
}
export interface PowerReportBankRow {
  bankId: string;
  status: PowerStatus;
  cells: ReportCell[];
}
/** One PDU or UPS with its banks. A distributor fed from another distributor follows it. */
export interface PowerReportDistributor {
  deviceId: string;
  name: string;
  model: string;
  position: string;
  fedFrom: string;
  /** Number of distributors between this one and an unfed (root) distributor. */
  level: number;
  inputNominal: string;
  inputMax: string;
  banks: PowerReportBankRow[];
  /** Total output across every bank against the rated limit; null when the model has none. */
  outputLimit: PowerReportOutputLimitRow | null;
}
export interface PowerReportOutputLimitRow {
  status: PowerStatus;
  cells: ReportCell[];
}
export interface PowerReportTotal {
  label: string;
  value: string;
  detail: string;
}
export interface PowerReportIssue {
  severity: 'Error' | 'Warning' | 'Notice';
  message: string;
}
export interface PowerReport {
  projectName: string;
  revision: number;
  racks: string;
  /** Set when any listed value has example, user-entered or unknown evidence. */
  provisionalNote: string | null;
  summary: { devices: string; mass: string; maxDraw: string; issues: string };
  equipment: { columns: string[]; rows: PowerReportEquipmentRow[] };
  bankColumns: string[];
  outputLimitColumns: string[];
  distributors: PowerReportDistributor[];
  totals: PowerReportTotal[];
  issues: PowerReportIssue[];
  notes: string[];
}

const round = (n: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
/** en-GB grouped number, e.g. 1,415 or 6.15. */
export const formatNumber = (n: number, digits = 2, fixed = false) =>
  round(n, digits).toLocaleString('en-GB', {
    minimumFractionDigits: fixed ? digits : 0,
    maximumFractionDigits: digits,
  });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Display text of a cell, as the on-screen and printed document shows it. */
export function reportCellText(cell: ReportCell): string {
  if (cell === null) return 'Unknown';
  if (typeof cell === 'number') return formatNumber(cell);
  return cell;
}
/** A table cell for a summed value: a number when complete, "≥ n" when partly known, else null. */
function loadCell(value: number, complete: boolean, digits: number): ReportCell {
  if (complete) return round(value, digits);
  return value > 0 ? `≥ ${formatNumber(value, digits)}` : null;
}
/** A summed value with its unit, e.g. "1,415 W" or "≥ 1,415 W (incomplete: 2 devices unknown)". */
function loadText(
  value: number,
  complete: boolean,
  unit: string,
  digits: number,
  missing: number | null,
  short = false,
): string {
  if (complete) return `${formatNumber(value, digits)} ${unit}`;
  const why = missing === null ? 'incomplete' : `incomplete: ${plural(missing, 'device')} unknown`;
  if (value > 0)
    return short
      ? `≥ ${formatNumber(value, digits)} ${unit}`
      : `≥ ${formatNumber(value, digits)} ${unit} (${why})`;
  return short ? 'Unknown' : `Unknown (${why})`;
}
const wattsText = (l: PowerLoad, missing: number | null = null, short = false) =>
  loadText(l.knownW, l.complete, 'W', 1, missing, short);
const names = (list: { name: string }[]) => list.map((d) => d.name).join(', ');

function positionText(p: Project, device: Device, definition: DeviceDefinition | undefined) {
  const height = definition?.heightU ?? 1;
  const u = height > 1 ? `U${device.startU}–${device.startU + height - 1}` : `U${device.startU}`;
  const support = device.supportId
    ? p.devices.find((d) => d.id === device.supportId)?.name
    : undefined;
  return [
    deviceRack(p, device).name,
    u,
    device.face === 'rear' ? 'Rear' : 'Front',
    support ? `on ${support}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Build the power and weights document from the power analysis. Pure and deterministic. */
export function buildPowerReport(
  project: Project,
  analysis: PowerAnalysis = analysePower(project),
): PowerReport {
  const definitions = new Map(project.definitions.map((d) => [d.id, d]));
  const devices = new Map(project.devices.map((d) => [d.id, d]));
  const infos = new Map(analysis.devices.map((d) => [d.deviceId, d]));
  const distributorById = new Map(analysis.distributors.map((d) => [d.deviceId, d]));
  const bankOf = (distributorId: string, bankId: string): PowerBankResult | undefined =>
    distributorById.get(distributorId)?.banks.find((b) => b.bankId === bankId);
  const outletName = (bank: PowerBankResult | undefined, portId: string) =>
    bank?.outlets.find((o) => o.portId === portId)?.portName ?? portId;

  const fedFrom = (info: DevicePowerInfo): string => {
    if (!info.powered) return NOT_APPLICABLE;
    if (!info.feeds.length) return NOT_CONNECTED;
    const text = info.feeds
      .map((f) => {
        const bank = bankOf(f.distributorDeviceId, f.bankId);
        return [
          distributorById.get(f.distributorDeviceId)?.name ?? f.distributorDeviceId,
          bank?.name ?? f.bankId,
          outletName(bank, f.outletPortId),
        ].join(' · ');
      })
      .join('; ');
    return `${text}${info.redundantFeed ? ' (redundant feed)' : ''}${info.inCycle ? ' (in a distribution cycle)' : ''}`;
  };
  /** Maximum inlet current at each feeding bank's voltage, from the device's whole input load. */
  const inletCurrent = (info: DevicePowerInfo): ReportCell => {
    if (!info.powered || !info.feeds.length) return NOT_APPLICABLE;
    const voltages = [
      ...new Set(
        info.feeds.flatMap((f) => {
          const v = bankOf(f.distributorDeviceId, f.bankId)?.voltageV;
          return v === undefined ? [] : [v];
        }),
      ),
    ];
    const cells = voltages.map((v) => ({
      v,
      cell: loadCell(info.input.max.knownW / v, info.input.max.complete, 2),
    }));
    if (cells.length === 1) return cells[0].cell;
    return cells.map(({ v, cell }) => `${reportCellText(cell)} at ${v} V`).join('; ');
  };

  // Equipment, physically ordered: rack by rack, top of the rack first.
  const rackOrder = racks(project).map((r) => r.id);
  const ordered = [...analysis.devices].sort((a, b) => {
    const da = devices.get(a.deviceId),
      db = devices.get(b.deviceId);
    if (!da || !db) return 0;
    const ra = rackOrder.indexOf(deviceRack(project, da).id),
      rb = rackOrder.indexOf(deviceRack(project, db).id);
    return ra - rb || db.startU - da.startU || a.name.localeCompare(b.name);
  });
  const equipmentRows: PowerReportEquipmentRow[] = ordered.map((info) => {
    const device = devices.get(info.deviceId);
    const definition = device ? definitions.get(device.definitionId) : undefined;
    const drawCell = (w: number | null): ReportCell =>
      !info.powered ? NOT_APPLICABLE : w === null ? null : round(w, 1);
    return {
      deviceId: info.deviceId,
      cells: [
        info.name,
        info.definitionName,
        device ? positionText(project, device, definition) : NOT_APPLICABLE,
        info.massKg === null ? null : round(info.massKg, 2),
        info.massKg === null ? NOT_APPLICABLE : (definition?.evidence ?? 'unknown'),
        drawCell(info.nominalW),
        drawCell(info.maxW),
        inletCurrent(info),
        !info.powered ? NOT_APPLICABLE : (info.powerEvidence ?? 'No power record'),
        fedFrom(info),
      ],
    };
  });

  const unknownDraw = (
    unknownConsumers: PowerBankResult['unknownConsumers'],
    externalOutlets: PowerBankResult['externalOutlets'],
    outletBank: (portId: string) => PowerBankResult | undefined,
  ) =>
    [
      ...unknownConsumers.map((u) => `${u.name}: ${u.reason}`),
      ...externalOutlets.map(
        (e) =>
          `${outletName(outletBank(e.portId), e.portId)} feeds external ${project.destinations.find((x) => x.id === e.destinationId)?.name ?? e.destinationId}: draw unknown`,
      ),
    ].join('; ') || 'None';
  const outputLimitRow = (
    name: string,
    limit: PowerOutputLimitResult,
    banks: PowerBankResult[],
  ): PowerReportOutputLimitRow => {
    const { max, nominal, utilisationByLimit } = limit;
    const byLimit = (['VA', 'W', 'A'] as const)
      .filter((k) => utilisationByLimit[k] !== null)
      .map((k) => {
        const cell = loadCell(utilisationByLimit[k]! * 100, max.complete, 1);
        return `${k} ${cell === null ? 'Unknown' : `${reportCellText(cell)} %`}`;
      })
      .join('; ');
    return {
      status: limit.status,
      cells: [
        name,
        limit.maxVA ?? NOT_RATED,
        limit.maxW ?? NOT_RATED,
        limit.maxCurrentA ?? NOT_RATED,
        limit.voltageV,
        loadCell(nominal.knownW, nominal.complete, 1),
        loadCell(max.knownW, max.complete, 1),
        loadCell(max.knownA, max.complete, 2),
        loadCell(limit.utilisation * 100, max.complete, 1),
        byLimit,
        POWER_STATUS_TEXT[limit.status],
        unknownDraw(limit.unknownConsumers, limit.externalOutlets, (portId) =>
          banks.find((b) => b.outlets.some((o) => o.portId === portId)),
        ),
        limit.source ? `${limit.evidence} (${limit.source})` : limit.evidence,
      ],
    };
  };

  // Distributors, upstream first so that a UPS precedes the PDUs it feeds.
  const level = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const upstream = (infos.get(id)?.feeds ?? [])
      .map((f) => f.distributorDeviceId)
      .filter((d) => distributorById.has(d) && d !== id);
    return upstream.length ? 1 + Math.max(...upstream.map((d) => level(d, new Set(seen)))) : 0;
  };
  const distributors: PowerReportDistributor[] = analysis.distributors
    .map((d, index) => ({ d, index, level: level(d.deviceId) }))
    .sort((a, b) => a.level - b.level || a.index - b.index)
    .map(({ d, level }) => {
      const device = devices.get(d.deviceId);
      const definition = device ? definitions.get(device.definitionId) : undefined;
      const info = infos.get(d.deviceId);
      return {
        deviceId: d.deviceId,
        name: d.name,
        model: definition?.name ?? d.definitionId,
        position: device ? positionText(project, device, definition) : NOT_APPLICABLE,
        fedFrom: info ? fedFrom(info) : NOT_CONNECTED,
        level,
        inputNominal: wattsText(d.input.nominal),
        inputMax: wattsText(d.input.max),
        banks: d.banks.map((bank) => {
          const consumers = bank.consumers.map((c) => {
            const outlets = c.outletPortIds.map((id) => outletName(bank, id)).join(', ');
            const max = wattsText(c.input.max, null, true);
            return `${c.name} (${outlets}; ${max}${c.redundantFeed ? '; redundant feed' : ''})`;
          });
          return {
            bankId: bank.bankId,
            status: bank.status,
            cells: [
              d.name,
              bank.name,
              bank.voltageV,
              bank.maxCurrentA,
              bank.outletMaxCurrentA ?? 'None rated',
              loadCell(bank.nominal.knownA, bank.nominal.complete, 2),
              loadCell(bank.nominal.knownW, bank.nominal.complete, 1),
              loadCell(bank.max.knownA, bank.max.complete, 2),
              loadCell(bank.max.knownW, bank.max.complete, 1),
              loadCell(bank.utilisation * 100, bank.max.complete, 1),
              POWER_STATUS_TEXT[bank.status],
              consumers.join('; ') || 'None',
              unknownDraw(bank.unknownConsumers, bank.externalOutlets, () => bank),
              bank.source ? `${bank.evidence} (${bank.source})` : bank.evidence,
            ],
          };
        }),
        outputLimit: d.outputLimit ? outputLimitRow(d.name, d.outputLimit, d.banks) : null,
      };
    });

  // Totals.
  const { totals } = analysis;
  const powered = analysis.devices.filter((d) => d.powered);
  const missingNominal = totals.power.missing.filter((m) => m.missingNominal);
  const missingMax = totals.power.missing.filter((m) => m.missingMax);
  const unconnected = powered.filter((d) => !d.feeds.length);
  const redundant = analysis.devices.filter((d) => d.redundantFeed);
  const heat = (l: PowerLoad) =>
    loadText(l.knownW * BTU_PER_HOUR_PER_WATT, l.complete, 'BTU/h', 0, null, true);
  const count = (severity: PowerIssue['severity']) =>
    analysis.issues.filter((i) => i.severity === severity).length;
  const issueSummary = `${plural(count('error'), 'error')} · ${plural(count('warning'), 'warning')} · ${plural(count('notice'), 'notice')}`;
  const totalRows: PowerReportTotal[] = [
    {
      label: 'Placed devices',
      value: String(totals.deviceCount),
      detail: `${powered.length} powered, including ${plural(analysis.distributors.length, 'power distributor')}; ${totals.deviceCount - powered.length} without power (for example blanking plates).`,
    },
    {
      label: 'Total mass',
      value: loadText(
        totals.mass.knownKg,
        totals.mass.complete,
        'kg',
        2,
        totals.mass.missing.length,
      ),
      detail: `${totals.mass.missing.length ? `Unknown mass: ${names(totals.mass.missing)}. ` : 'Every device has a recorded mass. '}Equipment only: the rack frame, cables and fixings are not included.`,
    },
    {
      label: 'Total nominal draw',
      value: wattsText(totals.power.nominal, missingNominal.length),
      detail: `Own draw of ${plural(totals.power.poweredDeviceCount, 'powered device')}, each counted once.${missingNominal.length ? ` Unknown nominal draw: ${names(missingNominal)}.` : ''}`,
    },
    {
      label: 'Total maximum draw',
      value: wattsText(totals.power.max, missingMax.length),
      detail: `Own draw of ${plural(totals.power.poweredDeviceCount, 'powered device')}, each counted once.${missingMax.length ? ` Unknown maximum draw: ${names(missingMax)}.` : ''}`,
    },
    {
      label: 'Estimated heat output',
      value: `${heat(totals.power.nominal)} nominal`,
      detail: `${heat(totals.power.max)} at maximum draw. Estimate: assumes all recorded draw becomes heat inside the rack (1 W ≈ ${BTU_PER_HOUR_PER_WATT} BTU/h).`,
    },
    {
      label: 'Powered devices not connected',
      value: String(unconnected.length),
      detail: unconnected.length
        ? `${names(unconnected)}. Not fed from any modelled bank; an unfed PDU or UPS is supplied from outside the model.`
        : 'Every powered device is fed from a modelled bank.',
    },
    {
      label: 'Devices with redundant feeds',
      value: String(redundant.length),
      detail: redundant.length
        ? `${names(redundant)}. Full draw counted against each feeding bank and outlet; once in totals.`
        : 'No device is fed from more than one outlet.',
    },
    ...distributors.map((d) => ({
      label: `Input load · ${d.name}`,
      value: `${d.inputMax} max`,
      detail: `${d.inputNominal} nominal. Fed from: ${d.fedFrom}. Its own draw plus every device it supplies, each once: what its upstream supply (for example a UPS) must provide.`,
    })),
    ...(rackOrder.length > 1
      ? racks(project).map((rack) => {
          const here = analysis.devices.filter((d) => {
            const device = devices.get(d.deviceId);
            return device && deviceRack(project, device).id === rack.id;
          });
          const missing = here.filter((d) => d.massKg === null);
          return {
            label: `Mass · ${rack.name}`,
            value: loadText(
              here.reduce((n, d) => n + (d.massKg ?? 0), 0),
              missing.length === 0,
              'kg',
              2,
              missing.length,
            ),
            detail: `${plural(here.length, 'device')} in this rack.${missing.length ? ` Unknown mass: ${names(missing)}.` : ''}`,
          };
        })
      : []),
    {
      label: 'Power issues',
      value: String(analysis.issues.length),
      detail: issueSummary,
    },
  ];

  const order = { error: 0, warning: 1, notice: 2 } as const;
  const issues = analysis.issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => order[a.issue.severity] - order[b.issue.severity] || a.index - b.index)
    .map(({ issue }) => ({
      severity: (issue.severity === 'error'
        ? 'Error'
        : issue.severity === 'warning'
          ? 'Warning'
          : 'Notice') as PowerReportIssue['severity'],
      message: issue.message,
    }));

  // Evidence: count placed devices and banks whose values are not verified.
  const provisionalDevices = equipmentRows.filter((r) =>
    [r.cells[4], r.cells[8]].some(
      (e) => typeof e === 'string' && e !== NOT_APPLICABLE && e !== 'verified',
    ),
  ).length;
  const allBanks = analysis.distributors.flatMap((d) => d.banks);
  const provisionalBanks = allBanks.filter((b) => b.evidence !== 'verified').length;
  const limits = analysis.distributors.flatMap((d) => (d.outputLimit ? [d.outputLimit] : []));
  const provisionalLimits = limits.filter((l) => l.evidence !== 'verified').length;
  const limitsText = limits.length
    ? `, ${provisionalLimits} of ${plural(limits.length, 'total output limit')}`
    : '';
  const provisionalNote =
    provisionalDevices || provisionalBanks || provisionalLimits
      ? `${provisionalDevices} of ${plural(equipmentRows.length, 'device')}${limitsText} and ${provisionalBanks} of ${plural(allBanks.length, 'bank')} use example, user-entered or unknown evidence, or have no power record. Check the evidence columns before relying on these figures.`
      : null;

  return {
    projectName: project.name,
    revision: project.revision,
    racks: racks(project)
      .map((r) => r.name)
      .join(', '),
    provisionalNote,
    summary: {
      devices: String(totals.deviceCount),
      mass: loadText(totals.mass.knownKg, totals.mass.complete, 'kg', 2, null, true),
      maxDraw: wattsText(totals.power.max, null, true),
      issues: String(analysis.issues.length),
    },
    equipment: { columns: [...EQUIPMENT_COLUMNS], rows: equipmentRows },
    bankColumns: [...BANK_COLUMNS],
    outputLimitColumns: [...OUTPUT_LIMIT_COLUMNS],
    distributors,
    totals: totalRows,
    issues,
    notes: [
      'Unknown values are shown as Unknown and are never counted as zero. A figure marked ≥ is the known part of an incomplete total (a lower bound).',
      'Mass and draw belong to each equipment model; evidence columns show whether a value is an example, user-entered, verified or unknown.',
      `Current = watts ÷ bank voltage, treating watts as volt-amperes (power factor 1). A bank or outlet is a Warning from ${analysis.warningUtilisation * 100} % of its rating and Over limit above 100 %; utilisation uses maximum draw.`,
      'Max inlet current is the device’s whole input at its feeding bank’s voltage; for a PDU or UPS it includes the equipment it supplies.',
      'A device fed from two outlets counts its full draw against each feeding bank and outlet, because one supply may carry the whole load. It counts once in the totals.',
      `A distributor’s total output counts every device it supplies once across all of its banks, including equipment behind a chained PDU. Watts are compared with the VA limit as volt-amperes (power factor 1). The worst rated limit (VA, W or A) sets the utilisation and status, with the same ${analysis.warningUtilisation * 100} % warning threshold.`,
      'Planning figures only, not an electrical design certificate: inrush, power factor, phase balance, breaker and cable ratings, UPS runtime, derating and rack, shelf or rail load ratings are not checked.',
    ],
  };
}

/**
 * The document as one sectioned CSV: a header block, then Equipment, Power banks, Total output,
 * Totals, Issues and Notes, each introduced by a one-cell title row and separated by a blank line. It uses the
 * shared `csv` helper, so formula prefixes are neutralised and unknown values read "Unknown".
 */
export function powerReportCsv(project: Project, report = buildPowerReport(project)): string {
  const bankRows = report.distributors.flatMap((d) => d.banks.map((b) => b.cells));
  const limitRows = report.distributors.flatMap((d) =>
    d.outputLimit ? [d.outputLimit.cells] : [],
  );
  return csv([
    ['Power and weights', report.projectName],
    ['Project revision', report.revision],
    ['Racks', report.racks],
    ['Evidence', report.provisionalNote ?? 'All listed values are verified.'],
    [],
    ['Equipment'],
    report.equipment.columns,
    ...report.equipment.rows.map((r) => r.cells),
    [],
    ['Power banks'],
    report.bankColumns,
    ...(bankRows.length ? bankRows : [['No power distributor is placed.']]),
    [],
    ['Total output'],
    report.outputLimitColumns,
    ...(limitRows.length ? limitRows : [['No placed distributor has a total output limit.']]),
    [],
    ['Totals'],
    ['Item', 'Value', 'Detail'],
    ...report.totals.map((t) => [t.label, t.value, t.detail]),
    [],
    ['Issues'],
    ['Severity', 'Message'],
    ...(report.issues.length
      ? report.issues.map((i) => [i.severity, i.message])
      : [['None', 'No power issues.']]),
    [],
    ['Notes'],
    ...report.notes.map((n) => [n]),
  ]);
}
