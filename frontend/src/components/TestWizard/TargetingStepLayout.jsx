import React from 'react';
import { Icon } from '@shopify/polaris';
import { InfoIcon } from '@shopify/polaris-icons';
import { TooltipWrapper } from '../Shared';
import TargetingSummaryRail from './TargetingSummaryRail';

export default function TargetingStepLayout({
  styles,
  summary,
  activeSection,
  issuesBySection,
  coachBySection,
  onSelectSection,
  glanceTooltip,
  children,
}) {
  const tooltip =
    glanceTooltip ||
    `${summary.atAGlance}. Use store preview with ab_preview=1 to sanity-check assignment on a live page.`;

  return (
    <div
      className={`${styles.placementBarRowTargeting} ${styles.placementBarRowTargetingWithRail}`}
    >
      <TargetingSummaryRail
        styles={styles}
        sections={summary.railSections}
        activeSection={activeSection}
        issuesBySection={issuesBySection}
        coachBySection={coachBySection}
        onSelectSection={onSelectSection}
      />
      <div className={styles.targetingRailDetail}>
        <div className={styles.placementBarSummaryTargeting}>
          <span className={styles.targetingSummaryEyebrow}>At a glance</span>
          <TooltipWrapper content={tooltip} accessibilityLabel="Targeting summary details">
            <span className={styles.placementConfigPill}>
              {summary.atAGlance}
              <span className={styles.targetingSummaryGlanceIcon} aria-hidden="true">
                <Icon source={InfoIcon} />
              </span>
            </span>
          </TooltipWrapper>
        </div>
        {children}
      </div>
    </div>
  );
}
