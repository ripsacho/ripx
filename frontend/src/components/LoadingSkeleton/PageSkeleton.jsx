/**
 * PageSkeleton - Route-specific loading skeletons
 *
 * Provides contextual loading states for Dashboard, TestList, Analytics, and default.
 */
import React from 'react';
import { Card, Layout } from '@shopify/polaris';
import LoadingSkeleton from './LoadingSkeleton';
import pageShell from '../Shared/PageShell.module.css';
import './LoadingSkeleton.css';

function DashboardSkeleton() {
  return (
    <div
      className={pageShell.page}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="skeleton-page-hero" />
      <Layout>
        <Layout.Section>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
            }}
          >
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton-metric-card">
                <div className="skeleton-line skeleton-label" />
                <div className="skeleton-line skeleton-value" />
              </div>
            ))}
          </div>
        </Layout.Section>
        <Layout.Section>
          <div className="skeleton-chart" />
        </Layout.Section>
      </Layout>
    </div>
  );
}

function TestListSkeleton() {
  return (
    <div
      className={pageShell.page}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="skeleton-page-hero" style={{ height: 80 }} />
      <Card>
        <LoadingSkeleton type="table" count={1} />
      </Card>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div
      className={pageShell.page}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="skeleton-page-hero" />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton-metric-card">
            <div className="skeleton-line skeleton-label" />
            <div className="skeleton-line skeleton-value" />
          </div>
        ))}
      </div>
      <div className="skeleton-chart" />
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div
      className={pageShell.page}
      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
    >
      <LoadingSkeleton type="card" count={2} />
    </div>
  );
}

export function PageSkeleton({ variant = 'default' }) {
  switch (variant) {
    case 'dashboard':
      return <DashboardSkeleton />;
    case 'testList':
      return <TestListSkeleton />;
    case 'analytics':
      return <AnalyticsSkeleton />;
    default:
      return <DefaultSkeleton />;
  }
}

export default PageSkeleton;
