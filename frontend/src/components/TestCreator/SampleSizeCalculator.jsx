/**
 * Sample Size Calculator Component
 * 
 * Calculates required sample size for AB tests
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  TextField,
  BlockStack,
  Text,
  InlineStack
} from '@shopify/polaris';

function SampleSizeCalculator({ onCalculate }) {
  const [baselineRate, setBaselineRate] = useState('2');
  const [minimumEffect, setMinimumEffect] = useState('20');
  const [confidenceLevel, setConfidenceLevel] = useState('95');
  const [power, setPower] = useState('80');
  const [result, setResult] = useState(null);

  const calculateSampleSize = useCallback(() => {
    const baseline = parseFloat(baselineRate) / 100;
    const effect = parseFloat(minimumEffect) / 100;
    const confidence = parseFloat(confidenceLevel) / 100;
    const powerValue = parseFloat(power) / 100;

    // Z-scores for common confidence levels
    const zScores = {
      0.90: 1.645,
      0.95: 1.96,
      0.99: 2.576
    };

    // Z-scores for common power levels
    const powerZScores = {
      0.80: 0.84,
      0.90: 1.28,
      0.95: 1.645
    };

    const zAlpha = zScores[confidence] || 1.96;
    const zBeta = powerZScores[powerValue] || 0.84;

    const p1 = baseline;
    const p2 = p1 * (1 + effect);

    // Two-proportion z-test sample size formula
    const pBar = (p1 + p2) / 2;
    const numerator = Math.pow(zAlpha + zBeta, 2) * (pBar * (1 - pBar) + p1 * (1 - p1) + p2 * (1 - p2));
    const denominator = Math.pow(p2 - p1, 2);

    const sampleSize = Math.ceil(numerator / denominator);
    const totalSize = sampleSize * 2; // For both variants

    const calculatedResult = {
      perVariant: sampleSize,
      total: totalSize,
      estimatedDays: Math.ceil(totalSize / 100) // Assuming 100 visitors per day
    };

    setResult(calculatedResult);
    
    if (onCalculate) {
      onCalculate(calculatedResult);
    }
  }, [baselineRate, minimumEffect, confidenceLevel, power, onCalculate]);

  // Real-time calculation on input change (with debouncing)
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only calculate if all values are valid
      const baseline = parseFloat(baselineRate);
      const effect = parseFloat(minimumEffect);
      const confidence = parseFloat(confidenceLevel);
      const powerValue = parseFloat(power);

      if (
        !isNaN(baseline) && baseline > 0 && baseline <= 100 &&
        !isNaN(effect) && effect > 0 && effect <= 100 &&
        !isNaN(confidence) && confidence >= 90 && confidence <= 99 &&
        !isNaN(powerValue) && powerValue >= 70 && powerValue <= 95
      ) {
        calculateSampleSize();
      } else {
        setResult(null);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [baselineRate, minimumEffect, confidenceLevel, power, calculateSampleSize]);

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          Sample Size Calculator
        </Text>
        <Text variant="bodySm" color="subdued" as="p">
          Calculate the minimum number of visitors needed for statistically significant results. Results update automatically as you type.
        </Text>

        <BlockStack gap="300">
          <TextField
            label="Baseline Conversion Rate (%)"
            type="number"
            value={baselineRate}
            onChange={setBaselineRate}
            suffix="%"
            helpText="Current conversion rate"
            min={0.1}
            max={100}
          />

          <TextField
            label="Minimum Detectable Effect (%)"
            type="number"
            value={minimumEffect}
            onChange={setMinimumEffect}
            suffix="%"
            helpText="Minimum improvement you want to detect (e.g., 20% means 2% → 2.4%)"
            min={1}
            max={100}
          />

          <TextField
            label="Confidence Level (%)"
            type="number"
            value={confidenceLevel}
            onChange={setConfidenceLevel}
            suffix="%"
            helpText="Statistical confidence level (typically 95%)"
            min={90}
            max={99}
          />

          <TextField
            label="Statistical Power (%)"
            type="number"
            value={power}
            onChange={setPower}
            suffix="%"
            helpText="Probability of detecting the effect if it exists (typically 80%)"
            min={70}
            max={95}
          />
        </BlockStack>

        {result && (
          <Card sectioned>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h3">
                Required Sample Size
              </Text>
              <BlockStack gap="100">
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">Per Variant:</Text>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    {result.perVariant.toLocaleString()} visitors
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">Total (Both Variants):</Text>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    {result.total.toLocaleString()} visitors
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">Estimated Duration:</Text>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    ~{result.estimatedDays} days (at 100 visitors/day)
                  </Text>
                </InlineStack>
              </BlockStack>
              <Text variant="bodySm" color="subdued" as="p" style={{ marginTop: '1rem' }}>
                💡 Tip: Run tests for at least 1-2 weeks to account for weekly patterns
              </Text>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Card>
  );
}

export default SampleSizeCalculator;

