import React, { useRef } from 'react';
import styles from '../TargetingSection.module.css';

export default function CheckoutStudioModeRail({
  tabs = [],
  activeMode = 'overview',
  variantIndex = 0,
  groups = [],
  issueCounts = {},
  sections = [],
  getTabMeta,
  onSelect,
  onJumpSection,
}) {
  const tabRefs = useRef([]);
  const groupedTabs =
    groups.length > 0 ? groups : [{ label: 'Studio', values: tabs.map(tab => tab.value) }];

  const focusTabAt = nextIndex => {
    const nextButton = tabRefs.current[nextIndex];
    if (nextButton) {
      nextButton.focus();
      onSelect?.(tabs[nextIndex]?.value);
    }
  };

  const handleKeyDown = (event, tabIndex) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      focusTabAt((tabIndex + 1) % tabs.length);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      focusTabAt((tabIndex - 1 + tabs.length) % tabs.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusTabAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusTabAt(tabs.length - 1);
    }
  };

  return (
    <nav
      className={styles.checkoutStudioWorkspaceRail}
      role="tablist"
      aria-label="Checkout studio workflow steps"
    >
      {groupedTabs.map(group => (
        <div key={group.label} className={styles.checkoutStudioRailGroup}>
          <span className={styles.checkoutStudioRailGroupLabel}>{group.label}</span>
          {group.values
            .map(value => tabs.find(tab => tab.value === value))
            .filter(Boolean)
            .map(tab => {
              const tabMeta = getTabMeta ? getTabMeta(tab.value) : {};
              const tabIndex = tabs.findIndex(item => item.value === tab.value);
              const count = issueCounts[tab.value] || 0;
              const stateLabel =
                tabMeta.state === 'inactive'
                  ? 'Saved draft'
                  : tabMeta.state === 'active'
                    ? count > 0
                      ? 'Blocked'
                      : 'Active'
                    : tabMeta.state === 'global'
                      ? 'Global'
                      : count > 0
                        ? 'Needs review'
                        : 'Ready';
              return (
                <button
                  key={tab.value}
                  ref={element => {
                    tabRefs.current[tabIndex] = element;
                  }}
                  type="button"
                  role="tab"
                  id={`checkout-studio-tab-${variantIndex}-${tab.value}`}
                  aria-controls={`checkout-studio-panel-${variantIndex}`}
                  aria-selected={activeMode === tab.value}
                  aria-current={activeMode === tab.value ? 'step' : undefined}
                  tabIndex={activeMode === tab.value ? 0 : -1}
                  className={`${styles.checkoutStudioRailItem} ${
                    activeMode === tab.value ? styles.checkoutStudioRailItemActive : ''
                  } ${tabMeta.state === 'inactive' ? styles.checkoutStudioRailItemInactive : ''}`}
                  onClick={() => onSelect?.(tab.value)}
                  onKeyDown={event => handleKeyDown(event, tabIndex)}
                >
                  <span className={styles.checkoutStudioRailStepNumber}>{tabIndex + 1}</span>
                  <span className={styles.checkoutStudioRailStepCopy}>
                    <strong>{tab.label}</strong>
                    <small className={styles.checkoutStudioRailState}>{stateLabel}</small>
                  </span>
                  {count > 0 ? (
                    <strong
                      className={styles.checkoutStudioRailCount}
                      aria-label={`${count} issue${count === 1 ? '' : 's'} in ${tab.label}`}
                    >
                      {count}
                    </strong>
                  ) : null}
                  <small>
                    {activeMode === tab.value
                      ? 'Current step'
                      : tabMeta.hint || 'Next setup checkpoint'}
                  </small>
                </button>
              );
            })}
        </div>
      ))}
      {activeMode === 'build' && sections.length > 0 ? (
        <div className={styles.checkoutStudioSectionOutline}>
          <span className={styles.checkoutStudioRailGroupLabel}>Section outline</span>
          {sections.map((section, sectionIndex) => {
            const title =
              String(section?.props?.title || section?.props?.message || '').trim() ||
              section?.type ||
              `Section ${sectionIndex + 1}`;
            const renders = section?.enabled !== false && Boolean(title.trim());
            return (
              <button
                key={`${section?.id || section?.type || 'section'}-${sectionIndex}`}
                type="button"
                className={styles.checkoutStudioSectionOutlineItem}
                onClick={() => onJumpSection?.(sectionIndex)}
              >
                <span>
                  {sectionIndex + 1}. {title}
                </span>
                <small>
                  {section?.enabled === false ? 'Disabled' : renders ? 'Renders' : 'Draft'}
                </small>
              </button>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}
