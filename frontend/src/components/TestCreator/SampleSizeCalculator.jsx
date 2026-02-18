/**
 * Sample Size Calculator Component
 *
 * Calculates required sample size for AB tests.
 * Includes MDE reverse calculator: given sample size, compute detectable effect.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, TextField, BlockStack, Text, InlineStack } from '@shopify/polaris';

const MDE_PRESETS = [5, 10, 15, 20, 30, 50];
const BASELINE_PRESETS = [0.5, 1, 2, 3, 5, 10, 15, 20];
const CONFIDENCE_PRESETS = [90, 95, 99];
const POWER_PRESETS = [80, 90];

const Z_SCORES = { 0.9: 1.645, 0.95: 1.96, 0.99: 2.576 };
const POWER_Z = { 0.8: 0.84, 0.9: 1.28, 0.95: 1.645 };

function getZAlpha(confidence) {
  const c = confidence / 100;
  if (Z_SCORES[c]) return Z_SCORES[c];
  if (c <= 0.9) return 1.645;
  if (c >= 0.99) return 2.576;
  return 1.96;
}

function SampleSizeCalculator({ onCalculate, embedded, initialValues = {}, className }) {
  const [mode, setMode] = useState('sample'); // 'sample' | 'mde'
  const [baselineRate, setBaselineRate] = useState('2');
  const [minimumEffect, setMinimumEffect] = useState('20');
  const [confidenceLevel, setConfidenceLevel] = useState(initialValues.confidenceLevel || '95');
  const [power, setPower] = useState(initialValues.power || '80');
  const [dailyVisitors, setDailyVisitors] = useState('500');
  const [sampleSizePerVariant, setSampleSizePerVariant] = useState('1000');
  const [result, setResult] = useState(null);
  const [mdeResult, setMdeResult] = useState(null);

  useEffect(() => {
    if (initialValues.confidenceLevel) setConfidenceLevel(initialValues.confidenceLevel);
    if (initialValues.power) setPower(initialValues.power);
  }, [initialValues.confidenceLevel, initialValues.power]);

  /** MDE reverse: given sample size per variant + baseline, compute detectable effect */
  const calculateMDE = useCallback(() => {
    const baseline = parseFloat(baselineRate) / 100;
    const n = parseInt(sampleSizePerVariant, 10);
    const powerValue = parseFloat(power) / 100;
    if (!baseline || baseline <= 0 || baseline >= 1 || !n || n < 10) {
      setMdeResult(null);
      return;
    }
    const zAlpha = getZAlpha(parseFloat(confidenceLevel));
    const zBeta = POWER_Z[powerValue] || 0.84;
    // Binary search for effect: n = ((zα+zβ)² * (p̄(1-p̄) + p1(1-p1) + p2(1-p2))) / (p2-p1)²
    let lo = 0.001, hi = 5;
    for (let i = 0; i < 50; i++) {
      const effect = (lo + hi) / 2;
      const p2 = baseline * (1 + effect);
      const pBar = (baseline + p2) / 2;
      const num = Math.pow(zAlpha + zBeta, 2) * (pBar * (1 - pBar) + baseline * (1 - baseline) + p2 * (1 - p2));
      const den = Math.pow(p2 - baseline, 2);
      if (den <= 0 || !Number.isFinite(num)) {
        setMdeResult(null);
        return;
      }
      const calcN = Math.ceil(num / den);
      if (calcN <= n) hi = effect;
      else lo = effect;
    }
    const mdePercent = ((lo + hi) / 2 * 100).toFixed(1);
    setMdeResult({ mdePercent: parseFloat(mdePercent), baseline });
  }, [baselineRate, sampleSizePerVariant, confidenceLevel, power]);

  const formatDuration = days => {
    if (days >= 365) return `~${(days / 365).toFixed(1)} years`;
    if (days >= 60) return `~${(days / 30).toFixed(1)} months`;
    if (days >= 14) return `~${Math.round(days / 7)} weeks`;
    return `~${days} days`;
  };

  const calculateSampleSize = useCallback(() => {
    const baseline = parseFloat(baselineRate) / 100;
    const effect = parseFloat(minimumEffect) / 100;
    const powerValue = parseFloat(power) / 100;

    const zAlpha = getZAlpha(parseFloat(confidenceLevel));
    const zBeta = POWER_Z[powerValue] || 0.84;

    const p1 = baseline;
    const p2 = p1 * (1 + effect);

    // Two-proportion z-test sample size formula
    const pBar = (p1 + p2) / 2;
    const numerator =
      Math.pow(zAlpha + zBeta, 2) * (pBar * (1 - pBar) + p1 * (1 - p1) + p2 * (1 - p2));
    const denominator = Math.pow(p2 - p1, 2);

    if (denominator <= 0 || !Number.isFinite(numerator)) {
      setResult(null);
      return;
    }

    const sampleSize = Math.ceil(numerator / denominator);
    const totalSize = sampleSize * 2; // For both variants
    const daily = Math.max(1, parseFloat(dailyVisitors) || 100);

    const calculatedResult = {
      perVariant: sampleSize,
      total: totalSize,
      estimatedDays: Math.ceil(totalSize / daily),
      dailyVisitors: daily,
    };

    setResult(calculatedResult);

    if (onCalculate) {
      onCalculate(calculatedResult);
    }
  }, [baselineRate, minimumEffect, confidenceLevel, power, dailyVisitors, onCalculate]);

  // Real-time calculation on input change (with debouncing)
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only calculate if all values are valid
      const baseline = parseFloat(baselineRate);
      const effect = parseFloat(minimumEffect);
      const confidence = parseFloat(confidenceLevel);
      const powerValue = parseFloat(power);

      if (
        !isNaN(baseline) &&
        baseline > 0 &&
        baseline <= 100 &&
        !isNaN(effect) &&
        effect > 0 &&
        effect <= 100 &&
        !isNaN(confidence) &&
        confidence >= 90 &&
        confidence <= 99 &&
        !isNaN(powerValue) &&
        powerValue >= 70 &&
        powerValue <= 95
      ) {
        calculateSampleSize();
      } else {
        setResult(null);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [baselineRate, minimumEffect, confidenceLevel, power, dailyVisitors, calculateSampleSize]);

  // MDE reverse: recalc when inputs change
  useEffect(() => {
    if (mode !== 'mde') {
      setMdeResult(null);
      return;
    }
    const timer = setTimeout(calculateMDE, 200);
    return () => clearTimeout(timer);
  }, [mode, baselineRate, sampleSizePerVariant, confidenceLevel, power, calculateMDE]);

  const formContent = (
    <BlockStack gap="400">
      {!embedded && (
        <>
          <Text variant="headingMd" as="h2">
            Sample Size Calculator
          </Text>
          <Text variant="bodySm" color="subdued" as="p">
            Calculate the minimum number of visitors needed for statistically significant results.
            Results update automatically as you type.
          </Text>
          <div className="sample-size-mode-toggle" role="group" aria-label="Calculator mode">
            <button
              type="button"
              className={`sample-size-mode-btn ${mode === 'sample' ? 'sample-size-mode-btn-active' : ''}`}
              onClick={() => setMode('sample')}
              aria-pressed={mode === 'sample'}
            >
              Sample size
            </button>
            <button
              type="button"
              className={`sample-size-mode-btn ${mode === 'mde' ? 'sample-size-mode-btn-active' : ''}`}
              onClick={() => setMode('mde')}
              aria-pressed={mode === 'mde'}
            >
              MDE from sample size
            </button>
          </div>
        </>
      )}

      <div className={embedded ? 'sample-size-inputs-grid' : ''}>
      <BlockStack gap="300">
          <div>
            <Text variant="bodyMd" fontWeight="medium" as="p" tone="subdued">Baseline conversion rate</Text>
            <div className="sample-size-presets-row">
              {BASELINE_PRESETS.map(v => (
                <button
                  key={v}
                  type="button"
                  className={`sample-size-preset ${baselineRate === String(v) ? 'sample-size-preset-active' : ''}`}
                  onClick={() => setBaselineRate(String(v))}
                >
                  {v}%
                </button>
              ))}
            </div>
            <TextField
              label=""
              labelHidden
              type="number"
              value={baselineRate}
              onChange={setBaselineRate}
              suffix="%"
              min={0.01}
              max={100}
            />
          </div>

          {mode === 'sample' && (
          <div>
            <Text variant="bodyMd" fontWeight="medium" as="p" tone="subdued">Minimum detectable effect (MDE)</Text>
            <div className="sample-size-presets-row">
              {MDE_PRESETS.map(v => (
                <button
                  key={v}
                  type="button"
                  className={`sample-size-preset ${minimumEffect === String(v) ? 'sample-size-preset-active' : ''}`}
                  onClick={() => setMinimumEffect(String(v))}
                >
                  {v}%
                </button>
              ))}
            </div>
            <TextField
              label=""
              labelHidden
              type="number"
              value={minimumEffect}
              onChange={setMinimumEffect}
              suffix="%"
              helpText="Smallest lift you want to detect (e.g., 20% = 2% → 2.4%)"
              min={1}
              max={100}
            />
          </div>
          )}

          {mode === 'mde' && (
          <TextField
            label="Sample size per variant"
            type="number"
            value={sampleSizePerVariant}
            onChange={setSampleSizePerVariant}
            helpText="Number of visitors per variant (e.g., 1000)"
            min={10}
            max={10000000}
          />
          )}

          <div>
            <Text variant="bodyMd" fontWeight="medium" as="p" tone="subdued">Confidence Level (%)</Text>
            <div className="sample-size-presets-row">
              {CONFIDENCE_PRESETS.map(v => (
                <button
                  key={v}
                  type="button"
                  className={`sample-size-preset ${confidenceLevel === String(v) ? 'sample-size-preset-active' : ''}`}
                  onClick={() => setConfidenceLevel(String(v))}
                >
                  {v}%
                </button>
              ))}
            </div>
            <TextField
              label=""
              labelHidden
              type="number"
              value={confidenceLevel}
              onChange={setConfidenceLevel}
              suffix="%"
              helpText="Statistical confidence (typically 95%)"
              min={90}
              max={99}
            />
          </div>

          <div>
            <Text variant="bodyMd" fontWeight="medium" as="p" tone="subdued">Statistical Power (%)</Text>
            <div className="sample-size-presets-row">
              {POWER_PRESETS.map(v => (
                <button
                  key={v}
                  type="button"
                  className={`sample-size-preset ${power === String(v) ? 'sample-size-preset-active' : ''}`}
                  onClick={() => setPower(String(v))}
                >
                  {v}%
                </button>
              ))}
            </div>
            <TextField
              label=""
              labelHidden
              type="number"
              value={power}
              onChange={setPower}
              suffix="%"
              helpText="Probability of detecting a real effect (typically 80%)"
              min={70}
              max={95}
            />
          </div>

          {mode === 'sample' && (
          <TextField
            label="Daily visitors (for duration estimate)"
            type="number"
            value={dailyVisitors}
            onChange={setDailyVisitors}
            helpText="Approximate visitors per day to your test pages"
            min={10}
            max={1000000}
          />
          )}
        </BlockStack>
      </div>

        {mode === 'sample' && result && (
          <div className={embedded ? 'sample-size-result' : ''}>
          <Card sectioned>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h3">
                Required Sample Size
              </Text>
              <BlockStack gap="100">
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">
                    Per Variant:
                  </Text>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    {result.perVariant.toLocaleString()} visitors
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">
                    Total (Both Variants):
                  </Text>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    {result.total.toLocaleString()} visitors
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">
                    Estimated Duration:
                  </Text>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    {formatDuration(result.estimatedDays)} (at {result.dailyVisitors?.toLocaleString() || 100}/day)
                  </Text>
                </InlineStack>
              </BlockStack>
              <Text variant="bodySm" color="subdued" as="p" style={{ marginTop: '1rem' }}>
                💡 Tip: Run tests for at least 1-2 weeks to account for weekly patterns
              </Text>
            </BlockStack>
          </Card>
          </div>
        )}

        {mode === 'mde' && mdeResult && (
          <div className={embedded ? 'sample-size-result' : ''}>
            <Card sectioned>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h3">
                  Detectable Effect
                </Text>
                <BlockStack gap="100">
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" as="p">Minimum detectable effect:</Text>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      {mdeResult.mdePercent}%
                    </Text>
                  </InlineStack>
                  <Text variant="bodySm" color="subdued" as="p">
                    With {sampleSizePerVariant} visitors per variant at {baselineRate}% baseline, you can detect a lift of {mdeResult.mdePercent}% or more (e.g., {baselineRate}% → {(parseFloat(baselineRate) * (1 + mdeResult.mdePercent / 100)).toFixed(2)}%).
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </div>
        )}
      </BlockStack>
  );

  if (embedded) {
    return <div className={className || 'sample-size-calculator-embedded'} data-embedded="true">{formContent}</div>;
  }

  return (
    <Card>
      {formContent}
    </Card>
  );
}

export default SampleSizeCalculator;
