/**
 * Analytics Component
 * 
 * Enhanced analytics dashboard with Intelligems-style metrics and visualizations
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Card,
  Layout,
  DataTable,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  ProgressBar
} from '@shopify/polaris';
import { useParams, useNavigate } from 'react-router-dom';
import Toast from '../Toast/Toast';
import { setupDataTableButtonStyling } from '../../utils/dataTableStyles';
import { apiGet } from '../../services';
import { MetricCard, MetricGrid } from '../Shared';
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
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const COLORS = ['#008060', '#5C6AC4', '#F49342', '#47C1BF', '#B98900'];

function Analytics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [timeSeries, setTimeSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      
      const [analyticsResponse, timeSeriesResponse] = await Promise.all([
        apiGet(`/analytics/tests/${id}`),
        apiGet(`/analytics/tests/${id}/timeseries`).catch(() => ({ data: { timeSeries: [] } })) // Gracefully handle if no time-series data
      ]);
      
      const analyticsData = analyticsResponse.data?.analytics || analyticsResponse.data?.data?.analytics;
      const timeSeriesData = timeSeriesResponse.data?.timeSeries || timeSeriesResponse.data?.data?.timeSeries || [];
      
      setAnalytics(analyticsData);
      setTimeSeries(timeSeriesData);
      setError(null);
    } catch (err) {
      // Log error details for debugging (only in development)
      if (import.meta.env.DEV) {
        console.error('Error fetching analytics:', err);
      }
      setError(err.response?.data?.error || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Force dark theme styles for DataTable buttons
  useEffect(() => {
    return setupDataTableButtonStyling();
  }, [analytics]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Force dark theme styles for DataTable buttons
  useEffect(() => {
    return setupDataTableButtonStyling();
  }, [analytics]);


  if (loading) {
    return (
      <Page title="Analytics" backAction={{ onAction: () => navigate(`/tests/${id}`) }}>
        <Card sectioned>
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <ProgressBar progress={75} />
            <div style={{ marginTop: '1rem' }}>
              <Text as="p" color="subdued">Loading analytics...</Text>
            </div>
          </div>
        </Card>
      </Page>
    );
  }

  if (error || !analytics) {
    return (
      <>
        <Toast
          message={error || 'No analytics data available'}
          type="error"
          onClose={() => setError(null)}
          duration={5000}
        />
        <Page title="Analytics" backAction={{ onAction: () => navigate(`/tests/${id}`) }} />
      </>
    );
  }

  const chartData = analytics.variants.map((v, index) => ({
    name: v.name,
    'Conversion Rate': parseFloat(v.conversionRate.toFixed(2)),
    'Revenue': parseFloat(v.revenue.toFixed(2)),
    'Visitors': v.visitors,
    'Conversions': v.conversions,
    color: COLORS[index % COLORS.length]
  }));

  const pieData = analytics.variants.map((v, index) => ({
    name: v.name,
    value: v.visitors,
    color: COLORS[index % COLORS.length]
  }));

  const tableRows = analytics.variants.map((variant, index) => [
    <InlineStack gap="200" align="start">
      <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: COLORS[index % COLORS.length], marginTop: '4px' }} />
      <Text variant="bodyMd" fontWeight="semibold" as="span">
        {variant.name}
      </Text>
    </InlineStack>,
    variant.visitors.toLocaleString(),
    variant.conversions.toLocaleString(),
    `${variant.conversionRate.toFixed(2)}%`,
    `$${variant.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `$${variant.avgOrderValue.toFixed(2)}`
  ]);

  const winner = analytics.significance?.winner 
    ? analytics.variants.find(v => v.id === analytics.significance.winner)
    : null;

  const totalVisitors = analytics.variants.reduce((sum, v) => sum + v.visitors, 0);
  const totalConversions = analytics.variants.reduce((sum, v) => sum + v.conversions, 0);
  const totalRevenue = analytics.variants.reduce((sum, v) => sum + v.revenue, 0);
  const overallConversionRate = totalVisitors > 0 ? (totalConversions / totalVisitors * 100) : 0;

  return (
    <>
      <Toast
        message={error}
        type="error"
        onClose={() => setError(null)}
        duration={5000}
      />

      <Page 
        title="Test Analytics"
        primaryAction={{
          content: 'Export Results',
          onAction: () => {
            navigate(`/tests/${id}/export`);
          }
        }}
      >
        <Layout>
        {/* Summary Metrics */}
        <Layout.Section>
          <MetricGrid>
            <MetricCard
              title="Total Visitors"
              value={totalVisitors.toLocaleString()}
              subtitle="Across all variants"
            />
            <MetricCard
              title="Total Conversions"
              value={totalConversions.toLocaleString()}
              subtitle={`${overallConversionRate.toFixed(2)}% conversion rate`}
            />
            <MetricCard
              title="Total Revenue"
              value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              subtitle="From all variants"
            />
            {winner && (
              <MetricCard
                title="Winner"
                value={winner.name}
                subtitle={`${analytics.significance.lift}% lift`}
                variant="success"
              />
            )}
          </MetricGrid>
        </Layout.Section>

        {/* Statistical Significance */}
        {analytics.significance && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingLg" as="h2">
                  Statistical Significance
                </Text>
                
                <MetricGrid>
                  <MetricCard
                    title="P-Value"
                    value={analytics.significance.pValue}
                    subtitle={analytics.significance.pValue < 0.05 ? 'Statistically significant' : 'Not yet significant'}
                  />
                  <MetricCard
                    title="Confidence Level"
                    value={`${analytics.significance.confidence}%`}
                    subtitle="Confidence interval"
                  />
                  {analytics.significance.lift && (
                    <MetricCard
                      title="Lift"
                      value={`${analytics.significance.lift > 0 ? '+' : ''}${analytics.significance.lift}%`}
                      subtitle="Improvement over control"
                      variant={analytics.significance.lift > 0 ? 'success' : 'warning'}
                    />
                  )}
                </MetricGrid>

                {winner && (
                  <Card sectioned>
                    <BlockStack gap="200">
                      <Text variant="bodyMd" fontWeight="semibold" as="p">
                        🏆 Winner: {winner.name}
                      </Text>
                      <Text variant="bodySm" as="p">
                        This variant performed best with a {analytics.significance.lift}% lift and {winner.conversionRate.toFixed(2)}% conversion rate.
                      </Text>
                    </BlockStack>
                  </Card>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Time-Series Chart */}
        {timeSeries && timeSeries.length > 0 && (
          <Layout.Section>
            <div className="chart-container">
              <Text variant="headingLg" as="h2" style={{ marginBottom: '1.5rem' }}>
                Performance Over Time
              </Text>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={timeSeries}>
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
                  {analytics.variants.map((variant, index) => (
                    <Line
                      key={variant.id}
                      type="monotone"
                      dataKey={`${variant.name}.conversionRate`}
                      name={`${variant.name} Conversion Rate`}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Layout.Section>
        )}

        {/* Charts */}
        <Layout.Section>
          <div className="chart-container">
            <Text variant="headingLg" as="h2" style={{ marginBottom: '1.5rem' }}>
              Conversion Rate Comparison
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
          </div>
        </Layout.Section>

        <Layout.Section secondary>
          <div className="chart-container">
            <Text variant="headingLg" as="h2" style={{ marginBottom: '1.5rem' }}>
              Traffic Distribution
            </Text>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="var(--accent-primary)"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Layout.Section>

        {/* Detailed Table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingLg" as="h2">
                Variant Performance Details
              </Text>
              <DataTable
                columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
                headings={['Variant', 'Visitors', 'Conversions', 'Conversion Rate', 'Revenue', 'AOV']}
                rows={tableRows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Revenue Impact */}
        {analytics.revenueImpact && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingLg" as="h2">
                  Revenue Impact Analysis
                </Text>
                
                <div className="grid-responsive">
                  <Card sectioned>
                    <BlockStack gap="200">
                      <Text variant="bodyMd" color="subdued" as="p">Control Revenue</Text>
                      <Text variant="heading2xl" as="h2" fontWeight="bold">
                        ${analytics.revenueImpact.controlRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card sectioned>
                    <BlockStack gap="200">
                      <Text variant="bodyMd" color="subdued" as="p">Test Revenue</Text>
                      <Text variant="heading2xl" as="h2" fontWeight="bold">
                        ${analytics.revenueImpact.testRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </BlockStack>
                  </Card>

                  <Card sectioned>
                    <BlockStack gap="200">
                      <Text variant="bodyMd" color="subdued" as="p">Revenue Impact</Text>
                      <Text 
                        variant="heading2xl" 
                        as="h2" 
                        fontWeight="bold"
                        color={analytics.revenueImpact.impact > 0 ? 'success' : 'critical'}
                      >
                        ${analytics.revenueImpact.impact > 0 ? '+' : ''}{analytics.revenueImpact.impact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      <Text variant="bodySm" color="subdued" as="p">
                        {analytics.revenueImpact.impactPercent > 0 ? '+' : ''}{analytics.revenueImpact.impactPercent.toFixed(2)}% change
                      </Text>
                    </BlockStack>
                  </Card>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
    </>
  );
}

export default Analytics;
