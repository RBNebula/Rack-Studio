import { describe, expect, it } from 'vitest';
import { calculateCableLength, roundCutLengthUp, validatePreterminatedLength } from './lengths';

describe('transparent millimetre cable lengths', () => {
  it('adds service, terminations and explicit allowances exactly once, then rounds once', () => {
    const result = calculateCableLength({
      routedLengthMm: 3400,
      serviceLoopMm: 250,
      terminationAllowanceAMm: 100,
      terminationAllowanceBMm: 150,
      otherAllowances: [{ id: 'entry', label: 'Entry allowance', lengthMm: 35 }],
      roundingIncrementMm: 100,
      measurementsVerified: true,
    });
    expect(result.knownSubtotalMm).toBe(3935);
    expect(result.requiredLengthMm).toBe(4000);
    expect(result.breakdown.totalAllowancesMm).toBe(535);
    expect(result.breakdown.roundingAddedMm).toBe(65);
    expect(result.warnings).toEqual([]);
  });

  it('records a known external section separately from the rack route', () => {
    const result = calculateCableLength({
      routedLengthMm: 1200,
      externalLengthMm: 18000,
      terminationAllowanceAMm: 100,
      terminationAllowanceBMm: 150,
    });
    expect(result.requiredLengthMm).toBe(19450);
    expect(result.breakdown.externalLengthMm).toBe(18000);
  });

  it('keeps an unknown external section provisional, even with a manual cut', () => {
    const result = calculateCableLength({
      routedLengthMm: 1200,
      externalLengthMm: null,
      serviceLoopMm: 200,
      manualCutLengthMm: 10000,
    });
    expect(result.status).toBe('provisional');
    expect(result.requiredLengthMm).toBeNull();
    expect(result.calculatedLengthMm).toBeNull();
    expect(result.unroundedLengthMm).toBeNull();
    expect(result.knownSubtotalMm).toBe(1400);
    expect(result.breakdown.manualCutLengthMm).toBe(10000);
    expect(result.breakdown.roundingAddedMm).toBeNull();
    expect(result.warnings.some((warning) => warning.includes('unknown'))).toBe(true);
  });

  it('retains a manual override separately and warns when it is short or unverified', () => {
    const result = calculateCableLength({ routedLengthMm: 2300, manualCutLengthMm: 2000 });
    expect(result.calculatedLengthMm).toBe(2300);
    expect(result.requiredLengthMm).toBe(2000);
    expect(result.warnings.some((warning) => warning.includes('shorter'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('not been verified'))).toBe(true);
  });

  it.each([
    [3400, 100, 3400],
    [3400.1, 100, 3500],
    [3401, 50, 3450],
    [3401, 500, 3500],
    [3400.25, 0, 3400.25],
    [0, 10, 0],
  ])('rounds %s mm upwards by %s mm to %s mm', (length, increment, expected) => {
    expect(roundCutLengthUp(length, increment)).toBe(expected);
  });

  it('never returns a cut below the supplied real-valued requirement', () => {
    for (const length of [0.1 + 0.2, 3400.0000000000005, 444.45, 2499.9999999999995]) {
      expect(roundCutLengthUp(length, 0.1)).toBeGreaterThanOrEqual(length);
    }
  });

  it('rejects duplicate allowance IDs and invalid physical quantities', () => {
    expect(() => calculateCableLength({ routedLengthMm: -1 })).toThrow(/non-negative/);
    expect(() => calculateCableLength({ routedLengthMm: Number.NaN })).toThrow(/finite/);
    expect(() => roundCutLengthUp(1000, -10)).toThrow(/non-negative/);
    expect(() =>
      calculateCableLength({
        routedLengthMm: 3400,
        otherAllowances: [
          { id: 'same', label: 'One', lengthMm: 100 },
          { id: 'same', label: 'Again', lengthMm: 100 },
        ],
      }),
    ).toThrow(/unique/);
  });

  it('rejects rounding outside supported numerical precision instead of returning an infinite complete length', () => {
    expect(() =>
      calculateCableLength({
        routedLengthMm: 1,
        roundingIncrementMm: Number.MIN_VALUE,
        measurementsVerified: true,
      }),
    ).toThrow(/numerical precision/);
    expect(() => roundCutLengthUp(Number.MAX_VALUE, Number.MAX_VALUE * 0.75)).toThrow(/finite/);
  });
});

describe('fixed preterminated assembly validation', () => {
  it('flags a 2 m assembly on a 2.3 m route without stretching or rounding it', () => {
    const result = validatePreterminatedLength({ suppliedLengthMm: 2000, requiredLengthMm: 2300 });
    expect(result.status).toBe('insufficient');
    expect(result.suppliedLengthMm).toBe(2000);
    expect(result.shortfallMm).toBe(300);
    expect(result.availableSlackMm).toBe(0);
  });

  it('reports 400 mm available slack and its advisory threshold', () => {
    const result = validatePreterminatedLength({
      suppliedLengthMm: 2000,
      requiredLengthMm: 1600,
      excessiveSlackThresholdMm: 300,
    });
    expect(result.status).toBe('sufficient');
    expect(result.availableSlackMm).toBe(400);
    expect(result.excessiveSlack).toBe(true);
    expect(result.warnings.join(' ')).toContain('physical accommodation');
  });

  it('accepts exact length and does not flag slack at the threshold', () => {
    expect(
      validatePreterminatedLength({ suppliedLengthMm: 2000, requiredLengthMm: 2000 }).status,
    ).toBe('sufficient');
    expect(
      validatePreterminatedLength({
        suppliedLengthMm: 2000,
        requiredLengthMm: 1600,
        excessiveSlackThresholdMm: 400,
      }).excessiveSlack,
    ).toBe(false);
  });

  it('cannot claim sufficiency or available slack from an incomplete route', () => {
    const result = validatePreterminatedLength({
      suppliedLengthMm: 2000,
      requiredLengthMm: null,
      knownSubtotalMm: 1200,
    });
    expect(result.status).toBe('provisional');
    expect(result.availableSlackMm).toBeNull();
    expect(result.shortfallMm).toBeNull();
  });

  it('can prove a shortfall against the known subtotal of an incomplete route', () => {
    const result = validatePreterminatedLength({
      suppliedLengthMm: 2000,
      requiredLengthMm: null,
      knownSubtotalMm: 2300,
    });
    expect(result.status).toBe('insufficient');
    expect(result.shortfallMm).toBe(300);
    expect(result.availableSlackMm).toBeNull();
  });
});
