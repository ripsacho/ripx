/**
 * MetricCard Component
 * 
 * Reusable metric card component for displaying key metrics
 * Used across Dashboard, Analytics, and other pages
 */

import React from 'react';
import { BlockStack, InlineStack, Text } from '@shopify/polaris';

/**
 * MetricCard - Displays a metric with title, value, subtitle, and optional trend
 * 
 * @param {string} title - The metric title
 * @param {string|number} value - The main metric value
 * @param {string} subtitle - Optional subtitle text
 * @param {number} trend - Optional trend percentage (positive/negative)
 * @param {string} variant - Optional variant: 'default', 'success', 'warning', 'info'
 */
function MetricCard({ title, value, subtitle, trend, variant = 'default' }) {
  const getTrendColor = (trendValue) => {
    if (trendValue > 0) return 'success';
    if (trendValue < 0) return 'critical';
    return 'subdued';
  };

  const getTrendIcon = (trendValue) => {
    if (trendValue > 0) return '↑';
    if (trendValue < 0) return '↓';
    return '→';
  };

  return (
    <div className={`metric-card ${variant !== 'default' ? `metric-card-${variant}` : ''}`}>
      <BlockStack gap="200">
        <Text variant="bodyMd" color="subdued" as="p" fontWeight="medium">
          {title}
        </Text>
        <Text variant="heading2xl" as="h2" fontWeight="bold" tone="base">
          {value}
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
}

export default React.memo(MetricCard);

