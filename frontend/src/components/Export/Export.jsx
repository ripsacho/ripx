/**
 * Export Component - Advanced reporting and data export
 *
 * Features: Date range filter, format options, report preview, copy snippet.
 */
import React, { useState, useEffect } from 'react';
import {
  Page,
  Card,
  Button,
  Select,
  BlockStack,
  InlineStack,
  Text,
  Banner,
} from '@shopify/polaris';
import { ExportIcon } from '@shopify/polaris-icons';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '../Shared';
import { useAppRoutes } from '../../hooks';
import { apiGet } from '../../services';
import { getDefaultExportFormat, getDefaultAnalyticsDateRange } from '../../utils/preferences';
import { getDateRangeParams } from '../Analytics/funnelViewUtils';
import styles from './Export.module.css';

const DATE_RANGES = [
  { label: 'All time', value: 'all' },
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
];

function Export({ testId }) {
  const [format, setFormat] = useState(() => getDefaultExportFormat());
  const [dateRange, setDateRange] = useState(() => getDefaultAnalyticsDateRange());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const routes = useAppRoutes();

  useEffect(() => {
    if (!testId || testId === 'undefined') {
      navigate(routes.tests);
    }
  }, [testId, navigate, routes.tests]);

  const handleExport = async () => {
    if (!testId || testId === 'undefined') return;
    try {
      setExporting(true);
      setError(null);

      const params = { format };
      const dateParams = getDateRangeParams(dateRange);
      if (dateParams.start_date) params.start_date = dateParams.start_date;
      if (dateParams.end_date) params.end_date = dateParams.end_date;

      const response = await apiGet(`/analytics/tests/${testId}/export`, params, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `ripx_report_${testId}_${dateStr}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Export error:', err);
      const errMsg = err.message || 'Failed to export data';
      const data = err.response?.data;
      if (data instanceof Blob) {
        try {
          const t = await data.text();
          const parsed = JSON.parse(t);
          setError(parsed.error || errMsg);
        } catch {
          setError(errMsg);
        }
      } else if (data && typeof data === 'object') {
        setError(data.error || errMsg);
      } else {
        setError(errMsg);
      }
    } finally {
      setExporting(false);
    }
  };

  if (!testId || testId === 'undefined') {
    return null;
  }

  return (
    <PageShell
      message={error}
      messageType="error"
      onCloseMessage={() => setError(null)}
      messageDuration={5000}
    >
      <Page
        title="Export Report"
        subtitle="Download test analytics, funnel, and events"
        breadcrumbs={[
          { content: 'All Tests', onAction: () => navigate(routes.tests) },
          { content: 'Test Details', onAction: () => navigate(routes.testDetail(testId)) },
          { content: 'Export' },
        ]}
      >
        <BlockStack gap="400">
          <div className={styles.exportHero}>
            <div className={styles.exportHeroInner}>
              <div className={styles.exportHeroIcon}>
                <ExportIcon />
              </div>
              <div>
                <Text variant="headingLg" as="h2" fontWeight="bold">
                  Export your test data
                </Text>
                <Text variant="bodyMd" tone="subdued" as="p">
                  Download CSV or JSON with variant metrics, funnel data, and statistical
                  significance.
                </Text>
              </div>
            </div>
          </div>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Report Options
              </Text>
              <InlineStack gap="400" wrap>
                <div style={{ minWidth: 200 }}>
                  <Select
                    label="Export format"
                    options={[
                      { label: 'CSV (spreadsheet)', value: 'csv' },
                      { label: 'JSON (raw data)', value: 'json' },
                    ]}
                    value={format}
                    onChange={setFormat}
                  />
                </div>
                <div style={{ minWidth: 180 }}>
                  <Select
                    label="Date range"
                    options={DATE_RANGES}
                    value={dateRange}
                    onChange={setDateRange}
                  />
                </div>
              </InlineStack>
              <Text variant="bodySm" color="subdued" as="p">
                Date range applies to variant metrics, decision readiness, funnel data, and heatmap
                summaries in this export.
              </Text>
              <Button variant="primary" onClick={handleExport} loading={exporting}>
                Download {format.toUpperCase()}
              </Button>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                Report contents
              </Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm">
                  • <strong>Test info</strong> – name, type, status, dates
                </Text>
                <Text as="p" variant="bodySm">
                  • <strong>Variant metrics</strong> – visitors, conversions, conversion rate,
                  revenue, AOV
                </Text>
                <Text as="p" variant="bodySm">
                  • <strong>Statistical significance</strong> – p-value, confidence, lift, winner
                </Text>
                <Text as="p" variant="bodySm">
                  • <strong>Revenue impact</strong> – control vs test revenue, impact
                </Text>
                <Text as="p" variant="bodySm">
                  • <strong>Conversion funnel</strong> – visitors, add to cart, purchase by variant
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>

          <Banner tone="info" title="Scheduled reports">
            <Text as="p" variant="bodySm">
              Export reports manually for now. Scheduled email reports coming in a future update.
            </Text>
          </Banner>
        </BlockStack>
      </Page>
    </PageShell>
  );
}

export default Export;
