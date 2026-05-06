/**
 * MetricCard Component
 *
 * Reusable metric card component for displaying key metrics
 * Used across Dashboard, Analytics, and other pages
 */

import React from 'react';
import { BlockStack, InlineStack, Text } from '@shopify/polaris';
import TooltipWrapper from './TooltipWrapper';
import { useAnimatedCounter } from '../../hooks';

/**
 * MetricCard - Displays a metric with title, value, subtitle, and optional trend
 *
 * @param {string} title - The metric title
 * @param {string|number} value - The main metric value
 * @param {string} subtitle - Optional subtitle text
 * @param {number} trend - Optional trend percentage (positive/negative)
 * @param {string} variant - Optional variant: 'default', 'success', 'warning', 'info'
 * @param {string} tooltip - Optional tooltip text on hover
 * @param {boolean} animated - When true, animates numeric values with count-up effect
 * @param {string} format - When animated: 'number' (toLocaleString), 'currency' ($), 'plain'
 */
function MetricCard({
  title,
  value,
  subtitle,
  trend,
  variant = 'default',
  tooltip,
  animated = false,
  format = 'number',
}) {
  const isNumeric = typeof value === 'number';
  const shouldAnimate = animated && isNumeric;
  const animatedVal = useAnimatedCounter(shouldAnimate ? value : 0, 800, shouldAnimate);
  const displayValue = shouldAnimate
    ? format === 'currency'
      ? `$${Number(animatedVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : format === 'plain'
        ? animatedVal
        : Number(animatedVal).toLocaleString()
    : value;

  const getTrendColor = trendValue => {
    if (trendValue > 0) return 'success';
    if (trendValue < 0) return 'critical';
    return 'subdued';
  };

  const getTrendIcon = trendValue => {
    if (trendValue > 0) return '↑';
    if (trendValue < 0) return '↓';
    return '→';
  };

  const card = (
    <div className={`metric-card ${variant !== 'default' ? `metric-card-${variant}` : ''}`}>
      <BlockStack gap="200">
        <Text variant="bodyMd" color="subdued" as="p" fontWeight="medium">
          {title}
        </Text>
        <Text variant="heading2xl" as="p" fontWeight="bold" tone="base">
          {displayValue}
        </Text>
        {subtitle && (
          <Text variant="bodySm" color="subdued" as="p">
            {subtitle}
          </Text>
        )}
        {trend !== undefined && trend !== null && (
          <InlineStack gap="100" align="start">
            <Text variant="bodySm" color={getTrendColor(trend)} as="span">
              {getTrendIcon(trend)} {Math.abs(trend)}%
            </Text>
          </InlineStack>
        )}
      </BlockStack>
    </div>
  );

  return tooltip ? (
    <TooltipWrapper content={tooltip} accessibilityLabel={title}>
      <span style={{ display: 'block' }}>{card}</span>
    </TooltipWrapper>
  ) : (
    card
  );
}

export default React.memo(MetricCard);
