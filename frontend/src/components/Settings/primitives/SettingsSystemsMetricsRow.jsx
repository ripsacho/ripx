import React from 'react';
import styles from '../Settings.module.css';

const STATUS_CLASS = {
  ok: styles.settingsMetricCellOk,
  warn: styles.settingsMetricCellWarn,
  fail: styles.settingsMetricCellFail,
  neutral: styles.settingsMetricCellNeutral,
};

const STATUS_DOT_CLASS = {
  ok: styles.settingsMetricStatusDotOk,
  warn: styles.settingsMetricStatusDotWarn,
  fail: styles.settingsMetricStatusDotFail,
  neutral: styles.settingsMetricStatusDotNeutral,
};

function buildMetricAriaLabel(metric) {
  const parts = [`${metric.label}: ${metric.value}`];
  if (metric.hint) parts.push(metric.hint);
  if (metric.tabId) parts.push('Open related settings');
  return parts.join('. ');
}

export function SettingsSystemsMetricsRow({ metrics, onMetricSelect }) {
  if (!Array.isArray(metrics) || metrics.length === 0) return null;

  return (
    <section className={styles.settingsSystemsMetrics} aria-label="Store systems status">
      <div className={styles.settingsSystemsMetricsHeader}>
        <span className={styles.settingsSystemsMetricsTitle}>Systems</span>
        <span className={styles.settingsSystemsMetricsSubtitle}>Live store signals</span>
      </div>
      <div className={styles.settingsMetricsGrid}>
        {metrics.map(metric => {
          const status = STATUS_CLASS[metric.status] ? metric.status : 'neutral';
          const className = `${styles.settingsMetricCell} ${STATUS_CLASS[status] || ''} ${
            metric.tabId && onMetricSelect ? styles.settingsMetricCellInteractive : ''
          }`;
          const content = (
            <>
              <span className={styles.settingsMetricLabel}>{metric.label}</span>
              <span className={styles.settingsMetricValue}>
                <span
                  className={`${styles.settingsMetricStatusDot} ${
                    STATUS_DOT_CLASS[status] || STATUS_DOT_CLASS.neutral
                  }`}
                  aria-hidden="true"
                />
                {metric.value}
              </span>
              {metric.hint ? (
                <span className={styles.settingsMetricHint}>{metric.hint}</span>
              ) : null}
            </>
          );

          if (metric.tabId && onMetricSelect) {
            return (
              <button
                key={metric.id}
                type="button"
                className={className}
                title={metric.hint || undefined}
                aria-label={buildMetricAriaLabel(metric)}
                onClick={() => onMetricSelect(metric.tabId, metric.id)}
              >
                {content}
              </button>
            );
          }

          return (
            <div
              key={metric.id}
              className={className}
              title={metric.hint || undefined}
              aria-label={buildMetricAriaLabel(metric)}
            >
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
