/**
 * Sample Size Calculator Component
 *
 * Calculates required sample size for AB tests.
 * Includes MDE reverse calculator: given sample size, compute detectable effect.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, TextField } from '@shopify/polaris';
import styles from './SampleSizeCalculator.module.css';

const MDE_PRESETS = [5, 10, 15, 20, 30, 50];
const BASELINE_PRESETS = [0.5, 1, 2, 3, 5, 10, 15, 20];
const CONFIDENCE_PRESETS = [90, 95, 99];
const POWER_PRESETS = [80, 90, 95];

const Z_SCORES = { 0.9: 1.645, 0.95: 1.96, 0.99: 2.576 };
const POWER_Z = { 0.8: 0.84, 0.9: 1.28, 0.95: 1.645 };

function getZAlpha(confidence) {
  const c = confidence / 100;
  if (Z_SCORES[c]) return Z_SCORES[c];
  if (c <= 0.9) return 1.645;
  if (c >= 0.99) return 2.576;
  return 1.96;
}

function SampleSizeCalculator({
  onCalculate,
  embedded,
  initialValues = {},
  className,
  primaryMetricLabel,
  primaryMetricType,
  onDesignChange,
  embeddedHideDesignControls = false,
}) {
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

  const updateConfidenceLevel = useCallback(
    value => {
      setConfidenceLevel(value);
      onDesignChange?.({ confidenceLevel: value });
    },
    [onDesignChange]
  );

  const updatePower = useCallback(
    value => {
      setPower(value);
      onDesignChange?.({ power: value });
    },
    [onDesignChange]
  );

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
    let lo = 0.001,
      hi = 5;
    for (let i = 0; i < 50; i++) {
      const effect = (lo + hi) / 2;
      const p2 = baseline * (1 + effect);
      const pBar = (baseline + p2) / 2;
      const num =
        Math.pow(zAlpha + zBeta, 2) *
        (pBar * (1 - pBar) + baseline * (1 - baseline) + p2 * (1 - p2));
      const den = Math.pow(p2 - baseline, 2);
      if (den <= 0 || !Number.isFinite(num)) {
        setMdeResult(null);
        return;
      }
      const calcN = Math.ceil(num / den);
      if (calcN <= n) hi = effect;
      else lo = effect;
    }
    const mdePercent = (((lo + hi) / 2) * 100).toFixed(1);
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

  const preset = (value, current, setter, label) => (
    <button
      key={value}
      type="button"
      className={`${styles.preset} ${current === String(value) ? styles.presetActive : ''}`}
      onClick={() => setter(String(value))}
      aria-pressed={current === String(value)}
      aria-label={`${label}: ${value}%`}
    >
      {value}%
    </button>
  );

  const formContent = (
    <div className={`${styles.root} ${embedded ? styles.rootEmbedded : ''}`}>
      {embedded && (
        <div className={styles.embeddedIntro}>
          <p className={styles.embeddedIntroText}>
            Estimate visitors needed for significance. Results update as you change inputs.
          </p>
          {primaryMetricType && primaryMetricType !== 'conversion_rate' && (
            <p className={styles.metricCaveat}>
              Planning uses a conversion-rate model. Use it as a traffic estimate for{' '}
              {primaryMetricLabel || 'this primary metric'}, then judge the winner by the selected
              business metric.
            </p>
          )}
          <div className={styles.modeToggle} role="group" aria-label="Calculator mode">
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === 'sample' ? styles.modeBtnActive : ''}`}
              onClick={() => setMode('sample')}
              aria-pressed={mode === 'sample'}
            >
              Sample size
            </button>
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === 'mde' ? styles.modeBtnActive : ''}`}
              onClick={() => setMode('mde')}
              aria-pressed={mode === 'mde'}
            >
              MDE from sample size
            </button>
          </div>
        </div>
      )}

      {!embedded && (
        <>
          <h2 className={styles.standaloneTitle}>Sample Size Calculator</h2>
          <p className={styles.standaloneSubtitle}>
            Calculate the minimum number of visitors needed for statistically significant results.
            Results update automatically as you type.
          </p>
          <div className={styles.modeToggle} role="group" aria-label="Calculator mode">
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === 'sample' ? styles.modeBtnActive : ''}`}
              onClick={() => setMode('sample')}
              aria-pressed={mode === 'sample'}
            >
              Sample size
            </button>
            <button
              type="button"
              className={`${styles.modeBtn} ${mode === 'mde' ? styles.modeBtnActive : ''}`}
              onClick={() => setMode('mde')}
              aria-pressed={mode === 'mde'}
            >
              MDE from sample size
            </button>
          </div>
        </>
      )}

      <div className={embedded ? styles.inputsGrid : styles.inputsStack}>
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Baseline conversion rate</p>
          <div className={styles.presetRow}>
            {BASELINE_PRESETS.map(v => preset(v, baselineRate, setBaselineRate, 'Baseline'))}
          </div>
          <div className={styles.inputWrap}>
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
        </div>

        {mode === 'sample' && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Minimum detectable effect (MDE)</p>
            <div className={styles.presetRow}>
              {MDE_PRESETS.map(v => preset(v, minimumEffect, setMinimumEffect, 'MDE'))}
            </div>
            <div className={styles.inputWrap}>
              <TextField
                label=""
                labelHidden
                type="number"
                value={minimumEffect}
                onChange={setMinimumEffect}
                suffix="%"
                helpText="Smallest lift to detect (e.g., 20% = 2% → 2.4%)"
                min={1}
                max={100}
              />
            </div>
          </div>
        )}

        {mode === 'mde' && (
          <div className={styles.section}>
            <div className={styles.inputWrap}>
              <TextField
                label="Sample size per variant"
                type="number"
                value={sampleSizePerVariant}
                onChange={setSampleSizePerVariant}
                helpText="Visitors per variant (e.g., 1000)"
                min={10}
                max={10000000}
              />
            </div>
          </div>
        )}

        {!embeddedHideDesignControls && (
          <>
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Confidence level</p>
              <div className={styles.presetRow}>
                {CONFIDENCE_PRESETS.map(v =>
                  preset(v, confidenceLevel, updateConfidenceLevel, 'Confidence')
                )}
              </div>
              <div className={styles.inputWrap}>
                <TextField
                  label=""
                  labelHidden
                  type="number"
                  value={confidenceLevel}
                  onChange={updateConfidenceLevel}
                  suffix="%"
                  helpText="Typically 95%"
                  min={90}
                  max={99}
                />
              </div>
            </div>

            <div className={styles.section}>
              <p className={styles.sectionLabel}>Statistical power</p>
              <div className={styles.presetRow}>
                {POWER_PRESETS.map(v => preset(v, power, updatePower, 'Power'))}
              </div>
              <div className={styles.inputWrap}>
                <TextField
                  label=""
                  labelHidden
                  type="number"
                  value={power}
                  onChange={updatePower}
                  suffix="%"
                  helpText="Typically 80%"
                  min={70}
                  max={95}
                />
              </div>
            </div>
          </>
        )}

        {mode === 'sample' && (
          <div className={styles.section}>
            <div className={styles.inputWrap}>
              <TextField
                label="Daily visitors (for duration)"
                type="number"
                value={dailyVisitors}
                onChange={setDailyVisitors}
                helpText="Approximate visitors per day to test pages"
                min={10}
                max={1000000}
              />
            </div>
          </div>
        )}
      </div>

      {mode === 'sample' && result && (
        <div className={styles.resultCard}>
          <div className={styles.resultInner}>
            <h3 className={styles.resultTitle}>Required sample size</h3>
            <div className={styles.resultRows}>
              <div className={styles.resultRow}>
                <span className={styles.resultLabel}>Per variant</span>
                <span className={styles.resultValue}>
                  {result.perVariant.toLocaleString()} visitors
                </span>
              </div>
              <div className={styles.resultRow}>
                <span className={styles.resultLabel}>Total (both variants)</span>
                <span className={styles.resultValue}>{result.total.toLocaleString()} visitors</span>
              </div>
              <div className={styles.resultRow}>
                <span className={styles.resultLabel}>Estimated duration</span>
                <span className={styles.resultValue}>
                  {formatDuration(result.estimatedDays)} at{' '}
                  {result.dailyVisitors?.toLocaleString() || 100}/day
                </span>
              </div>
            </div>
            <p className={styles.resultTip}>
              Tip: Run tests at least 1–2 weeks to account for weekly patterns.
            </p>
          </div>
        </div>
      )}

      {mode === 'mde' && mdeResult && (
        <div className={styles.resultCard}>
          <div className={styles.resultInner}>
            <h3 className={styles.resultTitle}>Detectable effect</h3>
            <div className={styles.resultRows}>
              <div className={styles.resultRow}>
                <span className={styles.resultLabel}>Minimum detectable effect</span>
                <span className={styles.resultValue}>{mdeResult.mdePercent}%</span>
              </div>
            </div>
            <p className={styles.resultExplanation}>
              With {sampleSizePerVariant} visitors per variant at {baselineRate}% baseline, you can
              detect a lift of {mdeResult.mdePercent}% or more (e.g., {baselineRate}% →{' '}
              {(parseFloat(baselineRate) * (1 + mdeResult.mdePercent / 100)).toFixed(2)}%).
            </p>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className={className || undefined} data-embedded="true">
        {formContent}
      </div>
    );
  }

  return (
    <Card>
      <div className={styles.standaloneCard}>{formContent}</div>
    </Card>
  );
}

export default SampleSizeCalculator;
