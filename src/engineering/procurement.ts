/** Continuous cut allocation. Every physical length is in millimetres. */
export interface BulkCableProduct {
  id: string;
  name: string;
  reelLengthMm: number;
  alternativeReelLengthsMm?: readonly number[];
  wastePerCutMm?: number;
}

export interface BulkCableCut {
  id: string;
  productId: string;
  /** Null is an unresolved physical run; it must never become a zero-length cut. */
  lengthMm: number | null;
  wasteMm?: number;
}

export interface CableStockReel {
  id: string;
  productId: string;
  remainingMm: number;
}

/** The three reserve components add together; all percentages use 0–100 units. */
export interface ProcurementReserve {
  fixedMm?: number;
  reelPercentage?: number;
  projectContingencyPercentage?: number;
}

export interface ProcurementInput {
  products: readonly BulkCableProduct[];
  cuts: readonly BulkCableCut[];
  stock?: readonly CableStockReel[];
  reserve?: ProcurementReserve;
  /** At most 24. Lower it to choose a heuristic for smaller projects. */
  exactCutLimit?: number;
  /** Deterministic search bound, across all attempted new-reel counts per product. */
  maxSearchNodes?: number;
}

export interface AllocatedCableCut {
  id: string;
  lengthMm: number;
  wasteMm: number;
  consumedLengthMm: number;
}

export interface ReelAllocation {
  reelId: string;
  productId: string;
  source: 'stock' | 'purchase';
  startingLengthMm: number;
  cuts: AllocatedCableCut[];
  cutLengthMm: number;
  wasteMm: number;
  consumedLengthMm: number;
  remainingLengthMm: number;
  utilisationPercent: number;
}

export interface ReelPurchaseQuantity {
  reelLengthMm: number;
  quantity: number;
}

export interface ProductProcurementResult {
  productId: string;
  productName: string;
  status: 'complete' | 'provisional' | 'infeasible';
  knownCutLengthMm: number;
  requiredCutLengthMm: number | null;
  knownCuttingWasteMm: number;
  knownConsumptionMm: number;
  unresolvedCutIds: string[];
  /** Capacity-only relaxation; ignores whether individual cuts fit. */
  aggregateLowerBoundReels: number;
  /** Accounts for all available stock capacity, still ignoring individual cuts. */
  aggregateLowerBoundNewReels: number;
  /** Present only if the optimal new-reel count is mathematically proven. */
  minimumFeasibleNewReels: number | null;
  /** A feasible purchase count. For heuristic results this is not called a minimum. */
  feasibleNewReels: number | null;
  allocatedReelCount: number;
  allocatedReels: ReelAllocation[];
  unusedStock: CableStockReel[];
  technicalPurchases: ReelPurchaseQuantity[];
  recommendedNewReels: number | null;
  recommendedPurchases: ReelPurchaseQuantity[];
  remainingInventoryAfterTechnicalMm: number | null;
  reserveTargetMm: number;
  reserveShortfallMm: number | null;
  recommendationReason: string;
  /** The proof concerns new-reel count, not globally optimal remnant distribution. */
  provenOptimal: boolean;
  optimisationMethod: 'exact' | 'bounded-search' | 'heuristic';
  searchNodes: number;
  warnings: string[];
}

export interface ProcurementResult {
  products: ProductProcurementResult[];
  complete: boolean;
  warnings: string[];
}

interface WorkingBin {
  id: string;
  source: 'stock' | 'purchase';
  capacity: number;
  remaining: number;
  cuts: AllocatedCableCut[];
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${label} must be a finite, non-negative number.`);
  return value;
}

function positive(value: number, label: string): number {
  nonNegative(value, label);
  if (value === 0) throw new RangeError(`${label} must be greater than zero.`);
  return value;
}

function uniqueIds(values: readonly { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const value of values) {
    if (!value.id.trim() || ids.has(value.id))
      throw new Error(`${label} IDs must be non-empty and unique. Duplicate ID: ${value.id}`);
    ids.add(value.id);
  }
}

/**
 * Up to 24 additions/subtractions can accumulate binary round-off. Comparisons
 * allow 64 machine epsilons relative to the compared lengths (about 4.4e-9 mm
 * for a 305 m reel). This is arithmetic tolerance, never an installation margin.
 */
const ARITHMETIC_EPSILON = Number.EPSILON * 64;
const fits = (required: number, available: number): boolean =>
  required <= available ||
  required - available <= Math.max(Math.abs(required), Math.abs(available)) * ARITHMETIC_EPSILON;
const lengthDifference = (left: number, right: number): number => {
  const difference = left - right;
  return Math.abs(difference) <= Math.max(Math.abs(left), Math.abs(right)) * ARITHMETIC_EPSILON
    ? 0
    : difference;
};
const reelCountCeil = (length: number, capacity: number): number => {
  if (length <= 0) return 0;
  const quotient = length / capacity;
  const nearest = Math.round(quotient);
  return Math.max(
    1,
    Math.abs(quotient - nearest) <= Math.max(1, Math.abs(quotient)) * ARITHMETIC_EPSILON
      ? nearest
      : Math.ceil(quotient),
  );
};
const sum = (values: readonly number[]) => {
  let total = 0,
    correction = 0;
  for (const value of values) {
    const adjusted = value - correction;
    const next = total + adjusted;
    correction = next - total - adjusted;
    total = next;
  }
  return total;
};
const copyBin = (bin: WorkingBin): WorkingBin => ({ ...bin, cuts: [...bin.cuts] });
const sortedCuts = (cuts: readonly AllocatedCableCut[]) =>
  [...cuts].sort((a, b) => b.consumedLengthMm - a.consumedLengthMm || a.id.localeCompare(b.id));

function stockBins(stock: readonly CableStockReel[]): WorkingBin[] {
  return stock.map((reel) => ({
    id: reel.id,
    source: 'stock',
    capacity: reel.remainingMm,
    remaining: reel.remainingMm,
    cuts: [],
  }));
}

function newBin(index: number, capacity: number): WorkingBin {
  return {
    id: `purchase-${index + 1}`,
    source: 'purchase',
    capacity,
    remaining: capacity,
    cuts: [],
  };
}

/** Best-fit decreasing supplies a valid incumbent, never an unqualified minimum. */
function greedyAllocate(
  cuts: readonly AllocatedCableCut[],
  stock: readonly CableStockReel[],
  capacity: number,
): WorkingBin[] {
  const bins = stockBins(stock);
  let purchaseIndex = 0;
  for (const cut of sortedCuts(cuts)) {
    let chosen: WorkingBin | undefined;
    for (const bin of bins) {
      if (
        fits(cut.consumedLengthMm, bin.remaining) &&
        (!chosen || bin.remaining < chosen.remaining)
      )
        chosen = bin;
    }
    if (!chosen) {
      chosen = newBin(purchaseIndex++, capacity);
      bins.push(chosen);
    }
    chosen.remaining = lengthDifference(chosen.remaining, cut.consumedLengthMm);
    chosen.cuts.push(cut);
  }
  return bins.filter((bin) => bin.cuts.length > 0);
}

interface SearchBudget {
  visited: number;
  limit: number;
  exhausted: boolean;
}

/**
 * Exact feasibility at a fixed purchase count. Branch-and-bound, equivalent-bin
 * pruning and failed-state memoisation keep normal rack projects manageable.
 * Retaining the largest N stock reels is safe: N cuts cannot use more than N
 * reels, and replacing any smaller unused stock reel by a larger one preserves
 * feasibility. Inputs and original stock quantities are never modified.
 */
function exactAllocate(
  inputCuts: readonly AllocatedCableCut[],
  stock: readonly CableStockReel[],
  capacity: number,
  purchaseCount: number,
  budget: SearchBudget,
): WorkingBin[] | null {
  const cuts = sortedCuts(inputCuts);
  const usefulStock = [...stock]
    .sort((a, b) => b.remainingMm - a.remainingMm)
    .slice(0, cuts.length);
  const bins = [
    ...stockBins(usefulStock),
    ...Array.from({ length: purchaseCount }, (_, index) => newBin(index, capacity)),
  ];
  const suffixTotals = Array<number>(cuts.length + 1).fill(0);
  for (let index = cuts.length - 1; index >= 0; index--)
    suffixTotals[index] = suffixTotals[index + 1] + cuts[index].consumedLengthMm;
  const failedStates = new Set<string>();
  const visit = (index: number): boolean => {
    if (index === cuts.length) return true;
    if (budget.visited >= budget.limit) {
      budget.exhausted = true;
      return false;
    }
    budget.visited++;
    if (!fits(suffixTotals[index], sum(bins.map((bin) => bin.remaining)))) return false;
    const cut = cuts[index];
    const candidates = bins
      .filter((bin) => fits(cut.consumedLengthMm, bin.remaining))
      .sort(
        (a, b) =>
          a.remaining - b.remaining || (a.source === b.source ? 0 : a.source === 'stock' ? -1 : 1),
      );
    if (candidates.length === 0) return false;
    const key = `${index}:${bins
      .map((bin) => bin.remaining)
      .sort((a, b) => a - b)
      .join(',')}`;
    if (failedStates.has(key)) return false;
    const triedRemaining = new Set<number>();
    for (const bin of candidates) {
      if (triedRemaining.has(bin.remaining)) continue;
      triedRemaining.add(bin.remaining);
      const previousRemaining = bin.remaining;
      bin.remaining = lengthDifference(bin.remaining, cut.consumedLengthMm);
      bin.cuts.push(cut);
      if (visit(index + 1)) return true;
      bin.cuts.pop();
      bin.remaining = previousRemaining;
      if (budget.exhausted) return false;
    }
    failedStates.add(key);
    return false;
  };
  return visit(0) ? bins.filter((bin) => bin.cuts.length > 0).map(copyBin) : null;
}

function purchaseQuantities(lengths: readonly number[]): ReelPurchaseQuantity[] {
  const counts = new Map<number, number>();
  for (const length of lengths) counts.set(length, (counts.get(length) ?? 0) + 1);
  return [...counts]
    .sort(([a], [b]) => a - b)
    .map(([reelLengthMm, quantity]) => ({ reelLengthMm, quantity }));
}

function allocateProduct(
  product: BulkCableProduct,
  productCuts: readonly BulkCableCut[],
  stock: readonly CableStockReel[],
  reserve: ProcurementReserve,
  exactCutLimit: number,
  maxSearchNodes: number,
): ProductProcurementResult {
  const capacities = [
    ...new Set([product.reelLengthMm, ...(product.alternativeReelLengthsMm ?? [])]),
  ].sort((a, b) => a - b);
  const purchaseCapacity = capacities[capacities.length - 1];
  const unresolvedCutIds = productCuts.filter((cut) => cut.lengthMm === null).map((cut) => cut.id);
  const cuts: AllocatedCableCut[] = productCuts
    .filter((cut) => cut.lengthMm !== null)
    .map((cut) => {
      const lengthMm = cut.lengthMm as number;
      const wasteMm = cut.wasteMm ?? product.wastePerCutMm ?? 0;
      return { id: cut.id, lengthMm, wasteMm, consumedLengthMm: lengthMm + wasteMm };
    });
  const knownCutLengthMm = sum(cuts.map((cut) => cut.lengthMm));
  const knownCuttingWasteMm = sum(cuts.map((cut) => cut.wasteMm));
  const knownConsumptionMm = knownCutLengthMm + knownCuttingWasteMm;
  nonNegative(knownConsumptionMm, 'Total cable consumption');
  const stockLength = sum(stock.map((reel) => reel.remainingMm));
  nonNegative(stockLength, 'Total stock length');
  const largestCapacity = stock.reduce(
    (largest, reel) => Math.max(largest, reel.remainingMm),
    purchaseCapacity,
  );
  const aggregateLowerBoundReels = reelCountCeil(knownConsumptionMm, largestCapacity);
  const aggregateLowerBoundNewReels = reelCountCeil(
    Math.max(0, lengthDifference(knownConsumptionMm, stockLength)),
    purchaseCapacity,
  );
  const reserveTargetMm =
    (reserve.fixedMm ?? 0) +
    product.reelLengthMm * ((reserve.reelPercentage ?? 0) / 100) +
    knownConsumptionMm * ((reserve.projectContingencyPercentage ?? 0) / 100);
  nonNegative(reserveTargetMm, 'Total reserve target');
  const warnings: string[] = [];
  if (unresolvedCutIds.length)
    warnings.push(
      `${unresolvedCutIds.length} cut length(s) are unknown. This allocation covers known cuts only; purchasing remains provisional.`,
    );
  const impossible = cuts.filter((cut) => !fits(cut.consumedLengthMm, largestCapacity));
  if (impossible.length) {
    warnings.push(
      ...impossible.map(
        (cut) =>
          `${cut.id}: the continuous cut plus waste (${cut.consumedLengthMm} mm) exceeds every available reel. Select a longer reel; separate remnants cannot be joined.`,
      ),
    );
    return {
      productId: product.id,
      productName: product.name,
      status: 'infeasible',
      knownCutLengthMm,
      requiredCutLengthMm: unresolvedCutIds.length ? null : knownCutLengthMm,
      knownCuttingWasteMm,
      knownConsumptionMm,
      unresolvedCutIds,
      aggregateLowerBoundReels,
      aggregateLowerBoundNewReels,
      minimumFeasibleNewReels: null,
      feasibleNewReels: null,
      allocatedReelCount: 0,
      allocatedReels: [],
      unusedStock: stock.map((reel) => ({ ...reel })),
      technicalPurchases: [],
      recommendedNewReels: null,
      recommendedPurchases: [],
      remainingInventoryAfterTechnicalMm: null,
      reserveTargetMm,
      reserveShortfallMm: null,
      recommendationReason:
        'No purchasing quantity can satisfy an individual continuous cut using the selected reel sizes.',
      provenOptimal: false,
      optimisationMethod: 'exact',
      searchNodes: 0,
      warnings,
    };
  }

  // A cut may be longer than a purchasable reel but fit a longer existing reel.
  // A greedy failure is retained only as a search incumbent and never emitted
  // as an allocation. Exact search can distinguish competing longer stock runs.
  let best = greedyAllocate(cuts, stock, purchaseCapacity);
  let bestNew = best.filter((bin) => bin.source === 'purchase').length;
  const budget: SearchBudget = { visited: 0, limit: maxSearchNodes, exhausted: false };
  const exact = cuts.length <= exactCutLimit;
  let provenOptimal = false;
  let optimisationMethod: ProductProcurementResult['optimisationMethod'] = exact
    ? 'exact'
    : 'heuristic';
  const greedyValid = best.every((bin) => bin.remaining >= 0);
  if (exact) {
    if (!greedyValid) bestNew = cuts.length;
    for (let candidate = aggregateLowerBoundNewReels; candidate <= bestNew; candidate++) {
      if (candidate === bestNew && greedyValid) {
        provenOptimal = true;
        break;
      }
      const allocation = exactAllocate(cuts, stock, purchaseCapacity, candidate, budget);
      if (allocation) {
        best = allocation;
        bestNew = allocation.filter((bin) => bin.source === 'purchase').length;
        provenOptimal = true;
        break;
      }
      if (budget.exhausted) break;
    }
    if (budget.exhausted) {
      optimisationMethod = 'bounded-search';
      warnings.push(
        'The exact search reached its configured node bound. The reported plan is feasible but its purchase count is not a proven minimum.',
      );
    }
  }
  if (!best.every((bin) => bin.remaining >= 0)) {
    // Multiple oversized runs may compete for a single longer stock reel.
    // No plan is falsely emitted when even the greedy incumbent is infeasible.
    const unproven = budget.exhausted || !exact;
    return {
      productId: product.id,
      productName: product.name,
      status: unproven ? 'provisional' : 'infeasible',
      knownCutLengthMm,
      requiredCutLengthMm: unresolvedCutIds.length ? null : knownCutLengthMm,
      knownCuttingWasteMm,
      knownConsumptionMm,
      unresolvedCutIds,
      aggregateLowerBoundReels,
      aggregateLowerBoundNewReels,
      minimumFeasibleNewReels: null,
      feasibleNewReels: null,
      allocatedReelCount: 0,
      allocatedReels: [],
      unusedStock: stock.map((reel) => ({ ...reel })),
      technicalPurchases: [],
      recommendedNewReels: null,
      recommendedPurchases: [],
      remainingInventoryAfterTechnicalMm: null,
      reserveTargetMm,
      reserveShortfallMm: null,
      recommendationReason: unproven
        ? 'No feasible plan was established within the selected optimisation limits. Review longer cuts, reduce the cut set, or increase the search budget.'
        : 'The available longer stock reels cannot accommodate all continuous cuts. Select a longer purchasable reel.',
      provenOptimal: false,
      optimisationMethod,
      searchNodes: budget.visited,
      warnings: [...warnings, 'A complete feasible cutting plan could not be established.'],
    };
  }
  if (!exact) {
    warnings.push(
      `Best-fit decreasing heuristic used for ${cuts.length} cuts. Its feasible reel count is not a mathematically proven minimum.`,
    );
  }
  if (unresolvedCutIds.length) provenOptimal = false;

  const allocatedReels: ReelAllocation[] = best.map((bin) => {
    const cutLengthMm = sum(bin.cuts.map((cut) => cut.lengthMm));
    const wasteMm = sum(bin.cuts.map((cut) => cut.wasteMm));
    const consumedLengthMm = cutLengthMm + wasteMm;
    // For equal reel count, choose the smallest offered reel that fits each bin.
    // This improves remnants but is not claimed to globally optimise waste.
    const startingLengthMm =
      bin.source === 'purchase'
        ? (capacities.find((capacity) => fits(consumedLengthMm, capacity)) ?? bin.capacity)
        : bin.capacity;
    return {
      reelId: bin.source === 'purchase' ? `${product.id}:${bin.id}` : bin.id,
      productId: product.id,
      source: bin.source,
      startingLengthMm,
      cuts: bin.cuts.map((cut) => ({ ...cut })),
      cutLengthMm,
      wasteMm,
      consumedLengthMm,
      remainingLengthMm: lengthDifference(startingLengthMm, consumedLengthMm),
      utilisationPercent: Math.min(100, (consumedLengthMm / startingLengthMm) * 100),
    };
  });
  const newLengths = allocatedReels
    .filter((reel) => reel.source === 'purchase')
    .map((reel) => reel.startingLengthMm);
  const availableInventoryMm = sum([stockLength, ...newLengths]);
  nonNegative(availableInventoryMm, 'Total stock plus purchased inventory');
  const remainingInventoryAfterTechnicalMm = lengthDifference(
    availableInventoryMm,
    knownConsumptionMm,
  );
  const reserveShortfallMm = fits(reserveTargetMm, remainingInventoryAfterTechnicalMm)
    ? 0
    : reserveTargetMm - remainingInventoryAfterTechnicalMm;
  const recommendedLengths = [...newLengths];
  let remainingShortfall = reserveShortfallMm;
  // First upgrade smaller selected reels if an offered larger size achieves the
  // reserve without increasing purchase count, then buy additional full reels.
  for (let index = 0; index < recommendedLengths.length && remainingShortfall > 0; index++) {
    const current = recommendedLengths[index];
    const upgraded =
      capacities.find((capacity) => fits(current + remainingShortfall, capacity)) ??
      purchaseCapacity;
    if (upgraded > current) {
      recommendedLengths[index] = upgraded;
      remainingShortfall = Math.max(0, lengthDifference(remainingShortfall, upgraded - current));
    }
  }
  const additionalReels = reelCountCeil(remainingShortfall, purchaseCapacity);
  if (!Number.isSafeInteger(additionalReels + recommendedLengths.length))
    throw new RangeError('The reserve requires more reels than can be counted safely.');
  const recommendedPurchases = purchaseQuantities(recommendedLengths);
  if (additionalReels > 0) {
    const existing = recommendedPurchases.find(
      (purchase) => purchase.reelLengthMm === purchaseCapacity,
    );
    if (existing) existing.quantity += additionalReels;
    else recommendedPurchases.push({ reelLengthMm: purchaseCapacity, quantity: additionalReels });
  }
  const recommendationReason = unresolvedCutIds.length
    ? 'Provisional: reserve and purchase quantities cover known cuts only. Resolve unknown lengths before ordering.'
    : reserveShortfallMm > 0
      ? `The technical plan leaves ${remainingInventoryAfterTechnicalMm} mm in available inventory, below the configured ${reserveTargetMm} mm reserve by ${reserveShortfallMm} mm. The recommendation adds or upgrades reels to retain this reserve.`
      : `The technical plan leaves ${remainingInventoryAfterTechnicalMm} mm in available inventory, meeting the configured ${reserveTargetMm} mm reserve.`;
  const usedStockIds = new Set(
    allocatedReels.filter((reel) => reel.source === 'stock').map((reel) => reel.reelId),
  );
  return {
    productId: product.id,
    productName: product.name,
    status: unresolvedCutIds.length ? 'provisional' : 'complete',
    knownCutLengthMm,
    requiredCutLengthMm: unresolvedCutIds.length ? null : knownCutLengthMm,
    knownCuttingWasteMm,
    knownConsumptionMm,
    unresolvedCutIds,
    aggregateLowerBoundReels,
    aggregateLowerBoundNewReels,
    minimumFeasibleNewReels: provenOptimal ? bestNew : null,
    feasibleNewReels: bestNew,
    allocatedReelCount: allocatedReels.length,
    allocatedReels,
    unusedStock: stock.filter((reel) => !usedStockIds.has(reel.id)).map((reel) => ({ ...reel })),
    technicalPurchases: purchaseQuantities(newLengths),
    recommendedNewReels: recommendedLengths.length + additionalReels,
    recommendedPurchases,
    remainingInventoryAfterTechnicalMm,
    reserveTargetMm,
    reserveShortfallMm,
    recommendationReason,
    provenOptimal,
    optimisationMethod,
    searchNodes: budget.visited,
    warnings,
  };
}

/**
 * Products are deliberately isolated. Pass one record per physical cable, never
 * an additional record for its loom or tray. The function is pure: reserving or
 * committing shared inventory belongs in the persistence/concurrency layer.
 */
export function calculateProcurement(input: ProcurementInput): ProcurementResult {
  const stock = input.stock ?? [];
  const reserve = input.reserve ?? {};
  uniqueIds(input.products, 'Product');
  uniqueIds(input.cuts, 'Physical cable cut');
  uniqueIds(stock, 'Stock reel');
  for (const product of input.products) {
    positive(product.reelLengthMm, `Reel length for ${product.id}`);
    for (const capacity of product.alternativeReelLengthsMm ?? [])
      positive(capacity, `Alternative reel length for ${product.id}`);
    nonNegative(product.wastePerCutMm ?? 0, `Cutting waste for ${product.id}`);
  }
  const productIds = new Set(input.products.map((product) => product.id));
  for (const cut of input.cuts) {
    if (!productIds.has(cut.productId))
      throw new Error(`Cable ${cut.id} refers to unknown bulk product ${cut.productId}.`);
    if (cut.lengthMm !== null) positive(cut.lengthMm, `Cut length for ${cut.id}`);
    if (cut.wasteMm !== undefined) nonNegative(cut.wasteMm, `Cutting waste for ${cut.id}`);
  }
  for (const reel of stock) {
    if (!productIds.has(reel.productId))
      throw new Error(`Stock reel ${reel.id} refers to unknown product ${reel.productId}.`);
    nonNegative(reel.remainingMm, `Remaining stock for ${reel.id}`);
  }
  for (const [key, value] of Object.entries(reserve))
    if (value !== undefined) nonNegative(value, `Reserve ${key}`);
  const exactCutLimit = input.exactCutLimit ?? 24;
  if (!Number.isInteger(exactCutLimit) || exactCutLimit < 0 || exactCutLimit > 24)
    throw new RangeError('Exact cut limit must be an integer between 0 and 24.');
  const maxSearchNodes = input.maxSearchNodes ?? 250_000;
  if (!Number.isSafeInteger(maxSearchNodes) || maxSearchNodes < 1)
    throw new RangeError('Search node bound must be a positive safe integer.');
  const products = input.products.map((product) =>
    allocateProduct(
      product,
      input.cuts.filter((cut) => cut.productId === product.id),
      stock.filter((reel) => reel.productId === product.id),
      reserve,
      exactCutLimit,
      maxSearchNodes,
    ),
  );
  // User stock IDs are unrestricted strings. Generated purchase IDs must stay
  // distinct even when an existing reel already uses the generated namespace.
  const allocatedIds = new Set(stock.map((reel) => reel.id));
  for (const product of products) {
    for (const reel of product.allocatedReels) {
      if (reel.source !== 'purchase') continue;
      while (allocatedIds.has(reel.reelId)) reel.reelId += ':new';
      allocatedIds.add(reel.reelId);
    }
  }
  return {
    products,
    complete: products.every((product) => product.status === 'complete'),
    warnings: products.flatMap((product) =>
      product.warnings.map((warning) => `${product.productName}: ${warning}`),
    ),
  };
}
