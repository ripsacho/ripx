/**
 * Analytics Service - Sample Ratio Mismatch (SRM) detection tests
 */

const analyticsService = require('../services/analytics');

describe('AnalyticsService.detectSampleRatioMismatch', () => {
  it('returns not detected when sample size is small', () => {
    const variants = [
      { visitors: 40, allocation: 50 },
      { visitors: 60, allocation: 50 },
    ];
    const result = analyticsService.detectSampleRatioMismatch(variants, 100);
    expect(result.detected).toBe(false);
    expect(result.pValue).toBeGreaterThan(0.001);
  });

  it('returns not detected when traffic matches expected 50/50', () => {
    const variants = [
      { visitors: 5000, allocation: 50 },
      { visitors: 5000, allocation: 50 },
    ];
    const result = analyticsService.detectSampleRatioMismatch(variants, 10000);
    expect(result.detected).toBe(false);
    expect(result.chiSquare).toBe(0);
    expect(result.pValue).toBe(1);
  });

  it('returns detected when traffic severely deviates from 50/50', () => {
    const variants = [
      { visitors: 9000, allocation: 50 },
      { visitors: 1000, allocation: 50 },
    ];
    const result = analyticsService.detectSampleRatioMismatch(variants, 10000);
    expect(result.detected).toBe(true);
    expect(result.pValue).toBeLessThan(0.001);
    expect(result.message).toBeTruthy();
  });

  it('handles 3+ variants', () => {
    const variants = [
      { visitors: 3300, allocation: 33.33 },
      { visitors: 3300, allocation: 33.33 },
      { visitors: 3400, allocation: 33.34 },
    ];
    const result = analyticsService.detectSampleRatioMismatch(variants, 10000);
    expect(result.detected).toBe(false);
  });

  it('returns not detected for empty or insufficient data', () => {
    expect(analyticsService.detectSampleRatioMismatch([], 0).detected).toBe(false);
    expect(analyticsService.detectSampleRatioMismatch(null, 100).detected).toBe(false);
    expect(
      analyticsService.detectSampleRatioMismatch([{ visitors: 50 }, { visitors: 50 }], 100).detected
    ).toBe(false);
  });
});
