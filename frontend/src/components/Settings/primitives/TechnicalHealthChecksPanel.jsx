import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Text } from '@shopify/polaris';
import {
  filterVisibleHealthChecks,
  getHealthCheckStatus,
  getHealthCheckTitle,
  getHealthSummaryHint,
  partitionHealthChecks,
  shouldAutoOpenHealthChecks,
  shouldExpandHealthChecksOnUpdate,
  summarizeHealthChecks,
} from '../utils/storeHealthChecks';
import styles from '../Settings.module.css';

export function TechnicalHealthChecksPanel({ storeHealth, onOpenAdvanced }) {
  const checks = Array.isArray(storeHealth?.checks) ? storeHealth.checks : [];
  const stats = useMemo(() => summarizeHealthChecks(checks), [checks]);
  const { required: requiredChecks, optional: optionalChecks } = useMemo(
    () => partitionHealthChecks(checks),
    [checks]
  );
  const [open, setOpen] = useState(() => shouldAutoOpenHealthChecks(checks));
  const [showPassing, setShowPassing] = useState(false);
  const previousBlockingRef = useRef(stats.blocking);

  useEffect(() => {
    if (shouldExpandHealthChecksOnUpdate(previousBlockingRef.current, stats.blocking)) {
      setOpen(true);
    }
    previousBlockingRef.current = stats.blocking;
  }, [stats.blocking]);

  const visibleRequired = filterVisibleHealthChecks(requiredChecks, showPassing);
  const visibleOptional = filterVisibleHealthChecks(optionalChecks, showPassing);
  const summaryHint = getHealthSummaryHint(stats);

  return (
    <details
      className={styles.technicalHealthChecks}
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary className={styles.technicalHealthChecksSummary}>
        <span className={styles.technicalHealthChecksSummaryMain}>
          <span className={styles.technicalHealthChecksSummaryTitle}>Technical health checks</span>
          <span className={styles.technicalHealthChecksSummaryHint}>{summaryHint}</span>
        </span>
        <span className={styles.technicalHealthChecksSummaryStats} aria-hidden="true">
          <span className={styles.technicalHealthChecksPillOk}>{stats.passing} passing</span>
          {stats.advisory > 0 ? (
            <span className={styles.technicalHealthChecksPillWarn}>{stats.advisory} advisory</span>
          ) : null}
          {stats.blocking > 0 ? (
            <span className={styles.technicalHealthChecksPillFail}>{stats.blocking} blocking</span>
          ) : null}
        </span>
      </summary>

      <div className={styles.technicalHealthChecksBody}>
        <div className={styles.technicalHealthStatGrid}>
          <div className={styles.technicalHealthStat}>
            <span className={styles.technicalHealthStatLabel}>Passing</span>
            <span className={styles.technicalHealthStatValue}>{stats.passing}</span>
          </div>
          <div className={styles.technicalHealthStat}>
            <span className={styles.technicalHealthStatLabel}>Advisory</span>
            <span className={styles.technicalHealthStatValue}>{stats.advisory}</span>
          </div>
          <div className={styles.technicalHealthStat}>
            <span className={styles.technicalHealthStatLabel}>Blocking</span>
            <span className={styles.technicalHealthStatValue}>{stats.blocking}</span>
          </div>
        </div>

        <div className={styles.technicalHealthToolbar}>
          <Button size="micro" pressed={showPassing} onClick={() => setShowPassing(prev => !prev)}>
            {showPassing ? 'Hide passing checks' : 'Show passing checks'}
          </Button>
          {!showPassing && stats.passing > 0 ? (
            <Text as="span" variant="bodySm" tone="subdued">
              {stats.passing} passing check{stats.passing === 1 ? '' : 's'} hidden
            </Text>
          ) : null}
        </div>

        {visibleRequired.length > 0 ? (
          <section className={styles.technicalHealthGroup} aria-label="Required health checks">
            <Text as="h3" variant="headingSm" className={styles.technicalHealthGroupTitle}>
              Required checks
            </Text>
            <ul className={styles.technicalHealthList}>
              {visibleRequired.map(item => {
                const status = getHealthCheckStatus(item);
                return (
                  <li key={item.key} className={styles.technicalHealthItem}>
                    <div className={styles.technicalHealthItemHeader}>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        {getHealthCheckTitle(item)}
                      </Text>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    <Text
                      as="p"
                      variant="bodySm"
                      tone="subdued"
                      className={styles.technicalHealthItemMessage}
                    >
                      {item.message}
                    </Text>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {visibleOptional.length > 0 ? (
          <section className={styles.technicalHealthGroup} aria-label="Optional health checks">
            <Text as="h3" variant="headingSm" className={styles.technicalHealthGroupTitle}>
              Optional checks
            </Text>
            <ul className={styles.technicalHealthList}>
              {visibleOptional.map(item => {
                const status = getHealthCheckStatus(item);
                return (
                  <li key={item.key} className={styles.technicalHealthItem}>
                    <div className={styles.technicalHealthItemHeader}>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        {getHealthCheckTitle(item)}
                      </Text>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    <Text
                      as="p"
                      variant="bodySm"
                      tone="subdued"
                      className={styles.technicalHealthItemMessage}
                    >
                      {item.message}
                    </Text>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {!showPassing && stats.passing > 0 && stats.blocking === 0 && stats.advisory === 0 ? (
          <Text as="p" variant="bodySm" tone="subdued" className={styles.technicalHealthEmpty}>
            All checks are passing. Turn on &quot;Show passing checks&quot; to see the full list.
          </Text>
        ) : null}

        {onOpenAdvanced ? (
          <div className={styles.technicalHealthFooter}>
            <Button variant="plain" size="slim" onClick={onOpenAdvanced}>
              Open Advanced tools
            </Button>
          </div>
        ) : null}
      </div>
    </details>
  );
}
