import React from 'react';
import { Icon, Text, Tooltip } from '@shopify/polaris';
import { ChevronLeftIcon, ChevronRightIcon } from '@shopify/polaris-icons';
import styles from './Settings.module.css';

export function SettingsSectionRail({
  collapsed,
  onToggleCollapsed,
  sections,
  activeSectionId,
  onSelectSection,
  activeTooltipId,
  onScheduleTooltipOpen,
  onHideTooltip,
  onFocusTooltip,
  onClearTooltipTimer,
}) {
  return (
    <aside
      className={`${styles.settingsRail} ${collapsed ? styles.settingsRailCollapsed : ''}`}
      aria-label="Store settings section index"
    >
      <div className={styles.settingsRailBlock}>
        <div className={styles.settingsRailHeader}>
          <Text as="p" variant="bodySm" className={styles.settingsRailTitle}>
            Sections
          </Text>
          <button
            type="button"
            className={styles.settingsRailToggle}
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand section rail' : 'Collapse section rail'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <Icon source={collapsed ? ChevronRightIcon : ChevronLeftIcon} />
            <span className={styles.settingsRailToggleLabel}>
              {collapsed ? 'Expand' : 'Collapse'}
            </span>
          </button>
        </div>
        <div className={styles.settingsRailTabs}>
          {sections.map(section => {
            const statusClass =
              section.status === 'ok'
                ? styles.settingsRailStatusOk
                : section.status === 'warn'
                  ? styles.settingsRailStatusWarn
                  : styles.settingsRailStatusNeutral;
            const railButton = (
              <button
                type="button"
                className={`${styles.settingsRailTab} ${
                  activeSectionId === section.id ? styles.settingsRailTabActive : ''
                }`}
                onClick={() => onSelectSection(section.id)}
                aria-current={activeSectionId === section.id ? 'true' : undefined}
                aria-label={section.label}
                title={collapsed ? undefined : section.label}
              >
                <span className={styles.settingsRailTabLabel}>
                  {collapsed ? section.shortLabel : section.label}
                </span>
                <span
                  className={`${styles.settingsRailStatusDot} ${statusClass}`}
                  aria-hidden="true"
                />
              </button>
            );
            if (collapsed) {
              return (
                <Tooltip
                  key={section.id}
                  content={section.label}
                  preferredPosition="right"
                  active={activeTooltipId === section.id}
                >
                  <span
                    className={`${styles.settingsRailTooltipWrap} ${
                      activeTooltipId === section.id ? styles.settingsRailTooltipWrapActive : ''
                    }`}
                    onMouseEnter={() => onScheduleTooltipOpen(section.id)}
                    onMouseLeave={onHideTooltip}
                    onFocus={() => {
                      onClearTooltipTimer();
                      onFocusTooltip(section.id);
                    }}
                    onBlur={onHideTooltip}
                  >
                    {railButton}
                  </span>
                </Tooltip>
              );
            }
            return <React.Fragment key={section.id}>{railButton}</React.Fragment>;
          })}
        </div>
      </div>
    </aside>
  );
}
