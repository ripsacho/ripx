/**
 * Analytics Overview Component
 * 
 * General analytics dashboard showing performance across all tests
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Page,
  Card,
  Layout,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  Button,
  EmptyState
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import Toast from '../Toast/Toast';
import { apiGet } from '../../services';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import { MetricCard, MetricGrid } from '../Shared';
import { TEST_TYPE_ICONS } from '../../constants';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

function AnalyticsOverview() {
  const navigate = useNavigate();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const testsPerPage = 5;

  const fetchTests = useCallback(async () => {
    try {
      setLoading(true);
      
      const response = await apiGet('/tests');
      const testData = response.data?.tests || response.data?.data?.tests || [];
      setTests(testData);
      setError(null);
    } catch (err) {
      // Log error details for debugging (only in development)
      if (import.meta.env.DEV) {
        console.error('Error fetching tests:', err);
      }
      setError(err.response?.data?.error || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTests();
  }, [fetchTests]);

  const getStatusBadge = (status) => {
    const statusMap = {
      draft: { status: 'info', label: 'Draft' },
      running: { status: 'success', label: 'Running' },
      stopped: { status: 'warning', label: 'Stopped' },
      completed: { status: 'complete', label: 'Completed' }
    };
    
    const config = statusMap[status] || { status: 'info', label: status };
    return <Badge status={config.status}>{config.label}</Badge>;
  };

  const getTypeIcon = (type) => {
    return TEST_TYPE_ICONS[type] || TEST_TYPE_ICONS.default;
  };

  const getHealthBadge = (health) => {
    if (!health) return null;
    const colorMap = {
      excellent: 'success',
      good: 'attention',
      fair: 'warning',
      poor: 'critical'
    };
    return (
      <InlineStack gap="100" align="start">
        <Badge status={colorMap[health.healthLevel] || 'info'}>
          {health.score}/100
        </Badge>
      </InlineStack>
    );
  };

  // Calculate aggregate metrics (memoized)
  const aggregateMetrics = useMemo(() => tests.reduce((acc, test) => {
    if (test.variants && Array.isArray(test.variants)) {
      test.variants.forEach(variant => {
        acc.totalVisitors += variant.visitors || 0;
        acc.totalConversions += variant.conversions || 0;
        acc.totalRevenue += variant.revenue || 0;
      });
    }
    return acc;
  }, { totalVisitors: 0, totalConversions: 0, totalRevenue: 0 }), [tests]);

  const overallConversionRate = useMemo(() => aggregateMetrics.totalVisitors > 0
    ? (aggregateMetrics.totalConversions / aggregateMetrics.totalVisitors * 100).toFixed(2)
    : 0, [aggregateMetrics]);

  const activeTests = tests.filter(t => t.status === 'running').length;
  const completedTests = tests.filter(t => t.status === 'completed').length;

  // Get paginated tests (memoized)
  const paginatedTests = useMemo(() => {
    const sortedTests = [...tests].sort((a, b) => 
      new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    const startIndex = (currentPage - 1) * testsPerPage;
    return sortedTests.slice(startIndex, startIndex + testsPerPage);
  }, [tests, currentPage]);

  const totalPages = Math.ceil(tests.length / testsPerPage);

  const TestCard = ({ test }) => {
    const handleCardClick = () => {
      navigate(`/tests/${test.id}/analytics`);
    };

    // Calculate performance metrics
    const totalVisitors = test.variants?.reduce((sum, v) => sum + (v.visitors || 0), 0) || 0;
    const totalConversions = test.variants?.reduce((sum, v) => sum + (v.conversions || 0), 0) || 0;
    const totalRevenue = test.variants?.reduce((sum, v) => sum + (v.revenue || 0), 0) || 0;
    const conversionRate = totalVisitors > 0 ? (totalConversions / totalVisitors * 100) : 0;
    const variantCount = test.variants?.length || 0;

    return (
      <div 
        className="test-card-overview" 
        data-status={test.status}
        onClick={handleCardClick}
        style={{ cursor: 'pointer' }}
      >
        <BlockStack gap="400">
          {/* Header Section */}
          <InlineStack align="space-between" blockAlign="start">
            <BlockStack gap="200">
              <InlineStack gap="300" align="center">
                <div style={{ 
                  fontSize: '1.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '48px',
                  height: '48px',
                  borderRadius: '10px',
                  background: 'var(--bg-tertiary)',
                  flexShrink: 0
                }}>
                  {getTypeIcon(test.type)}
                </div>
                <BlockStack gap="100">
                  <Text variant="bodyMd" fontWeight="semibold" as="span">
                    {test.name}
                  </Text>
                  <Text variant="bodySm" color="subdued" as="p">
                    {test.type} • {variantCount} variant{variantCount !== 1 ? 's' : ''} • Created {new Date(test.created_at).toLocaleDateString()}
                  </Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
            <InlineStack gap="200" blockAlign="start">
              {getStatusBadge(test.status)}
              {getHealthBadge(test.health)}
            </InlineStack>
          </InlineStack>

          {/* Performance Metrics - Always Show */}
          <div style={{
            padding: '1rem 1.25rem',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-secondary)'
          }}>
            {totalVisitors > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '1.5rem',
                alignItems: 'start'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Text variant="bodySm" color="subdued" as="span">
                    👥 Visitors
                  </Text>
                  <Text variant="bodyLg" fontWeight="semibold" as="span">
                    {totalVisitors.toLocaleString()}
                  </Text>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Text variant="bodySm" color="subdued" as="span">
                    ✅ Conversions
                  </Text>
                  <Text variant="bodyLg" fontWeight="semibold" as="span">
                    {totalConversions.toLocaleString()}
                  </Text>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Text variant="bodySm" color="subdued" as="span">
                    📈 Rate
                  </Text>
                  <Text variant="bodyLg" fontWeight="semibold" as="span" tone={conversionRate > 5 ? 'success' : conversionRate > 2 ? 'base' : 'subdued'}>
                    {conversionRate.toFixed(2)}%
                  </Text>
                </div>
                {totalRevenue > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <Text variant="bodySm" color="subdued" as="span">
                      💰 Revenue
                    </Text>
                    <Text variant="bodyLg" fontWeight="semibold" as="span" tone="success">
                      ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '1.5rem',
                alignItems: 'start'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Text variant="bodySm" color="subdued" as="span">
                    👥 Visitors
                  </Text>
                  <Text variant="bodyLg" fontWeight="semibold" as="span">
                    0
                  </Text>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Text variant="bodySm" color="subdued" as="span">
                    ✅ Conversions
                  </Text>
                  <Text variant="bodyLg" fontWeight="semibold" as="span">
                    0
                  </Text>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Text variant="bodySm" color="subdued" as="span">
                    📈 Rate
                  </Text>
                  <Text variant="bodyLg" fontWeight="semibold" as="span" color="subdued">
                    0.00%
                  </Text>
                </div>
                {test.status === 'running' && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    gridColumn: 'span 1'
                  }}>
                    <Text variant="bodySm" color="subdued" as="span">
                      ⏳ Waiting for traffic...
                    </Text>
                  </div>
                )}
              </div>
            )}
          </div>
        </BlockStack>
      </div>
    );
  };

  const chartData = tests
    .filter(test => test.status === 'running' && test.variants && test.variants.length > 0)
    .map(test => {
      const totalVisitors = test.variants.reduce((sum, v) => sum + (v.visitors || 0), 0);
      const totalConversions = test.variants.reduce((sum, v) => sum + (v.conversions || 0), 0);
      const conversionRate = totalVisitors > 0 ? (totalConversions / totalVisitors * 100) : 0;
      
      return {
        name: test.name.length > 15 ? test.name.substring(0, 15) + '...' : test.name,
        'Conversion Rate': parseFloat(conversionRate.toFixed(2)),
        'Visitors': totalVisitors
      };
    });

  if (loading) {
    return (
      <Page title="Analytics Overview">
        <Card sectioned>
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Text as="p" color="subdued">Loading analytics...</Text>
          </div>
        </Card>
      </Page>
    );
  }

  if (error) {
    return (
      <>
        <Toast
          message={error}
          type="error"
          onClose={() => setError(null)}
          duration={5000}
        />
        <Page title="Analytics Overview" />
      </>
    );
  }

  return (
    <>
      <Toast
        message={error}
        type="error"
        onClose={() => setError(null)}
        duration={5000}
      />

      <Page title="Analytics Overview">
      <Layout>
        {/* Summary Metrics */}
        <Layout.Section>
          <MetricGrid>
            <MetricCard
              title="Total Tests"
              value={tests.length}
              subtitle={`${activeTests} active, ${completedTests} completed`}
            />
            <MetricCard
              title="Total Visitors"
              value={aggregateMetrics.totalVisitors.toLocaleString()}
              subtitle="Across all tests"
            />
            <MetricCard
              title="Total Conversions"
              value={aggregateMetrics.totalConversions.toLocaleString()}
              subtitle={`${overallConversionRate}% conversion rate`}
            />
            <MetricCard
              title="Total Revenue"
              value={`$${aggregateMetrics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              subtitle="From all tests"
            />
          </MetricGrid>
        </Layout.Section>

        {/* Charts */}
        {chartData.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingLg" as="h2">
                  Active Tests Performance
                </Text>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                    <XAxis dataKey="name" stroke="var(--text-secondary)" />
                    <YAxis stroke="var(--text-secondary)" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--bg-secondary)', 
                        border: '1px solid var(--border-primary)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)'
                      }}
                    />
                    <Legend />
                    <Bar dataKey="Conversion Rate" fill="var(--accent-primary)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* All Tests Performance */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">
                    All Tests Performance
                  </Text>
                  <Text variant="bodySm" color="subdued" as="p">
                    Showing {paginatedTests.length} of {tests.length} tests
                  </Text>
                </BlockStack>
                <InlineStack gap="200">
                  <Button onClick={() => navigate('/tests')} variant="secondary">
                    View All Tests
                  </Button>
                  <Button onClick={() => navigate('/tests/new')}>
                    Create Test
                  </Button>
                </InlineStack>
              </InlineStack>

              {loading ? (
                <LoadingSkeleton type="table" count={3} />
              ) : tests.length === 0 ? (
                <EmptyState
                  heading="Create your first AB test"
                  action={{
                    content: 'Create Test',
                    onAction: () => navigate('/tests/new')
                  }}
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Start optimizing your store by creating an AB test. Test prices, content, shipping, and more to maximize conversions.</p>
                </EmptyState>
              ) : (
                <BlockStack gap="500">
                  {paginatedTests.map((test) => (
                    <TestCard key={test.id} test={test} />
                  ))}
                  
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <InlineStack align="center" blockAlign="center" gap="200">
                      <Button
                        plain
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <Text variant="bodySm" color="subdued" as="span">
                        Page {currentPage} of {totalPages}
                      </Text>
                      <Button
                        plain
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </InlineStack>
                  )}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
    </>
  );
}

export default AnalyticsOverview;

