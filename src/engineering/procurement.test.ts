import { describe, expect, it } from 'vitest';
import { calculateProcurement } from './procurement';
import type {
  BulkCableCut,
  BulkCableProduct,
  ProductProcurementResult,
  ProcurementInput,
} from './procurement';

const product: BulkCableProduct = { id: 'blue-cat6a', name: 'Blue Cat6A', reelLengthMm: 305000 };
const makeCuts = (lengths: readonly (number | null)[], productId = product.id): BulkCableCut[] =>
  lengths.map((lengthMm, index) => ({ id: `NET-${index + 1}`, productId, lengthMm }));
const plan = (lengths: readonly (number | null)[], rest: Partial<ProcurementInput> = {}) =>
  calculateProcurement({ products: [product], cuts: makeCuts(lengths), ...rest }).products[0];

function assertValidPlan(result: ProductProcurementResult, expectedIds: string[]): void {
  const ids: string[] = [];
  for (const reel of result.allocatedReels) {
    expect(reel.remainingLengthMm).toBeGreaterThanOrEqual(0);
    expect(reel.consumedLengthMm + reel.remainingLengthMm).toBeCloseTo(reel.startingLengthMm, 6);
    expect(reel.consumedLengthMm).toBe(
      reel.cuts.reduce((sum, cut) => sum + cut.lengthMm + cut.wasteMm, 0),
    );
    ids.push(...reel.cuts.map((cut) => cut.id));
  }
  expect(ids.sort()).toEqual([...expectedIds].sort());
  expect(new Set(ids).size).toBe(ids.length);
}

/** Independent subset-DP oracle for small, all-new-reel instances. */
function optimalBinsBySubset(lengths: number[], capacity: number): number {
  if (lengths.some((length) => length > capacity)) return Number.POSITIVE_INFINITY;
  const size = 1 << lengths.length;
  const best: Array<[number, number]> = Array.from({ length: size }, () => [
    Number.POSITIVE_INFINITY,
    0,
  ]);
  best[0] = [0, 0];
  for (let mask = 1; mask < size; mask++) {
    for (let index = 0; index < lengths.length; index++) {
      if (!(mask & (1 << index))) continue;
      const previous = best[mask ^ (1 << index)];
      const candidate: [number, number] =
        previous[0] === 0 || previous[1] + lengths[index] > capacity
          ? [previous[0] + 1, lengths[index]]
          : [previous[0], previous[1] + lengths[index]];
      if (
        candidate[0] < best[mask][0] ||
        (candidate[0] === best[mask][0] && candidate[1] < best[mask][1])
      )
        best[mask] = candidate;
    }
  }
  return best[size - 1][0];
}

/** Exhaustively allocate cut subsets to each stock reel, then use the DP oracle. */
function optimalPurchasesWithStock(lengths: number[], capacity: number, stock: number[]): number {
  const fullMask = (1 << lengths.length) - 1;
  const subsetLengths = Array.from({ length: fullMask + 1 }, (_, mask) =>
    lengths.reduce((total, length, index) => total + (mask & (1 << index) ? length : 0), 0),
  );
  let reachable = new Set([0]);
  for (const available of stock) {
    const next = new Set(reachable);
    for (const used of reachable) {
      const remaining = fullMask ^ used;
      for (let subset = remaining; subset; subset = (subset - 1) & remaining) {
        if (subsetLengths[subset] <= available) next.add(used | subset);
      }
    }
    reachable = next;
  }
  return Math.min(
    ...[...reachable].map((used) =>
      optimalBinsBySubset(
        lengths.filter((_, index) => !(used & (1 << index))),
        capacity,
      ),
    ),
  );
}

describe('continuous cable cuts and exact reel counts', () => {
  it('keeps a 120 m requirement on one 305 m reel', () => {
    const result = plan([120000]);
    expect(result.minimumFeasibleNewReels).toBe(1);
    expect(result.recommendedNewReels).toBe(1);
    expect(result.allocatedReels[0].remainingLengthMm).toBe(185000);
  });

  it('distinguishes one feasible reel from two recommended reels for 300 m with reserve', () => {
    const result = plan([300000], { reserve: { fixedMm: 10000 } });
    expect(result.aggregateLowerBoundReels).toBe(1);
    expect(result.minimumFeasibleNewReels).toBe(1);
    expect(result.feasibleNewReels).toBe(1);
    expect(result.recommendedNewReels).toBe(2);
    expect(result.provenOptimal).toBe(true);
    expect(result.remainingInventoryAfterTechnicalMm).toBe(5000);
    expect(result.reserveShortfallMm).toBe(5000);
    expect(result.recommendationReason).toContain('configured 10000 mm reserve');
    expect(result.technicalPurchases).toEqual([{ reelLengthMm: 305000, quantity: 1 }]);
    expect(result.recommendedPurchases).toEqual([{ reelLengthMm: 305000, quantity: 2 }]);
  });

  it('does not add a reel when reserve is exactly met', () => {
    expect(plan([300000], { reserve: { fixedMm: 5000 } }).recommendedNewReels).toBe(1);
  });

  it('fits three 135 m cuts (405 m total) into two 305 m reels', () => {
    const result = plan([135000, 135000, 135000]);
    expect(result.requiredCutLengthMm).toBe(405000);
    expect(result.aggregateLowerBoundReels).toBe(2);
    expect(result.minimumFeasibleNewReels).toBe(2);
    expect(result.recommendedNewReels).toBe(2);
    expect(result.allocatedReels.map((reel) => reel.cuts.length).sort()).toEqual([1, 2]);
    assertValidPlan(
      result,
      makeCuts([135000, 135000, 135000]).map((cut) => cut.id),
    );
  });

  it('requires three reels for three 160 m cuts despite the aggregate lower bound of two', () => {
    const result = plan([160000, 160000, 160000]);
    expect(result.aggregateLowerBoundReels).toBe(2);
    expect(result.minimumFeasibleNewReels).toBe(3);
    expect(result.provenOptimal).toBe(true);
    assertValidPlan(result, ['NET-1', 'NET-2', 'NET-3']);
  });

  it('does not falsely prove an extra reel necessary because of decimal millimetre round-off', () => {
    const result = plan([10000.1, 20000.2], { products: [{ ...product, reelLengthMm: 30000.3 }] });
    expect(result.aggregateLowerBoundReels).toBe(1);
    expect(result.minimumFeasibleNewReels).toBe(1);
    expect(result.provenOptimal).toBe(true);
    expect(result.allocatedReels).toHaveLength(1);
    expect(result.allocatedReels[0].remainingLengthMm).toBe(0);
    expect(result.allocatedReels[0].utilisationPercent).toBe(100);
    expect(result.allocatedReels[0].cuts.map((cut) => cut.lengthMm).sort((a, b) => a - b)).toEqual([
      10000.1, 20000.2,
    ]);
  });

  it('keeps a real 0.001 mm cut excess distinct from machine round-off', () => {
    const result = plan([10000.1, 20000.201], {
      products: [{ ...product, reelLengthMm: 30000.3 }],
    });
    expect(result.minimumFeasibleNewReels).toBe(2);
  });

  it('evaluates the individual cuts rather than only a 405 m aggregate', () => {
    expect(plan([250000, 155000]).minimumFeasibleNewReels).toBe(2);
    const continuous = plan([405000]);
    expect(continuous.status).toBe('infeasible');
    expect(continuous.feasibleNewReels).toBeNull();
    expect(continuous.allocatedReels).toEqual([]);
    expect(continuous.warnings.join(' ')).toContain('continuous cut');
  });

  it('uses exact search to improve a greedy counterexample', () => {
    const result = plan([6, 5, 3, 2, 2, 2], { products: [{ ...product, reelLengthMm: 10 }] });
    expect(result.minimumFeasibleNewReels).toBe(2);
    expect(result.provenOptimal).toBe(true);
    expect(result.searchNodes).toBeGreaterThan(0);
    assertValidPlan(
      result,
      makeCuts([6, 5, 3, 2, 2, 2]).map((cut) => cut.id),
    );
  });

  it('agrees with an independent exact DP oracle across 120 deterministic small instances', () => {
    let randomState = 73;
    const random = () => {
      randomState = (randomState * 16807) % 2147483647;
      return randomState;
    };
    for (let example = 0; example < 120; example++) {
      const lengths = Array.from({ length: 3 + (random() % 6) }, () => 1 + (random() % 10));
      const result = plan(lengths, { products: [{ ...product, reelLengthMm: 10 }] });
      expect(result.minimumFeasibleNewReels, `cuts ${lengths.join(',')}`).toBe(
        optimalBinsBySubset(lengths, 10),
      );
      expect(result.provenOptimal).toBe(true);
      assertValidPlan(
        result,
        makeCuts(lengths).map((cut) => cut.id),
      );
    }
  });

  it('never labels a bounded search result a minimum', () => {
    const result = plan([6, 5, 3, 2, 2, 2], {
      products: [{ ...product, reelLengthMm: 10 }],
      maxSearchNodes: 1,
    });
    expect(result.optimisationMethod).toBe('bounded-search');
    expect(result.minimumFeasibleNewReels).toBeNull();
    expect(result.feasibleNewReels).toBe(3);
    expect(result.provenOptimal).toBe(false);
    assertValidPlan(
      result,
      makeCuts([6, 5, 3, 2, 2, 2]).map((cut) => cut.id),
    );
  });

  it('labels larger cut sets heuristic and reports only a feasible count', () => {
    const lengths = Array<number>(25).fill(1000);
    const result = plan(lengths);
    expect(result.optimisationMethod).toBe('heuristic');
    expect(result.feasibleNewReels).toBe(1);
    expect(result.minimumFeasibleNewReels).toBeNull();
    expect(result.provenOptimal).toBe(false);
    assertValidPlan(
      result,
      makeCuts(lengths).map((cut) => cut.id),
    );
  });
});

describe('stock, cutting waste and distinct cable products', () => {
  it('uses available partial stock and a full existing reel before buying', () => {
    const result = plan([80000, 300000], {
      stock: [
        { id: 'partial', productId: product.id, remainingMm: 86000 },
        { id: 'full', productId: product.id, remainingMm: 305000 },
      ],
    });
    expect(result.minimumFeasibleNewReels).toBe(0);
    expect(result.allocatedReelCount).toBe(2);
    expect(result.remainingInventoryAfterTechnicalMm).toBe(11000);
    expect(result.allocatedReels.find((reel) => reel.reelId === 'partial')?.remainingLengthMm).toBe(
      6000,
    );
    assertValidPlan(result, ['NET-1', 'NET-2']);
  });

  it('does not combine separate stock remnants into a continuous run', () => {
    const result = plan([160000], {
      stock: [
        { id: 'partial-1', productId: product.id, remainingMm: 100000 },
        { id: 'partial-2', productId: product.id, remainingMm: 100000 },
      ],
    });
    expect(result.aggregateLowerBoundNewReels).toBe(0);
    expect(result.minimumFeasibleNewReels).toBe(1);
    expect(result.unusedStock).toHaveLength(2);
  });

  it('agrees with exhaustive stock-subset allocation on varied partial and longer stock', () => {
    let randomState = 23;
    const random = () => {
      randomState = (randomState * 16807) % 2147483647;
      return randomState;
    };
    for (let example = 0; example < 80; example++) {
      const lengths = Array.from({ length: 2 + (random() % 5) }, () => 1 + (random() % 12));
      const stock = Array.from({ length: 1 + (random() % 3) }, () => 1 + (random() % 16));
      const expected = optimalPurchasesWithStock(lengths, 10, stock);
      const result = plan(lengths, {
        products: [{ ...product, reelLengthMm: 10 }],
        stock: stock.map((remainingMm, index) => ({
          id: `S${index}`,
          productId: product.id,
          remainingMm,
        })),
      });
      if (expected === Number.POSITIVE_INFINITY) {
        expect(result.status, `cuts ${lengths}; stock ${stock}`).toBe('infeasible');
        expect(result.feasibleNewReels).toBeNull();
      } else {
        expect(result.minimumFeasibleNewReels, `cuts ${lengths}; stock ${stock}`).toBe(expected);
        assertValidPlan(
          result,
          makeCuts(lengths).map((cut) => cut.id),
        );
      }
    }
  });

  it('supports a continuous cut longer than a new reel when an existing longer reel fits', () => {
    const result = plan([400000], {
      stock: [{ id: 'long-stock', productId: product.id, remainingMm: 500000 }],
    });
    expect(result.minimumFeasibleNewReels).toBe(0);
    expect(result.aggregateLowerBoundReels).toBe(1);
    expect(result.allocatedReels[0].remainingLengthMm).toBe(100000);
  });

  it('rejects competing cuts that cannot share their only longer stock reel', () => {
    const result = plan([400000, 400000], {
      stock: [{ id: 'long-stock', productId: product.id, remainingMm: 500000 }],
    });
    expect(result.status).toBe('infeasible');
    expect(result.feasibleNewReels).toBeNull();
    expect(result.allocatedReels).toHaveLength(0);
  });

  it('applies product cutting waste once per physical cut, with explicit cut overrides', () => {
    const result = plan([150000, 150000], {
      products: [{ ...product, wastePerCutMm: 5000 }],
      cuts: [
        { id: 'A', productId: product.id, lengthMm: 150000 },
        { id: 'B', productId: product.id, lengthMm: 150000, wasteMm: 0 },
      ],
    });
    expect(result.knownCutLengthMm).toBe(300000);
    expect(result.knownCuttingWasteMm).toBe(5000);
    expect(result.knownConsumptionMm).toBe(305000);
    expect(result.minimumFeasibleNewReels).toBe(1);
    expect(result.allocatedReels[0].remainingLengthMm).toBe(0);
    assertValidPlan(result, ['A', 'B']);
  });

  it('includes waste when checking that an individual cut fits', () => {
    const result = plan([300000], { products: [{ ...product, wastePerCutMm: 6000 }] });
    expect(result.status).toBe('infeasible');
    expect(result.warnings.join(' ')).toContain('306000 mm');
  });

  it('keeps different products and their stock strictly separate', () => {
    const red = { ...product, id: 'red-cat6a', name: 'Red Cat6A' };
    const result = calculateProcurement({
      products: [product, red],
      cuts: [
        { id: 'blue', productId: product.id, lengthMm: 100000 },
        { id: 'red', productId: red.id, lengthMm: 100000 },
      ],
      stock: [{ id: 'blue-stock', productId: product.id, remainingMm: 305000 }],
    });
    expect(result.products[0].minimumFeasibleNewReels).toBe(0);
    expect(result.products[1].minimumFeasibleNewReels).toBe(1);
    expect(result.products[1].allocatedReels.every((reel) => reel.source === 'purchase')).toBe(
      true,
    );
  });

  it('does not mutate or consume stock during calculation', () => {
    const stock = Object.freeze([
      Object.freeze({ id: 'partial', productId: product.id, remainingMm: 86000 }),
    ]);
    const cuts = Object.freeze(makeCuts([80000]).map((cut) => Object.freeze(cut)));
    const input = Object.freeze({
      products: Object.freeze([Object.freeze({ ...product })]),
      cuts,
      stock,
    });
    const result = calculateProcurement(input);
    expect(stock[0].remainingMm).toBe(86000);
    expect(result.products[0].allocatedReels[0].remainingLengthMm).toBe(6000);
    result.products[0].allocatedReels[0].cuts[0].lengthMm = 1;
    expect(cuts[0].lengthMm).toBe(80000);
    expect(calculateProcurement(input).products[0].knownCutLengthMm).toBe(80000);
  });

  it('keeps generated purchase identifiers distinct from arbitrary stock identifiers', () => {
    const result = plan([80000, 200000], {
      stock: [{ id: `${product.id}:purchase-1`, productId: product.id, remainingMm: 80000 }],
    });
    expect(result.minimumFeasibleNewReels).toBe(1);
    expect(result.allocatedReels).toHaveLength(2);
    const ids = result.allocatedReels.map((reel) => reel.reelId);
    expect(new Set(ids).size).toBe(2);
    expect(result.allocatedReels.find((reel) => reel.source === 'stock')?.reelId).toBe(
      `${product.id}:purchase-1`,
    );
  });

  it('keeps unknown cuts provisional rather than converting them to zero demand', () => {
    const result = plan([100000, null]);
    expect(result.status).toBe('provisional');
    expect(result.knownCutLengthMm).toBe(100000);
    expect(result.requiredCutLengthMm).toBeNull();
    expect(result.unresolvedCutIds).toEqual(['NET-2']);
    expect(result.provenOptimal).toBe(false);
    expect(result.minimumFeasibleNewReels).toBeNull();
    expect(result.recommendationReason).toContain('Provisional');
    assertValidPlan(result, ['NET-1']);
  });
});

describe('explicit reserve rules and supported reel sizes', () => {
  it('does not recommend an extra reel for a decimal reserve boundary affected only by binary round-off', () => {
    const result = plan([20000.2], {
      products: [{ ...product, reelLengthMm: 30000.3 }],
      reserve: { fixedMm: 10000.1 },
    });
    expect(result.minimumFeasibleNewReels).toBe(1);
    expect(result.recommendedNewReels).toBe(1);
    expect(result.reserveShortfallMm).toBe(0);
  });

  it('adds fixed, percentage-of-reel and project contingency reserves transparently', () => {
    const result = plan([300000], {
      reserve: { fixedMm: 1000, reelPercentage: 10, projectContingencyPercentage: 10 },
    });
    expect(result.reserveTargetMm).toBe(61500);
    expect(result.recommendedNewReels).toBe(2);
  });

  it('counts unused available stock toward reserve', () => {
    const result = plan([300000], {
      stock: [{ id: 'unused-partial', productId: product.id, remainingMm: 10000 }],
      reserve: { fixedMm: 10000 },
    });
    expect(result.minimumFeasibleNewReels).toBe(1);
    expect(result.remainingInventoryAfterTechnicalMm).toBe(15000);
    expect(result.recommendedNewReels).toBe(1);
  });

  it('uses a supported alternative reel for longer cuts', () => {
    const result = plan([405000], {
      products: [{ ...product, alternativeReelLengthsMm: [500000] }],
    });
    expect(result.minimumFeasibleNewReels).toBe(1);
    expect(result.technicalPurchases).toEqual([{ reelLengthMm: 500000, quantity: 1 }]);
  });

  it('upgrades to a larger offered reel for reserve before increasing purchase count', () => {
    const result = plan([300000], {
      products: [{ ...product, alternativeReelLengthsMm: [500000] }],
      reserve: { fixedMm: 10000 },
    });
    expect(result.technicalPurchases).toEqual([{ reelLengthMm: 305000, quantity: 1 }]);
    expect(result.recommendedPurchases).toEqual([{ reelLengthMm: 500000, quantity: 1 }]);
    expect(result.recommendedNewReels).toBe(1);
  });

  it('handles empty demand without manufacturing a cut or using a reel', () => {
    const result = plan([]);
    expect(result.minimumFeasibleNewReels).toBe(0);
    expect(result.recommendedNewReels).toBe(0);
    expect(result.allocatedReels).toEqual([]);
  });

  it('groups large reserve purchases without allocating an array entry per reel', () => {
    const result = plan([300000], { reserve: { fixedMm: 305000 * 1000000 } });
    expect(result.recommendedNewReels).toBe(1000001);
    expect(result.recommendedPurchases).toEqual([{ reelLengthMm: 305000, quantity: 1000001 }]);
  });
});

describe('invalid inputs', () => {
  it('rejects duplicate physical cable IDs instead of double-counting them', () => {
    expect(() =>
      plan([1000], {
        cuts: [
          { id: 'duplicate', productId: product.id, lengthMm: 1000 },
          { id: 'duplicate', productId: product.id, lengthMm: 1000 },
        ],
      }),
    ).toThrow(/unique/);
  });

  it('rejects invalid lengths, unknown products and unsafe search bounds', () => {
    expect(() => plan([-1])).toThrow(/greater than zero|non-negative/);
    expect(() => plan([Number.NaN])).toThrow(/finite/);
    expect(() => plan([1000], { products: [{ ...product, reelLengthMm: 0 }] })).toThrow(
      /greater than zero/,
    );
    expect(() => plan([1000], { cuts: makeCuts([1000], 'missing') })).toThrow(
      /unknown bulk product/,
    );
    expect(() => plan([1000], { reserve: { fixedMm: -1 } })).toThrow(/non-negative/);
    expect(() => plan([1000], { maxSearchNodes: 0 })).toThrow(/positive safe integer/);
    expect(() => plan([1000], { exactCutLimit: 25 })).toThrow(/between 0 and 24/);
  });
});
