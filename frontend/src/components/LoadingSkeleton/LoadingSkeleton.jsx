/**
 * Loading Skeleton Component
 * 
 * Provides a modern loading skeleton UI for better UX
 */

import React from 'react';
import { Card, BlockStack, InlineStack } from '@shopify/polaris';
import './LoadingSkeleton.css';

export function LoadingSkeleton({ type = 'card', count = 1 }) {
  const skeletons = Array.from({ length: count }, (_, i) => (
    <div key={i} className={`skeleton skeleton-${type}`}>
      {type === 'card' && (
        <Card>
          <BlockStack gap="300">
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line skeleton-text" />
            <div className="skeleton-line skeleton-text short" />
          </BlockStack>
        </Card>
      )}
      {type === 'table' && (
        <div className="skeleton-table">
          <div className="skeleton-line skeleton-header" />
          {Array.from({ length: 3 }, (_, j) => (
            <div key={j} className="skeleton-row">
              <div className="skeleton-line skeleton-cell" />
              <div className="skeleton-line skeleton-cell" />
              <div className="skeleton-line skeleton-cell short" />
            </div>
          ))}
        </div>
      )}
      {type === 'metric' && (
        <div className="skeleton-metric">
          <div className="skeleton-line skeleton-label" />
          <div className="skeleton-line skeleton-value" />
        </div>
      )}
    </div>
  ));

  return <>{skeletons}</>;
}

export default LoadingSkeleton;

