import type {
  Device,
  DeviceDefinition,
  PowerBank,
  PowerDraw,
  PowerOutputLimit,
  Project,
} from '../model';

/**
 * Bank or outlet utilisation at or above this fraction raises a warning. It follows the common
 * practice of derating continuously loaded circuits to 80 % of their rating.
 */
export const POWER_WARNING_UTILISATION = 0.8;
/** Connectors treated as an equipment power inlet when deciding whether a device draws power. */
export const POWER_INLET_CONNECTORS: readonly string[] = ['IEC-C14', 'IEC-C20'];
/** Arithmetic tolerance for threshold comparisons; far below any meaningful current. */
const EPSILON = 1e-9;

export type PowerStatus = 'ok' | 'warning' | 'over' | 'incomplete';
/**
 * A summed load in watts. Watts are treated as volt-amperes (power factor 1). The resulting
 * current estimate I = W / V is therefore conservative for amps only; it is not an apparent-power
 * or harmonic analysis.
 */
export interface PowerLoad {
  /** Sum of the known values. A lower bound when `complete` is false. */
  knownW: number;
  /** True only when every contributing value is known. */
  complete: boolean;
}
/** A load on a bank or outlet with its current estimate at the bank voltage. */
export interface BankLoad extends PowerLoad {
  /** knownW / voltageV. A lower bound when `complete` is false. */
  knownA: number;
}
/** What a device draws at its inlet(s): its own draw plus everything downstream of it. */
export interface InputLoad {
  nominal: PowerLoad;
  max: PowerLoad;
}
/** One cable from a banked outlet to a consuming device's port. */
export interface PowerFeed {
  distributorDeviceId: string;
  bankId: string;
  outletPortId: string;
  cableId: string;
  inletPortId: string;
}
export interface PowerUnknownConsumer {
  deviceId: string;
  name: string;
  reason: string;
}
export interface PowerBankConsumer {
  deviceId: string;
  name: string;
  outletPortIds: string[];
  cableIds: string[];
  input: InputLoad;
  /** Fed from more than one outlet anywhere in the project (for example dual power supplies). */
  redundantFeed: boolean;
}
export interface PowerExternalOutlet {
  portId: string;
  cableId: string;
  destinationId: string;
}
export interface PowerOutletResult {
  portId: string;
  portName: string;
  cableIds: string[];
  consumerDeviceIds: string[];
  externalDestinationIds: string[];
  /** Worst-case load through this outlet: each consumer's full maximum draw. */
  max: BankLoad;
  limitA: number | null;
  /** max.knownA / limitA, or null when the outlet has no rating. */
  utilisation: number | null;
  status: PowerStatus;
}
export interface PowerBankResult {
  distributorDeviceId: string;
  bankId: string;
  name: string;
  voltageV: number;
  maxCurrentA: number;
  outletMaxCurrentA: number | null;
  evidence: PowerBank['evidence'];
  source: string;
  outlets: PowerOutletResult[];
  consumers: PowerBankConsumer[];
  unknownConsumers: PowerUnknownConsumer[];
  externalOutlets: PowerExternalOutlet[];
  nominal: BankLoad;
  max: BankLoad;
  /** max.knownA / maxCurrentA; a lower bound when the status is incomplete. */
  utilisation: number;
  status: PowerStatus;
}
/** Which rated total-output limit a utilisation figure refers to. */
export type PowerOutputLimitKind = 'W' | 'VA' | 'A';
/**
 * A distributor's total output load across all of its banks, against its rated total output
 * (`DeviceDefinition.powerOutputLimit`). Every unique downstream device counts once, including a
 * device fed from two banks of this distributor and devices behind a chained distributor.
 */
export interface PowerOutputLimitResult {
  maxVA: number | null;
  maxW: number | null;
  maxCurrentA: number | null;
  voltageV: number;
  evidence: PowerOutputLimit['evidence'];
  source: string;
  /** Devices fed directly from any bank of this distributor, in bank and outlet order. */
  consumerDeviceIds: string[];
  unknownConsumers: PowerUnknownConsumer[];
  externalOutlets: PowerExternalOutlet[];
  /** Amps at `voltageV`. Watts are treated as volt-amperes (power factor 1). */
  nominal: BankLoad;
  max: BankLoad;
  /** Maximum-load utilisation of each rated limit; null where that limit is not rated. */
  utilisationByLimit: Record<PowerOutputLimitKind, number | null>;
  /** The highest utilisation of the rated limits; a lower bound when the load is incomplete. */
  utilisation: number;
  /** The rated limit with the highest utilisation (the first of W, VA, A on a tie). */
  governingLimit: PowerOutputLimitKind;
  status: PowerStatus;
}
export interface PowerDistributorResult {
  deviceId: string;
  name: string;
  definitionId: string;
  banks: PowerBankResult[];
  /** Total output against the rated limit, or null when the model has no total output limit. */
  outputLimit: PowerOutputLimitResult | null;
  /** Own draw plus every unique downstream consumer once. */
  input: InputLoad;
}
export interface DevicePowerInfo {
  deviceId: string;
  name: string;
  definitionId: string;
  definitionName: string;
  massKg: number | null;
  /** Has a power record, power banks, a power inlet or a bank feed. */
  powered: boolean;
  isDistributor: boolean;
  nominalW: number | null;
  maxW: number | null;
  powerEvidence: PowerDraw['evidence'] | null;
  powerSource: string | null;
  feeds: PowerFeed[];
  redundantFeed: boolean;
  /** Part of a distribution cycle; its input load is incomplete. */
  inCycle: boolean;
  input: InputLoad;
}
export type PowerIssueCode =
  | 'bank-over'
  | 'bank-warning'
  | 'bank-incomplete'
  | 'output-over'
  | 'output-warning'
  | 'output-incomplete'
  | 'outlet-over'
  | 'outlet-warning'
  | 'external-on-bank'
  | 'outlet-to-outlet'
  | 'distribution-cycle';
export interface PowerIssue {
  severity: 'error' | 'warning' | 'notice';
  code: PowerIssueCode;
  message: string;
  deviceId: string | null;
  bankId: string | null;
  portId: string | null;
  cableId: string | null;
}
export interface PowerTotals {
  deviceCount: number;
  mass: {
    knownKg: number;
    complete: boolean;
    missing: { deviceId: string; name: string }[];
  };
  power: {
    poweredDeviceCount: number;
    /** Own draws only; each device once, however many feeds or distributors it has. */
    nominal: PowerLoad;
    max: PowerLoad;
    missing: { deviceId: string; name: string; missingNominal: boolean; missingMax: boolean }[];
  };
}
export interface PowerAnalysis {
  warningUtilisation: number;
  distributors: PowerDistributorResult[];
  devices: DevicePowerInfo[];
  totals: PowerTotals;
  issues: PowerIssue[];
}

const load = (knownW = 0, complete = true): PowerLoad => ({ knownW, complete });
const add = (a: PowerLoad, b: PowerLoad): PowerLoad => ({
  knownW: a.knownW + b.knownW,
  complete: a.complete && b.complete,
});
const amps = (l: PowerLoad, voltageV: number): BankLoad => ({ ...l, knownA: l.knownW / voltageV });
const fmt = (n: number, digits = 1) => n.toFixed(digits);

/** Status for a utilisation fraction. Warnings and overloads on the known part win over incompleteness. */
export function powerStatus(utilisation: number, complete: boolean): PowerStatus {
  if (utilisation > 1 + EPSILON) return 'over';
  if (utilisation >= POWER_WARNING_UTILISATION - EPSILON) return 'warning';
  return complete ? 'ok' : 'incomplete';
}
/** True when a total output limit is present with at least one rated value. */
export function hasPowerOutputLimit(limit: PowerOutputLimit | undefined): boolean {
  return Boolean(limit && [limit.maxVA, limit.maxW, limit.maxCurrentA].some((v) => v != null));
}
export function isPowerDistributor(definition: DeviceDefinition | undefined): boolean {
  return (definition?.powerBanks?.length ?? 0) > 0;
}

const cache = new WeakMap<Project, PowerAnalysis>();
/** Power-load and equipment-mass analysis of a project. Cached per project snapshot. */
export function analysePower(project: Project): PowerAnalysis {
  let result = cache.get(project);
  if (!result) {
    result = analysePowerUncached(project);
    cache.set(project, result);
  }
  return result;
}

function analysePowerUncached(project: Project): PowerAnalysis {
  const definitions = new Map(project.definitions.map((d) => [d.id, d]));
  const devices = new Map(project.devices.map((d) => [d.id, d]));
  const definitionOf = (device: Device | undefined) =>
    device ? definitions.get(device.definitionId) : undefined;
  const bankAt = (deviceId: string, portId: string) =>
    definitionOf(devices.get(deviceId))?.powerBanks?.find((b) => b.portIds.includes(portId));
  const deviceName = (id: string) => devices.get(id)?.name ?? id;
  const issues: PowerIssue[] = [];
  const issue = (
    severity: PowerIssue['severity'],
    code: PowerIssueCode,
    message: string,
    refs: Partial<Pick<PowerIssue, 'deviceId' | 'bankId' | 'portId' | 'cableId'>> = {},
  ) =>
    issues.push({
      severity,
      code,
      message,
      deviceId: refs.deviceId ?? null,
      bankId: refs.bankId ?? null,
      portId: refs.portId ?? null,
      cableId: refs.cableId ?? null,
    });

  // 1. Resolve power feeds from cable records by stable endpoint identity.
  const feeds = new Map<string, PowerFeed[]>(project.devices.map((d) => [d.id, []]));
  const outletFeeds = new Map<string, { consumerId: string; feed: PowerFeed }[]>();
  const outletExternals = new Map<string, PowerExternalOutlet[]>();
  const outletKey = (deviceId: string, portId: string) => JSON.stringify([deviceId, portId]);
  for (const cable of project.cables) {
    const ends = [cable.source, cable.destination];
    const banked = ends.map((e) =>
      e.kind === 'device' ? bankAt(e.deviceId, e.portId) : undefined,
    );
    if (banked[0] && banked[1]) {
      issue(
        'warning',
        'outlet-to-outlet',
        `Cable ${cable.label || cable.id} joins two banked outlets; it is not counted as a power feed.`,
        { cableId: cable.id },
      );
      continue;
    }
    const index = banked[0] ? 0 : banked[1] ? 1 : -1;
    if (index < 0) continue;
    const outlet = ends[index];
    const other = ends[1 - index];
    if (outlet.kind !== 'device') continue;
    const bank = banked[index]!;
    const key = outletKey(outlet.deviceId, outlet.portId);
    if (other.kind === 'external') {
      const list = outletExternals.get(key) ?? [];
      list.push({ portId: outlet.portId, cableId: cable.id, destinationId: other.destinationId });
      outletExternals.set(key, list);
      const destination = project.destinations.find((d) => d.id === other.destinationId);
      issue(
        'warning',
        'external-on-bank',
        `${deviceName(outlet.deviceId)} · ${bank.name}: outlet ${outlet.portId} feeds external ${destination?.name ?? other.destinationId} through cable ${cable.label || cable.id}; its draw is unknown and the bank total is incomplete.`,
        { deviceId: outlet.deviceId, bankId: bank.id, portId: outlet.portId, cableId: cable.id },
      );
      continue;
    }
    if (!devices.has(other.deviceId)) continue;
    const feed: PowerFeed = {
      distributorDeviceId: outlet.deviceId,
      bankId: bank.id,
      outletPortId: outlet.portId,
      cableId: cable.id,
      inletPortId: other.portId,
    };
    feeds.get(other.deviceId)!.push(feed);
    outletFeeds.set(key, [...(outletFeeds.get(key) ?? []), { consumerId: other.deviceId, feed }]);
  }

  // 2. Distribution graph: distributor -> unique consumers, in feed order.
  const downstream = new Map<string, string[]>();
  for (const device of project.devices)
    for (const feed of feeds.get(device.id)!) {
      const list = downstream.get(feed.distributorDeviceId) ?? [];
      if (!list.includes(device.id)) list.push(device.id);
      downstream.set(feed.distributorDeviceId, list);
    }
  // Re-order each consumer list deterministically by outlet order on the distributor.
  for (const [distributorId, list] of downstream) {
    const banks = definitionOf(devices.get(distributorId))?.powerBanks ?? [];
    const order = banks.flatMap((b) =>
      b.portIds.flatMap((portId) =>
        (outletFeeds.get(outletKey(distributorId, portId)) ?? []).map((f) => f.feed.cableId),
      ),
    );
    const firstCable = (consumer: string) =>
      Math.min(
        ...feeds
          .get(consumer)!
          .filter((f) => f.distributorDeviceId === distributorId)
          .map((f) => order.indexOf(f.cableId)),
      );
    list.sort((a, b) => firstCable(a) - firstCable(b));
  }

  // 3. Cycles: strongly connected components with more than one member or a self-feed.
  const inCycle = new Set<string>();
  {
    let counter = 0;
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();
    const components: string[][] = [];
    const visit = (v: string) => {
      index.set(v, counter);
      low.set(v, counter++);
      stack.push(v);
      onStack.add(v);
      for (const w of downstream.get(v) ?? []) {
        if (!index.has(w)) {
          visit(w);
          low.set(v, Math.min(low.get(v)!, low.get(w)!));
        } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
      if (low.get(v) === index.get(v)) {
        const component: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          component.push(w);
        } while (w !== v);
        components.push(component);
      }
    };
    for (const device of project.devices) if (!index.has(device.id)) visit(device.id);
    for (const component of components) {
      const cyclic =
        component.length > 1 || (downstream.get(component[0]) ?? []).includes(component[0]);
      if (!cyclic) continue;
      const members = project.devices.filter((d) => component.includes(d.id));
      members.forEach((d) => inCycle.add(d.id));
      issue(
        'error',
        'distribution-cycle',
        `Power distribution cycle: ${members.map((d) => d.name).join(' → ')} feed each other. Their loads cannot be resolved and are reported as incomplete.`,
        { deviceId: members[0].id },
      );
    }
  }

  // 4. Input load per device: own draw plus every unique device downstream of it.
  const powered = (device: Device) => {
    const def = definitionOf(device);
    return (
      def?.power !== undefined ||
      isPowerDistributor(def) ||
      Boolean(def?.ports.some((p) => POWER_INLET_CONNECTORS.includes(p.connector))) ||
      feeds.get(device.id)!.length > 0
    );
  };
  const ownLoad = (device: Device): InputLoad => {
    const draw = definitionOf(device)?.power;
    if (!powered(device)) return { nominal: load(), max: load() };
    return {
      nominal: load(draw?.nominalW ?? 0, draw?.nominalW != null),
      max: load(draw?.maxW ?? 0, draw?.maxW != null),
    };
  };
  // Unique devices supplied through the given devices, those devices included. Summing own draws
  // over this closure counts a device once even when two chained distributors share it.
  const closure = (start: string[]): string[] => {
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const next of downstream.get(id) ?? []) visit(next);
    };
    start.forEach(visit);
    return [...seen];
  };
  const sumOwn = (ids: string[], complete = true): InputLoad =>
    ids.reduce(
      (sum, id) => {
        const own = ownLoad(devices.get(id)!);
        const known = !inCycle.has(id);
        return {
          nominal: add(sum.nominal, { ...own.nominal, complete: own.nominal.complete && known }),
          max: add(sum.max, { ...own.max, complete: own.max.complete && known }),
        };
      },
      { nominal: load(0, complete), max: load(0, complete) },
    );
  const inputs = new Map<string, InputLoad>();
  const inputOf = (deviceId: string): InputLoad => {
    let result = inputs.get(deviceId);
    if (!result) {
      result = sumOwn(closure([deviceId]));
      inputs.set(deviceId, result);
    }
    return result;
  };
  const unknownReason = (deviceId: string): string | null => {
    const device = devices.get(deviceId)!;
    const input = inputOf(deviceId);
    if (input.nominal.complete && input.max.complete) return null;
    if (inCycle.has(deviceId)) return 'Part of a power distribution cycle.';
    const draw = definitionOf(device)?.power;
    const missing = [
      draw?.nominalW == null ? 'nominal' : null,
      draw?.maxW == null ? 'maximum' : null,
    ].filter(Boolean);
    if (missing.length) return `No ${missing.join(' or ')} draw recorded for its equipment model.`;
    return 'Its downstream load is incomplete.';
  };

  // Total output of a distributor across all of its banks: every unique downstream device once.
  const outputLimitResult = (
    device: Device,
    limit: PowerOutputLimit,
    banks: PowerBankResult[],
  ): PowerOutputLimitResult => {
    const consumerIds = [...new Set(banks.flatMap((b) => b.consumers.map((c) => c.deviceId)))];
    const externalOutlets = banks.flatMap((b) => b.externalOutlets);
    const unknownConsumers = consumerIds.flatMap((c) => {
      const reason = unknownReason(c);
      return reason ? [{ deviceId: c, name: deviceName(c), reason }] : [];
    });
    const total = sumOwn(closure(consumerIds), externalOutlets.length === 0);
    const nominal = amps(total.nominal, limit.voltageV);
    const max = amps(total.max, limit.voltageV);
    const ratio = (value: number, rating: number | null) =>
      rating === null ? null : value / rating;
    const utilisationByLimit: Record<PowerOutputLimitKind, number | null> = {
      W: ratio(max.knownW, limit.maxW),
      VA: ratio(max.knownW, limit.maxVA),
      A: ratio(max.knownA, limit.maxCurrentA),
    };
    const kinds = (['W', 'VA', 'A'] as const).filter((k) => utilisationByLimit[k] !== null);
    const governingLimit = kinds.reduce((a, b) =>
      utilisationByLimit[b]! > utilisationByLimit[a]! ? b : a,
    );
    const utilisation = utilisationByLimit[governingLimit]!;
    const status = powerStatus(utilisation, nominal.complete && max.complete);
    const value = { W: max.knownW, VA: max.knownW, A: max.knownA };
    const rating = { W: limit.maxW, VA: limit.maxVA, A: limit.maxCurrentA };
    const figures = (['VA', 'W', 'A'] as const)
      .filter((k) => utilisationByLimit[k] !== null)
      .map(
        (k) =>
          `${fmt(value[k], k === 'A' ? 2 : 0)} ${k} of ${fmt(rating[k]!, k === 'A' ? 2 : 0)} ${k} (${fmt(utilisationByLimit[k]! * 100)} %)`,
      )
      .join(', ');
    const label = `${device.name} · total output`;
    const refs = { deviceId: device.id };
    if (status === 'over')
      issue(
        'error',
        'output-over',
        `${label}: ${figures} at maximum draw exceeds the distributor's total output limit.`,
        refs,
      );
    else if (status === 'warning')
      issue(
        'warning',
        'output-warning',
        `${label}: ${figures} at maximum draw is at or above the ${POWER_WARNING_UTILISATION * 100} % continuous-load guideline.`,
        refs,
      );
    if (!(nominal.complete && max.complete))
      issue(
        'notice',
        'output-incomplete',
        `${label}: load is incomplete${unknownConsumers.length ? `; unknown draw for ${unknownConsumers.map((u) => u.name).join(', ')}` : ''}${externalOutlets.length ? `; ${externalOutlets.length} outlet feed(s) leave the rack` : ''}. Known part: ${figures}.`,
        refs,
      );
    return {
      maxVA: limit.maxVA,
      maxW: limit.maxW,
      maxCurrentA: limit.maxCurrentA,
      voltageV: limit.voltageV,
      evidence: limit.evidence,
      source: limit.source,
      consumerDeviceIds: consumerIds,
      unknownConsumers,
      externalOutlets,
      nominal,
      max,
      utilisationByLimit,
      utilisation,
      governingLimit,
      status,
    };
  };

  // 5. Per-distributor and per-bank results.
  const redundant = (deviceId: string) => feeds.get(deviceId)!.length > 1;
  const distributors: PowerDistributorResult[] = [];
  for (const device of project.devices) {
    const def = definitionOf(device);
    if (!def || !isPowerDistributor(def)) continue;
    const banks: PowerBankResult[] = [];
    for (const bank of def.powerBanks!) {
      const outlets: PowerOutletResult[] = [];
      const consumerIds: string[] = [];
      const externalOutlets: PowerExternalOutlet[] = [];
      for (const portId of bank.portIds) {
        const key = outletKey(device.id, portId);
        const here = outletFeeds.get(key) ?? [];
        const externals = outletExternals.get(key) ?? [];
        externalOutlets.push(...externals);
        const consumers = [...new Set(here.map((f) => f.consumerId))];
        for (const c of consumers) if (!consumerIds.includes(c)) consumerIds.push(c);
        const { max } = sumOwn(closure(consumers), externals.length === 0);
        const limitA = bank.outletMaxCurrentA;
        const maxA = amps(max, bank.voltageV);
        const utilisation = limitA === null ? null : maxA.knownA / limitA;
        const status =
          utilisation === null
            ? max.complete
              ? 'ok'
              : 'incomplete'
            : powerStatus(utilisation, max.complete);
        const portName = def.ports.find((p) => p.id === portId)?.name ?? portId;
        outlets.push({
          portId,
          portName,
          cableIds: [...here.map((f) => f.feed.cableId), ...externals.map((e) => e.cableId)],
          consumerDeviceIds: consumers,
          externalDestinationIds: externals.map((e) => e.destinationId),
          max: maxA,
          limitA,
          utilisation,
          status,
        });
        if (utilisation !== null && (status === 'over' || status === 'warning'))
          issue(
            status === 'over' ? 'error' : 'warning',
            status === 'over' ? 'outlet-over' : 'outlet-warning',
            `${device.name} · ${bank.name} · ${portName}: ${fmt(maxA.knownA, 2)} A of ${fmt(limitA!)} A outlet rating (${fmt(utilisation * 100)} %)${status === 'over' ? ' exceeds the outlet limit' : ` is at or above ${POWER_WARNING_UTILISATION * 100} % of the outlet limit`}.`,
            { deviceId: device.id, bankId: bank.id, portId },
          );
      }
      const consumers: PowerBankConsumer[] = consumerIds.map((c) => {
        const mine = feeds
          .get(c)!
          .filter((f) => f.distributorDeviceId === device.id && f.bankId === bank.id);
        return {
          deviceId: c,
          name: deviceName(c),
          outletPortIds: [...new Set(mine.map((f) => f.outletPortId))],
          cableIds: mine.map((f) => f.cableId),
          input: inputOf(c),
          redundantFeed: redundant(c),
        };
      });
      const unknownConsumers = consumerIds.flatMap((c) => {
        const reason = unknownReason(c);
        return reason ? [{ deviceId: c, name: deviceName(c), reason }] : [];
      });
      const total = sumOwn(closure(consumerIds), externalOutlets.length === 0);
      const nominal = amps(total.nominal, bank.voltageV);
      const max = amps(total.max, bank.voltageV);
      const utilisation = max.knownA / bank.maxCurrentA;
      const status = powerStatus(utilisation, nominal.complete && max.complete);
      const label = `${device.name} · ${bank.name}`;
      const figure = `${fmt(max.knownA, 2)} A of ${fmt(bank.maxCurrentA)} A (${fmt(utilisation * 100)} %) at maximum draw`;
      if (status === 'over')
        issue('error', 'bank-over', `${label}: ${figure} exceeds the bank limit.`, {
          deviceId: device.id,
          bankId: bank.id,
        });
      else if (status === 'warning')
        issue(
          'warning',
          'bank-warning',
          `${label}: ${figure} is at or above the ${POWER_WARNING_UTILISATION * 100} % continuous-load guideline.`,
          { deviceId: device.id, bankId: bank.id },
        );
      if (!(nominal.complete && max.complete))
        issue(
          'notice',
          'bank-incomplete',
          `${label}: load is incomplete${unknownConsumers.length ? `; unknown draw for ${unknownConsumers.map((u) => u.name).join(', ')}` : ''}${externalOutlets.length ? `; ${externalOutlets.length} outlet feed(s) leave the rack` : ''}. Known part: ${fmt(max.knownA, 2)} A of ${fmt(bank.maxCurrentA)} A.`,
          { deviceId: device.id, bankId: bank.id },
        );
      banks.push({
        distributorDeviceId: device.id,
        bankId: bank.id,
        name: bank.name,
        voltageV: bank.voltageV,
        maxCurrentA: bank.maxCurrentA,
        outletMaxCurrentA: bank.outletMaxCurrentA,
        evidence: bank.evidence,
        source: bank.source,
        outlets,
        consumers,
        unknownConsumers,
        externalOutlets,
        nominal,
        max,
        utilisation,
        status,
      });
    }
    distributors.push({
      deviceId: device.id,
      name: device.name,
      definitionId: def.id,
      banks,
      outputLimit: hasPowerOutputLimit(def.powerOutputLimit)
        ? outputLimitResult(device, def.powerOutputLimit!, banks)
        : null,
      input: inputOf(device.id),
    });
  }

  // 6. Per-device information and project totals.
  const info: DevicePowerInfo[] = project.devices.map((device) => {
    const def = definitionOf(device);
    return {
      deviceId: device.id,
      name: device.name,
      definitionId: device.definitionId,
      definitionName: def?.name ?? device.definitionId,
      massKg: def?.massKg ?? null,
      powered: powered(device),
      isDistributor: isPowerDistributor(def),
      nominalW: def?.power?.nominalW ?? null,
      maxW: def?.power?.maxW ?? null,
      powerEvidence: def?.power?.evidence ?? null,
      powerSource: def?.power?.source ?? null,
      feeds: feeds.get(device.id)!,
      redundantFeed: redundant(device.id),
      inCycle: inCycle.has(device.id),
      input: inputOf(device.id),
    };
  });
  const poweredInfo = info.filter((d) => d.powered);
  const totals: PowerTotals = {
    deviceCount: info.length,
    mass: {
      knownKg: info.reduce((n, d) => n + (d.massKg ?? 0), 0),
      complete: info.every((d) => d.massKg !== null),
      missing: info
        .filter((d) => d.massKg === null)
        .map((d) => ({ deviceId: d.deviceId, name: d.name })),
    },
    power: {
      poweredDeviceCount: poweredInfo.length,
      nominal: poweredInfo.reduce(
        (sum, d) => add(sum, load(d.nominalW ?? 0, d.nominalW !== null)),
        load(),
      ),
      max: poweredInfo.reduce((sum, d) => add(sum, load(d.maxW ?? 0, d.maxW !== null)), load()),
      missing: poweredInfo
        .filter((d) => d.nominalW === null || d.maxW === null)
        .map((d) => ({
          deviceId: d.deviceId,
          name: d.name,
          missingNominal: d.nominalW === null,
          missingMax: d.maxW === null,
        })),
    },
  };
  return {
    warningUtilisation: POWER_WARNING_UTILISATION,
    distributors,
    devices: info,
    totals,
    issues,
  };
}

/** Readable problems with a definition's power data, for editors to show before saving. */
export function powerDefinitionIssues(definition: DeviceDefinition): string[] {
  const issues: string[] = [];
  const draw = definition.power;
  if (draw?.nominalW != null && draw.maxW != null && draw.nominalW > draw.maxW)
    issues.push('Nominal power draw cannot exceed maximum power draw.');
  const ports = new Set(definition.ports.map((p) => p.id));
  const seen = new Set<string>();
  for (const bank of definition.powerBanks ?? []) {
    if (!bank.name.trim()) issues.push('Every power bank needs a name.');
    if (!bank.portIds.length)
      issues.push(`Power bank ${bank.name} needs at least one outlet port.`);
    if (!(bank.maxCurrentA > 0))
      issues.push(`Power bank ${bank.name} needs a positive current limit.`);
    if (!(bank.voltageV > 0)) issues.push(`Power bank ${bank.name} needs a positive voltage.`);
    if (bank.outletMaxCurrentA !== null && !(bank.outletMaxCurrentA > 0))
      issues.push(`Power bank ${bank.name} needs a positive outlet limit or none.`);
    for (const id of bank.portIds) {
      if (!ports.has(id)) issues.push(`Power bank ${bank.name} refers to a missing port.`);
      else if (seen.has(id)) issues.push(`Port ${id} belongs to more than one power bank.`);
      seen.add(id);
    }
  }
  const limit = definition.powerOutputLimit;
  if (limit) {
    if (!hasPowerOutputLimit(limit))
      issues.push('A total output limit needs at least one of VA, W or A.');
    if (!definition.powerBanks?.length)
      issues.push('A total output limit requires at least one power bank.');
    for (const [value, label] of [
      [limit.maxVA, 'VA'],
      [limit.maxW, 'W'],
      [limit.maxCurrentA, 'A'],
    ] as const)
      if (value !== null && !(value > 0))
        issues.push(`The total output limit in ${label} must be positive or empty.`);
    if (!(limit.voltageV > 0)) issues.push('The total output limit needs a positive voltage.');
  }
  return issues;
}

const definitionById = (p: Project, definitionId: string) => {
  const definition = p.definitions.find((d) => d.id === definitionId);
  if (!definition) throw new Error('Equipment model not found.');
  return definition;
};
/**
 * Update the equipment model's power draw. Every placed copy of the model shares it. A value
 * change without an explicit evidence level marks the record user-entered.
 */
export function setDefinitionPower(
  p: Project,
  definitionId: string,
  patch: Partial<PowerDraw>,
): void {
  const definition = definitionById(p, definitionId);
  const previous = definition.power ?? {
    nominalW: null,
    maxW: null,
    evidence: 'user-entered' as const,
    source: '',
  };
  const valueChanged =
    ('nominalW' in patch && patch.nominalW !== previous.nominalW) ||
    ('maxW' in patch && patch.maxW !== previous.maxW);
  definition.power = {
    ...previous,
    ...(valueChanged && !patch.evidence ? { evidence: 'user-entered' as const } : {}),
    ...patch,
  };
}
/** Update the equipment model's mass; null means unknown. */
export function setDefinitionMass(p: Project, definitionId: string, massKg: number | null): void {
  definitionById(p, definitionId).massKg = massKg;
}
/** Update one power bank's ratings on an equipment model. Value edits mark the bank user-entered. */
export function setPowerBank(
  p: Project,
  definitionId: string,
  bankId: string,
  patch: Partial<Omit<PowerBank, 'id'>>,
): void {
  const bank = definitionById(p, definitionId).powerBanks?.find((b) => b.id === bankId);
  if (!bank) throw new Error('Power bank not found.');
  const valueChanged = (['maxCurrentA', 'outletMaxCurrentA', 'voltageV'] as const).some(
    (k) => k in patch && patch[k] !== bank[k],
  );
  Object.assign(bank, valueChanged && !patch.evidence ? { evidence: 'user-entered' } : {}, patch);
}
/** A new total output limit: nothing rated yet, at 230 V. */
export const EMPTY_POWER_OUTPUT_LIMIT: PowerOutputLimit = {
  maxVA: null,
  maxW: null,
  maxCurrentA: null,
  voltageV: 230,
  evidence: 'user-entered',
  source: '',
};
/**
 * Set, update or (with null) remove an equipment model's total output limit. A rated-value change
 * without an explicit evidence level marks the limit user-entered.
 */
export function setPowerOutputLimit(
  p: Project,
  definitionId: string,
  patch: Partial<PowerOutputLimit> | null,
): void {
  const definition = definitionById(p, definitionId);
  if (patch === null) {
    delete definition.powerOutputLimit;
    return;
  }
  const previous = definition.powerOutputLimit ?? EMPTY_POWER_OUTPUT_LIMIT;
  const valueChanged = (['maxVA', 'maxW', 'maxCurrentA', 'voltageV'] as const).some(
    (k) => k in patch && patch[k] !== previous[k],
  );
  definition.powerOutputLimit = {
    ...previous,
    ...(valueChanged && !patch.evidence ? { evidence: 'user-entered' as const } : {}),
    ...patch,
  };
}
