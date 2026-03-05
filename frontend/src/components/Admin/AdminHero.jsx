/**
 * AdminHero
 *
 * Shared hero for admin pages: icon, title, subtitle, and actions. No back button.
 * Use with Page without title/subtitle/backAction/primaryAction/secondaryActions to avoid duplicate headers.
 */

import React from 'react';
import { Icon, Button } from '@shopify/polaris';
import styles from './Admin.module.css';

export default function AdminHero({
  title,
  subtitle,
  icon: IconSource,
  primaryAction,
  secondaryActions = [],
}) {
  return (
    <section className={styles.adminHero} aria-label={title}>
      <div className={styles.adminHeroInner}>
        <div className={styles.adminHeroMain}>
          <div className={styles.adminHeroRow}>
            <div className={styles.adminHeroIcon}>
              {IconSource && <Icon source={IconSource} tone="base" />}
            </div>
            <div className={styles.adminHeroText}>
              <h1 className={styles.adminHeroTitle}>{title}</h1>
              {subtitle && <p className={styles.adminHeroSubtitle}>{subtitle}</p>}
            </div>
          </div>
        </div>
        <div className={styles.adminHeroActions}>
          {secondaryActions.map((action, i) => (
            <Button
              key={i}
              variant="secondary"
              size="slim"
              onClick={action.onAction}
              className={styles.adminHeroSecondaryBtn}
            >
              {action.content}
            </Button>
          ))}
          {primaryAction && (
            <Button
              variant="primary"
              size="slim"
              icon={primaryAction.icon}
              onClick={primaryAction.onAction}
              loading={primaryAction.loading}
              className={styles.adminHeroPrimaryBtn}
            >
              {primaryAction.content}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
