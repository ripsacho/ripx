import React from 'react';
import { BlockStack, Page } from '@shopify/polaris';
import { PageShell } from '../Shared';
import { CONTENT_GAP } from '../../constants';
import { SettingsTabBar } from './primitives/SettingsTabBar';
import { SettingsPageHeader } from './SettingsPageHeader';
import { SettingsSectionRail } from './SettingsSectionRail';
import { SettingsDisplayOptions } from './SettingsDisplayOptions';
import { SettingsAboutCard } from './SettingsAboutCard';
import styles from './Settings.module.css';
import {
  resolveSettingsShellLayout,
  getSettingsWorkspaceClassFlags,
  buildSettingsWorkspaceClassName,
} from './utils/settingsShellLayout';

export function SettingsPageShell({
  pageShell,
  header,
  mainRef,
  isAppSettings,
  showTabBar,
  tabBar,
  loading,
  showAllAppSections,
  sectionRailCollapsed,
  rail,
  showDisplayOptions,
  displayOptions,
  tabIntro,
  showAboutCard,
  children,
  modals,
}) {
  const shellLayout = resolveSettingsShellLayout({ isAppSettings, showAllAppSections });
  const workspaceClassName = buildSettingsWorkspaceClassName(
    styles.settingsWorkspace,
    getSettingsWorkspaceClassFlags({ showAllAppSections, sectionRailCollapsed }),
    {
      withRail: styles.settingsWorkspaceWithRail,
      railCollapsed: styles.settingsWorkspaceWithRailCollapsed,
    }
  );

  return (
    <PageShell
      message={pageShell.message}
      messageType={pageShell.messageType}
      onCloseMessage={pageShell.onCloseMessage}
      messageDuration={pageShell.messageDuration}
      className={`${styles.settingsPage} ${pageShell.layoutDensityClass || ''}`}
    >
      <Page title="" subtitle="">
        <div className={styles.settingsLayout}>
          <div className={styles.settingsPageColumn}>
            <SettingsPageHeader {...header} />
            <main
              id="settings-main"
              ref={mainRef}
              className={styles.settingsBody}
              aria-label={shellLayout.mainAriaLabel}
            >
              {(showTabBar ?? shellLayout.showTabBar) ? (
                <SettingsTabBar {...tabBar} isAppSettings={isAppSettings} />
              ) : null}
              <BlockStack gap={CONTENT_GAP}>
                {loading ? (
                  <div className={styles.settingsLoadingSkeleton}>
                    <div className={styles.loadingSkeletonCard} />
                    <div className={styles.loadingSkeletonCard} style={{ height: 200 }} />
                    <div className={styles.loadingSkeletonCard} style={{ height: 160 }} />
                  </div>
                ) : (
                  <div className={workspaceClassName}>
                    {shellLayout.showSectionRail ? <SettingsSectionRail {...rail} /> : null}
                    <div
                      className={`${styles.settingsPanels} ${
                        (showTabBar ?? shellLayout.showTabBar) ? styles.settingsPanelsTabbed : ''
                      }`}
                      role="region"
                      aria-live="polite"
                      aria-label={shellLayout.panelsAriaLabel}
                    >
                      {showDisplayOptions ? <SettingsDisplayOptions {...displayOptions} /> : null}
                      {tabIntro}
                      {children}
                    </div>
                  </div>
                )}
                {(showAboutCard ?? shellLayout.showAboutCard) ? <SettingsAboutCard /> : null}
              </BlockStack>
            </main>
          </div>
        </div>
      </Page>
      {modals}
    </PageShell>
  );
}
