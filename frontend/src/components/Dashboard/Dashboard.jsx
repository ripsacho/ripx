/**
 * Dashboard Component
 * 
 * Main dashboard with Intelligems-style metrics and test overview
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Page,
  Card,
  DataTable,
  Button,
  Badge,
  EmptyState,
  Layout,
  BlockStack,
  InlineStack,
  Text,
  ProgressBar,
  Icon
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { setupDataTableButtonStyling } from '../../utils/dataTableStyles';
import Toast from '../Toast/Toast';
import { apiGet, apiPost, apiDelete } from '../../services';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import { MetricCard, MetricGrid } from '../Shared';
import { TEST_STATUS_OPTIONS, TEST_TYPE_ICONS } from '../../constants';

function Dashboard() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const testsPerPage = 5;
  const [stats, setStats] = useState({
    totalTests: 0,
    activeTests: 0,
    totalVisitors: 0,
    totalRevenue: 0
  });
  const navigate = useNavigate();

  const fetchTests = useCallback(async () => {
    try {
      setLoading(true);
      
      const response = await apiGet('/tests');
      const testData = response.data?.tests || response.data?.data?.tests || [];
      setTests(testData);
      
      // Calculate stats from test data (optimized with reduce)
      const stats = testData.reduce((acc, test) => {
        acc.totalTests += 1;
        if (test.status === 'running') {
          acc.activeTests += 1;
        }
        
        if (test.variants && Array.isArray(test.variants)) {
          test.variants.forEach(variant => {
            acc.totalVisitors += variant.visitors || 0;
            acc.totalRevenue += variant.revenue || 0;
          });
        }
        
        return acc;
      }, {
        totalTests: 0,
        activeTests: 0,
        totalVisitors: 0,
        totalRevenue: 0
      });
      
      setStats(stats);
      
      setError(null);
    } catch (err) {
      // Log error details for debugging (only in development)
      if (import.meta.env.DEV) {
        console.error('Error fetching tests:', err);
      }
      setError(err.response?.data?.error || 'Failed to load tests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTests();
  }, [fetchTests]);

  // Force dark theme styles for DataTable buttons
  useEffect(() => {
    return setupDataTableButtonStyling();
  }, [tests]);

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


  const handleSelectionChange = useCallback((selected) => {
    setSelectedTests(selected);
  }, []);

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
      navigate(`/tests/${test.id}`);
    };

    return (
      <div 
        className="test-card-overview" 
        onClick={handleCardClick}
        style={{ cursor: 'pointer' }}
      >
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="start">
            <BlockStack gap="100">
              <InlineStack gap="200" align="center">
                <div style={{ fontSize: '1.5rem' }}>
                  {getTypeIcon(test.type)}
                </div>
                <Text variant="bodyMd" fontWeight="semibold" as="span">
                  {test.name}
                </Text>
              </InlineStack>
              <Text variant="bodySm" color="subdued" as="p">
                {test.type} • Created {new Date(test.created_at).toLocaleDateString()}
              </Text>
            </BlockStack>
            <InlineStack gap="100">
              {getStatusBadge(test.status)}
              {getHealthBadge(test.health)}
            </InlineStack>
          </InlineStack>
        </BlockStack>
      </div>
    );
  };


  return (
    <>
      <Toast
        message={error}
        type="error"
        onClose={() => setError(null)}
        duration={5000}
      />

      <Page
        title="AB Testing Dashboard"
      >
        <Layout>
        {/* Metrics Cards - Intelligems Style */}
        <Layout.Section>
          <BlockStack gap="400">
            <MetricGrid>
              <MetricCard
                title="Total Tests"
                value={stats.totalTests}
                subtitle={`${stats.activeTests} active`}
              />
              <MetricCard
                title="Active Tests"
                value={stats.activeTests}
                subtitle="Currently running"
              />
              <MetricCard
                title="Total Visitors"
                value={stats.totalVisitors.toLocaleString()}
                subtitle="Across all tests"
              />
              <MetricCard
                title="Revenue Impact"
                value={`$${stats.totalRevenue.toLocaleString()}`}
                subtitle="From tests"
              />
            </MetricGrid>
          </BlockStack>
        </Layout.Section>

        {/* Quick Actions */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                Quick Start
              </Text>
              <div className="grid-responsive-sm">
                <Button
                  fullWidth
                  onClick={() => {
                    const params = new URLSearchParams({ type: 'pricing', testTypeId: 'pricing' });
                    navigate(`/tests/new?${params.toString()}`);
                  }}
                >
                  💰 Pricing
                </Button>
                <Button
                  fullWidth
                  onClick={() => {
                    const params = new URLSearchParams({ type: 'content', testTypeId: 'onsite-edit' });
                    navigate(`/tests/new?${params.toString()}`);
                  }}
                >
                  ✏️ Onsite Edit
                </Button>
                <Button
                  fullWidth
                  onClick={() => {
                    const params = new URLSearchParams({ type: 'shipping', testTypeId: 'shipping' });
                    navigate(`/tests/new?${params.toString()}`);
                  }}
                >
                  🚚 Shipping
                </Button>
                <Button
                  fullWidth
                  onClick={() => {
                    const params = new URLSearchParams({ type: 'offer', testTypeId: 'offer' });
                    navigate(`/tests/new?${params.toString()}`);
                  }}
                >
                  🎁 Offer
                </Button>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Recent Tests Overview */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">
                    Recent Tests
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
                <BlockStack gap="300">
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

        {/* Recent Activity or Tips */}
        <Layout.Section secondary>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                Tips & Best Practices
              </Text>
              <BlockStack gap="200">
                <div>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    📊 Sample Size Matters
                  </Text>
                  <Text variant="bodySm" color="subdued" as="p">
                    Wait for at least 100 visitors per variant before making decisions.
                  </Text>
                </div>
                <div>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    ⏱️ Test Duration
                  </Text>
                  <Text variant="bodySm" color="subdued" as="p">
                    Run tests for at least 1-2 weeks to account for weekly patterns.
                  </Text>
                </div>
                <div>
                  <Text variant="bodyMd" fontWeight="semibold" as="p">
                    🎯 One Variable at a Time
                  </Text>
                  <Text variant="bodySm" color="subdued" as="p">
                    Test one variable per experiment for clear, actionable results.
                  </Text>
                </div>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

    </Page>
    </>
  );
}

export default Dashboard;
