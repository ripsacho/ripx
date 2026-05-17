import { useMemo, useState } from 'react';
import { Banner, BlockStack, Checkbox, Text } from '@shopify/polaris';
import { formatPreflightCheckMessage } from '../../utils/preflightHints';
import {
  buildLaunchPreflightView,
  formatPreflightIssueLine,
  launchPreflightHeadline,
} from '../../utils/preflightPresentation';
import styles from './LaunchPreflightPanel.module.css';

const PREFLIGHT_FILTERS_STORAGE_KEY = 'ripx.launchPreflightFilters.v1';
const DEFAULT_PREFLIGHT_FILTERS = {
  showErrors: true,
  showWarnings: true,
  showPassed: false,
};

function readStoredPreflightFilters() {
  if (typeof window === 'undefined') {
    return DEFAULT_PREFLIGHT_FILTERS;
  }
  try {
    const raw = window.localStorage.getItem(PREFLIGHT_FILTERS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PREFLIGHT_FILTERS;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_PREFLIGHT_FILTERS;
    }
    return {
      showErrors:
        typeof parsed.showErrors === 'boolean'
          ? parsed.showErrors
          : DEFAULT_PREFLIGHT_FILTERS.showErrors,
      showWarnings:
        typeof parsed.showWarnings === 'boolean'
          ? parsed.showWarnings
          : DEFAULT_PREFLIGHT_FILTERS.showWarnings,
      showPassed:
        typeof parsed.showPassed === 'boolean'
          ? parsed.showPassed
          : DEFAULT_PREFLIGHT_FILTERS.showPassed,
    };
  } catch {
    return DEFAULT_PREFLIGHT_FILTERS;
  }
}

/**
 * Merchant-friendly preflight summary + optional technical checklist.
 */
export default function LaunchPreflightPanel({ preflightResult, introTone = 'subdued' }) {
  const view = useMemo(() => buildLaunchPreflightView(preflightResult), [preflightResult]);
  const [showTechnicalPreflightDetails, setShowTechnicalPreflightDetails] = useState(false);
  const [showErrorPreflightChecks, setShowErrorPreflightChecks] = useState(
    () => readStoredPreflightFilters().showErrors
  );
  const [showWarningPreflightChecks, setShowWarningPreflightChecks] = useState(
    () => readStoredPreflightFilters().showWarnings
  );
  const [showPassedPreflightChecks, setShowPassedPreflightChecks] = useState(
    () => readStoredPreflightFilters().showPassed
  );

  const groupedPreflightChecks = view.grouped;
  const visiblePreflightCheckCount =
    (showTechnicalPreflightDetails && showErrorPreflightChecks
      ? groupedPreflightChecks.errors.length
      : 0) +
    (showTechnicalPreflightDetails && showWarningPreflightChecks
      ? groupedPreflightChecks.warnings.length
      : 0) +
    (showTechnicalPreflightDetails && showPassedPreflightChecks
      ? groupedPreflightChecks.ok.length
      : 0);

  const handleFilterChange = (key, value) => {
    const next = {
      showErrors: key === 'showErrors' ? value : showErrorPreflightChecks,
      showWarnings: key === 'showWarnings' ? value : showWarningPreflightChecks,
      showPassed: key === 'showPassed' ? value : showPassedPreflightChecks,
    };
    if (key === 'showErrors') setShowErrorPreflightChecks(value);
    if (key === 'showWarnings') setShowWarningPreflightChecks(value);
    if (key === 'showPassed') setShowPassedPreflightChecks(value);
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(PREFLIGHT_FILTERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  if (!preflightResult) {
    return (
      <Text variant="bodyMd" as="p" tone={introTone}>
        {launchPreflightHeadline(null)}
      </Text>
    );
  }

  return (
    <div className={styles.panel}>
      <Text variant="bodyMd" as="p" tone={introTone}>
        {launchPreflightHeadline(view)}
      </Text>

      {view.primaryIssues.length > 0 && (
        <Banner tone={view.blocked ? 'critical' : view.warningCount > 0 ? 'warning' : 'success'}>
          <BlockStack gap="200">
            {view.primaryIssues.map(check => (
              <Text key={check.id || check.message} as="p" variant="bodySm">
                {formatPreflightIssueLine(check)}
              </Text>
            ))}
            {view.overflowIssueCount > 0 && (
              <Text as="p" variant="bodySm" tone="subdued">
                {view.overflowIssueCount} more item
                {view.overflowIssueCount === 1 ? '' : 's'} in technical checks below.
              </Text>
            )}
          </BlockStack>
        </Banner>
      )}

      {view.primaryIssues.length === 0 && !view.blocked && (
        <Banner tone="success">
          <Text as="p" variant="bodySm">
            No issues found. You can start the test.
          </Text>
        </Banner>
      )}

      {Array.isArray(preflightResult.checks) && preflightResult.checks.length > 0 && (
        <>
          <Checkbox
            label={`Show all technical checks (${view.totalChecks})`}
            checked={showTechnicalPreflightDetails}
            onChange={setShowTechnicalPreflightDetails}
          />
          {showTechnicalPreflightDetails && (
            <div className={styles.technicalBox}>
              <BlockStack gap="200">
                <BlockStack gap="100">
                  <Checkbox
                    label={`Blocking errors (${groupedPreflightChecks.errors.length})`}
                    checked={showErrorPreflightChecks}
                    onChange={v => handleFilterChange('showErrors', v)}
                  />
                  <Checkbox
                    label={`Warnings (${groupedPreflightChecks.warnings.length})`}
                    checked={showWarningPreflightChecks}
                    onChange={v => handleFilterChange('showWarnings', v)}
                  />
                  <Checkbox
                    label={`Passed (${groupedPreflightChecks.ok.length})`}
                    checked={showPassedPreflightChecks}
                    onChange={v => handleFilterChange('showPassed', v)}
                  />
                </BlockStack>
                {showErrorPreflightChecks && groupedPreflightChecks.errors.length > 0 && (
                  <BlockStack gap="100">
                    {groupedPreflightChecks.errors.map(check => (
                      <div key={check.id || check.message} className={styles.preflightCheckRow}>
                        <Text
                          as="span"
                          variant="bodySm"
                          fontWeight="semibold"
                          tone="critical"
                          className={styles.preflightCheckLabel}
                        >
                          Error
                        </Text>
                        <Text as="span" variant="bodySm" className={styles.preflightCheckText}>
                          {formatPreflightCheckMessage(check)}
                        </Text>
                      </div>
                    ))}
                  </BlockStack>
                )}
                {showWarningPreflightChecks && groupedPreflightChecks.warnings.length > 0 && (
                  <BlockStack gap="100">
                    {groupedPreflightChecks.warnings.map(check => (
                      <div key={check.id || check.message} className={styles.preflightCheckRow}>
                        <Text
                          as="span"
                          variant="bodySm"
                          fontWeight="semibold"
                          tone="warning"
                          className={styles.preflightCheckLabel}
                        >
                          Warn
                        </Text>
                        <Text as="span" variant="bodySm" className={styles.preflightCheckText}>
                          {formatPreflightCheckMessage(check)}
                        </Text>
                      </div>
                    ))}
                  </BlockStack>
                )}
                {showPassedPreflightChecks && groupedPreflightChecks.ok.length > 0 && (
                  <BlockStack gap="100">
                    {groupedPreflightChecks.ok.map(check => (
                      <div key={check.id || check.message} className={styles.preflightCheckRow}>
                        <Text
                          as="span"
                          variant="bodySm"
                          fontWeight="semibold"
                          tone="success"
                          className={styles.preflightCheckLabel}
                        >
                          OK
                        </Text>
                        <Text as="span" variant="bodySm" className={styles.preflightCheckText}>
                          {formatPreflightCheckMessage(check)}
                        </Text>
                      </div>
                    ))}
                  </BlockStack>
                )}
                {visiblePreflightCheckCount === 0 && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    No checks match the current filters.
                  </Text>
                )}
              </BlockStack>
            </div>
          )}
        </>
      )}
    </div>
  );
}
