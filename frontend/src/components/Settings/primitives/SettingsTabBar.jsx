import React from 'react';
import { Icon } from '@shopify/polaris';
import styles from '../Settings.module.css';

export function SettingsTabBar({
  isAppSettings,
  visibleTabEntries,
  selectedTab,
  tabStatusMeta,
  onSelectTab,
  onKeyDown,
}) {
  return (
    <div className={styles.settingsTabStickyWrap}>
      <nav
        className={`${styles.settingsTabBar} ${styles.settingsTopNav}`}
        role="tablist"
        aria-label={isAppSettings ? 'Store settings sections' : 'Account settings sections'}
        onKeyDown={onKeyDown}
      >
        {visibleTabEntries.map(({ tab, index }) => {
          const meta = isAppSettings ? tabStatusMeta[tab.id] : null;
          const status = meta?.status || 'neutral';
          const statusClass =
            status === 'ok'
              ? styles.settingsTabMetaDotOk
              : status === 'warn'
                ? styles.settingsTabMetaDotWarn
                : styles.settingsTabMetaDotNeutral;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              tabIndex={selectedTab === index ? 0 : -1}
              aria-selected={selectedTab === index}
              aria-controls={`settings-panel-${tab.id}`}
              id={`settings-tab-${tab.id}`}
              className={`${styles.settingsTab} ${
                selectedTab === index ? styles.settingsTabActive : ''
              } ${tab.id === 'advanced' ? styles.settingsTabAdvanced : ''}`}
              onClick={() => onSelectTab(index)}
              data-tab-status={status}
            >
              <span className={styles.settingsTabIcon}>
                <Icon source={tab.icon} />
              </span>
              <span className={styles.settingsTabLabelWrap}>
                <span className={styles.settingsTabLabel}>{tab.label}</span>
                {meta?.label ? (
                  <span className={styles.settingsTabMeta}>
                    <span
                      className={`${styles.settingsTabMetaDot} ${statusClass}`}
                      aria-hidden="true"
                    />
                    {meta.label}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
