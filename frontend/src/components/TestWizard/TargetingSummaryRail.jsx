import React from 'react';
import { Icon } from '@shopify/polaris';
import { InfoIcon } from '@shopify/polaris-icons';
import { TooltipWrapper } from '../Shared';

function normalizeSectionId(section) {
  return section === 'device' ? 'audience' : section;
}

export default function TargetingSummaryRail({
  styles,
  sections,
  activeSection,
  issuesBySection = {},
  coachBySection = {},
  onSelectSection,
}) {
  const activeId = normalizeSectionId(activeSection);

  return (
    <nav className={styles.targetingSummaryRail} aria-label="Targeting sections">
      <span className={styles.targetingSummaryRailLabel}>Sections</span>
      <ul className={styles.targetingSummaryRailList}>
        {sections.map(section => {
          const issueCount = (issuesBySection[section.id] || []).length;
          const coachHint = coachBySection[section.id];
          const isActive = activeId === section.id;
          const itemClassName = [
            styles.targetingSummaryRailItem,
            isActive ? styles.targetingSummaryRailItemActive : '',
            issueCount > 0 ? styles.targetingSummaryRailItemHasError : '',
            issueCount === 0 && coachHint ? styles.targetingSummaryRailItemHasCoach : '',
          ]
            .filter(Boolean)
            .join(' ');
          const coachMessage = coachHint?.message || '';

          return (
            <li key={section.id}>
              <button
                type="button"
                className={itemClassName}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => onSelectSection(section.id)}
              >
                <span className={styles.targetingSummaryRailItemTop}>
                  <span className={styles.targetingSummaryRailStep}>{section.step}</span>
                  <span className={styles.targetingSummaryRailTitle}>{section.label}</span>
                  {section.showActivityDot ? (
                    <span className={styles.targetingSummaryRailDot} aria-hidden="true" />
                  ) : null}
                  {issueCount > 0 ? (
                    <span className={styles.targetingSummaryRailIssueBadge}>{issueCount}</span>
                  ) : null}
                  {issueCount === 0 && coachMessage ? (
                    <TooltipWrapper
                      content={coachMessage}
                      accessibilityLabel={`${section.label} guidance`}
                      preferredPosition="above"
                    >
                      <span
                        className={styles.targetingSummaryRailCoachIcon}
                        tabIndex={0}
                        role="img"
                        aria-label={`${section.label} guidance`}
                        onClick={event => event.stopPropagation()}
                        onKeyDown={event => event.stopPropagation()}
                      >
                        <Icon source={InfoIcon} />
                      </span>
                    </TooltipWrapper>
                  ) : null}
                </span>
                <TooltipWrapper
                  content={section.detail}
                  accessibilityLabel={`${section.label} summary`}
                  preferredPosition="above"
                >
                  <span className={styles.targetingSummaryRailDetail}>{section.detail}</span>
                </TooltipWrapper>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
