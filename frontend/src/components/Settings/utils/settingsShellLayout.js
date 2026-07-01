/**
 * Pure layout decisions for SettingsPageShell (testable without React).
 */

export function resolveSettingsShellLayout({ isAppSettings, showAllAppSections }) {
  return {
    showTabBar: !showAllAppSections,
    showAboutCard: !(isAppSettings && showAllAppSections),
    showSectionRail: Boolean(showAllAppSections),
    mainAriaLabel: isAppSettings ? 'Store settings content' : 'Account settings content',
    panelsAriaLabel: isAppSettings ? 'Store settings sections' : 'Account settings panel',
  };
}

export function getSettingsWorkspaceClassFlags({ showAllAppSections, sectionRailCollapsed }) {
  return {
    withRail: Boolean(showAllAppSections),
    railCollapsed: Boolean(showAllAppSections && sectionRailCollapsed),
  };
}

export function buildSettingsWorkspaceClassName(baseClass, flags, classMap) {
  const parts = [baseClass];
  if (flags.withRail && classMap.withRail) {
    parts.push(classMap.withRail);
  }
  if (flags.railCollapsed && classMap.railCollapsed) {
    parts.push(classMap.railCollapsed);
  }
  return parts.filter(Boolean).join(' ');
}
