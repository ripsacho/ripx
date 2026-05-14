import React, { useRef } from 'react';
import {
  ADVANCED_STUDIO_GROUPS,
  ADVANCED_STUDIO_SECTIONS,
  getAdvancedStudioSectionMeta,
} from './advancedTargeting';

export default function AdvancedTargetingRail({
  styles,
  formData,
  activeSection = 'safety',
  onSelectSection,
}) {
  const tabRefs = useRef([]);

  const focusSectionAt = nextIndex => {
    const nextButton = tabRefs.current[nextIndex];
    if (nextButton) {
      nextButton.focus();
      onSelectSection?.(ADVANCED_STUDIO_SECTIONS[nextIndex]?.id);
    }
  };

  const handleKeyDown = (event, sectionIndex) => {
    const total = ADVANCED_STUDIO_SECTIONS.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      focusSectionAt((sectionIndex + 1) % total);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      focusSectionAt((sectionIndex - 1 + total) % total);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusSectionAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusSectionAt(total - 1);
    }
  };

  return (
    <nav
      className={`${styles.checkoutStudioWorkspaceRail} ${styles.advancedStudioRail}`}
      role="tablist"
      aria-label="Advanced targeting sections"
    >
      {ADVANCED_STUDIO_GROUPS.map(group => (
        <div key={group.label} className={styles.checkoutStudioRailGroup}>
          <span className={styles.checkoutStudioRailGroupLabel}>{group.label}</span>
          {group.values
            .map(value => ADVANCED_STUDIO_SECTIONS.find(section => section.id === value))
            .filter(Boolean)
            .map(section => {
              const sectionIndex = ADVANCED_STUDIO_SECTIONS.findIndex(
                item => item.id === section.id
              );
              const meta = getAdvancedStudioSectionMeta(formData, section.id);
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  ref={element => {
                    tabRefs.current[sectionIndex] = element;
                  }}
                  type="button"
                  role="tab"
                  id={`advanced-studio-tab-${section.id}`}
                  aria-controls={`advanced-studio-panel-${section.id}`}
                  aria-selected={isActive}
                  aria-current={isActive ? 'step' : undefined}
                  tabIndex={isActive ? 0 : -1}
                  className={`${styles.checkoutStudioRailItem} ${
                    isActive ? styles.checkoutStudioRailItemActive : ''
                  }`}
                  onClick={() => onSelectSection?.(section.id)}
                  onKeyDown={event => handleKeyDown(event, sectionIndex)}
                >
                  <span className={styles.checkoutStudioRailStepNumber}>{sectionIndex + 1}</span>
                  <span className={styles.checkoutStudioRailStepCopy}>
                    <strong>{section.label}</strong>
                    <small className={styles.checkoutStudioRailState}>{meta.state}</small>
                  </span>
                  {meta.configured ? (
                    <span className={styles.advancedStudioRailDot} aria-hidden />
                  ) : null}
                  <small>{isActive ? 'Current section' : section.hint}</small>
                </button>
              );
            })}
        </div>
      ))}
    </nav>
  );
}
