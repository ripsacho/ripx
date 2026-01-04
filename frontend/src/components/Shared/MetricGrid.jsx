/**
 * MetricGrid Component
 * 
 * Reusable grid container for metric cards
 * Provides consistent spacing and responsive layout
 */

import React from 'react';

/**
 * MetricGrid - Responsive grid container for metric cards
 * 
 * @param {React.ReactNode} children - MetricCard components to display
 * @param {string} className - Optional additional CSS classes
 */
function MetricGrid({ children, className = '' }) {
  return (
    <div className={`grid-responsive ${className}`.trim()}>
      {children}
    </div>
  );
}

export default MetricGrid;

