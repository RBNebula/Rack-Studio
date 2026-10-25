/** All engineering values in this module are millimetres. No rendering units. */
export interface ExplicitLengthAllowance {
  id: string;
  label: string;
  lengthMm: number;
}

export interface CableLengthInput {
  routedLengthMm: number;
  /** Omit for an internal cable. Set to null for a required, unknown external route. */
  externalLengthMm?: number | null;
  serviceLoopMm?: number;
  terminationAllowanceAMm?: number;
  terminationAllowanceBMm?: number;
  otherAllowances?: readonly ExplicitLengthAllowance[];
  /** Zero means exact; any positive increment rounds the complete cut upwards. */
  roundingIncrementMm?: number;
  manualCutLengthMm?: number;
  measurementsVerified?: boolean;
  manualCutVerified?: boolean;
}

export interface CableLengthBreakdown {
  routedLengthMm: number;
  externalLengthMm: number | null;
  serviceLoopMm: number;
  terminationAllowanceAMm: number;
  terminationAllowanceBMm: number;
  otherAllowances: ExplicitLengthAllowance[];
  totalAllowancesMm: number;
  roundingIncrementMm: number;
  roundingAddedMm: number | null;
  manualCutLengthMm: number | null;
}

export interface CableLengthResult {
  status: 'complete' | 'provisional';
  /** Unknown external distance always leaves the required length unknown. */
  requiredLengthMm: number | null;
  /** Sum of known route sections and explicit allowances, before rounding. */
  knownSubtotalMm: number;
  calculatedLengthMm: number | null;
  unroundedLengthMm: number | null;
  measurementsVerified: boolean;
  breakdown: CableLengthBreakdown;
  warnings: string[];
}

function nonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite, non-negative length in millimetres.`);
  }
  return value;
}

/** Round upwards. The tiny relative tolerance only removes arithmetic round-off. */
export function roundCutLengthUp(lengthMm: number, incrementMm: number): number {
  nonNegative(lengthMm, 'Cut length');
  nonNegative(incrementMm, 'Rounding increment');
  if (incrementMm === 0) return lengthMm;
  const units = lengthMm / incrementMm;
  if (!Number.isFinite(units) || units > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      'The rounding increment is too small for the supported numerical precision at this length.',
    );
  }
  const nearest = Math.round(units);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(units)) * 4;
  const rounded = Math.max(
    lengthMm,
    (Math.abs(units - nearest) <= tolerance ? nearest : Math.ceil(units)) * incrementMm,
  );
  return nonNegative(rounded, 'Rounded cut length');
}

/**
 * Add each named allowance once, then round once. RoutedLengthMm is the known
 * cable centreline length; do not put a service loop both in it and an allowance.
 * Manual cuts are retained as explicit overrides, including a shortfall warning.
 */
export function calculateCableLength(input: CableLengthInput): CableLengthResult {
  const routedLengthMm = nonNegative(input.routedLengthMm, 'Routed length');
  const externalLengthMm =
    input.externalLengthMm === null
      ? null
      : nonNegative(input.externalLengthMm ?? 0, 'External length');
  const serviceLoopMm = nonNegative(input.serviceLoopMm ?? 0, 'Service loop');
  const terminationAllowanceAMm = nonNegative(
    input.terminationAllowanceAMm ?? 0,
    'End A termination allowance',
  );
  const terminationAllowanceBMm = nonNegative(
    input.terminationAllowanceBMm ?? 0,
    'End B termination allowance',
  );
  const roundingIncrementMm = nonNegative(input.roundingIncrementMm ?? 0, 'Rounding increment');
  const ids = new Set<string>();
  const otherAllowances = (input.otherAllowances ?? []).map((allowance) => {
    if (!allowance.id.trim() || ids.has(allowance.id)) {
      throw new Error(
        'Every explicit allowance must have a unique, non-empty ID; duplicate allowances cannot be counted twice.',
      );
    }
    ids.add(allowance.id);
    return { ...allowance, lengthMm: nonNegative(allowance.lengthMm, `Allowance ${allowance.id}`) };
  });
  const totalAllowancesMm =
    serviceLoopMm +
    terminationAllowanceAMm +
    terminationAllowanceBMm +
    otherAllowances.reduce((sum, allowance) => sum + allowance.lengthMm, 0);
  const knownSubtotalMm = routedLengthMm + (externalLengthMm ?? 0) + totalAllowancesMm;
  nonNegative(knownSubtotalMm, 'Total known length');
  const calculatedLengthMm =
    externalLengthMm === null ? null : roundCutLengthUp(knownSubtotalMm, roundingIncrementMm);
  const manualCutLengthMm =
    input.manualCutLengthMm === undefined
      ? null
      : nonNegative(input.manualCutLengthMm, 'Manual cut length');
  const warnings: string[] = [];
  if (externalLengthMm === null)
    warnings.push(
      'External route length is unknown. The known subtotal is not a complete cable length.',
    );
  if (!input.measurementsVerified) warnings.push('Route measurements have not been verified.');
  if (manualCutLengthMm !== null && !input.manualCutVerified)
    warnings.push('The manual cut length has not been verified.');
  if (manualCutLengthMm !== null && manualCutLengthMm < (calculatedLengthMm ?? knownSubtotalMm)) {
    warnings.push(
      'The manual cut length is shorter than the calculated requirement or known subtotal.',
    );
  }
  return {
    status: externalLengthMm === null ? 'provisional' : 'complete',
    requiredLengthMm:
      calculatedLengthMm === null ? null : (manualCutLengthMm ?? calculatedLengthMm),
    knownSubtotalMm,
    calculatedLengthMm,
    unroundedLengthMm: externalLengthMm === null ? null : knownSubtotalMm,
    measurementsVerified: input.measurementsVerified === true,
    breakdown: {
      routedLengthMm,
      externalLengthMm,
      serviceLoopMm,
      terminationAllowanceAMm,
      terminationAllowanceBMm,
      otherAllowances,
      totalAllowancesMm,
      roundingIncrementMm,
      roundingAddedMm: calculatedLengthMm === null ? null : calculatedLengthMm - knownSubtotalMm,
      manualCutLengthMm,
    },
    warnings,
  };
}

export interface PreterminatedLengthInput {
  suppliedLengthMm: number;
  requiredLengthMm: number | null;
  knownSubtotalMm?: number;
  /** Advisory only; it does not establish that slack physically fits. */
  excessiveSlackThresholdMm?: number;
}

export interface PreterminatedLengthResult {
  status: 'sufficient' | 'insufficient' | 'provisional';
  suppliedLengthMm: number;
  requiredLengthMm: number | null;
  availableSlackMm: number | null;
  shortfallMm: number | null;
  excessiveSlack: boolean;
  warnings: string[];
}

/** Fixed supplied lengths never round upwards or change to match a route. */
export function validatePreterminatedLength(
  input: PreterminatedLengthInput,
): PreterminatedLengthResult {
  const suppliedLengthMm = nonNegative(input.suppliedLengthMm, 'Supplied cable length');
  const requiredLengthMm =
    input.requiredLengthMm === null ? null : nonNegative(input.requiredLengthMm, 'Required length');
  const knownSubtotalMm = nonNegative(input.knownSubtotalMm ?? 0, 'Known subtotal');
  const excessiveSlackThresholdMm =
    input.excessiveSlackThresholdMm === undefined
      ? null
      : nonNegative(input.excessiveSlackThresholdMm, 'Excessive slack threshold');
  const comparisonLengthMm = requiredLengthMm ?? knownSubtotalMm;
  const insufficient = comparisonLengthMm > suppliedLengthMm;
  const availableSlackMm =
    requiredLengthMm === null ? null : Math.max(0, suppliedLengthMm - requiredLengthMm);
  const excessiveSlack =
    availableSlackMm !== null &&
    excessiveSlackThresholdMm !== null &&
    availableSlackMm > excessiveSlackThresholdMm;
  const warnings: string[] = [];
  if (requiredLengthMm === null)
    warnings.push('The complete route length is unknown; cable sufficiency cannot be confirmed.');
  if (insufficient)
    warnings.push(
      'The supplied cable is shorter than the required route or known subtotal. Select a longer assembly.',
    );
  if (excessiveSlack)
    warnings.push(
      'Available slack exceeds the configured threshold. Its physical accommodation requires validation.',
    );
  return {
    status: insufficient
      ? 'insufficient'
      : requiredLengthMm === null
        ? 'provisional'
        : 'sufficient',
    suppliedLengthMm,
    requiredLengthMm,
    availableSlackMm,
    shortfallMm: insufficient
      ? comparisonLengthMm - suppliedLengthMm
      : requiredLengthMm === null
        ? null
        : 0,
    excessiveSlack,
    warnings,
  };
}
