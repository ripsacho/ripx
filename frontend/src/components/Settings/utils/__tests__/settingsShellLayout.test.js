import {
  resolveSettingsShellLayout,
  getSettingsWorkspaceClassFlags,
  buildSettingsWorkspaceClassName,
} from '../settingsShellLayout';

describe('settingsShellLayout', () => {
  describe('resolveSettingsShellLayout', () => {
    it('shows tab bar and about card in tabbed store settings', () => {
      expect(
        resolveSettingsShellLayout({ isAppSettings: true, showAllAppSections: false })
      ).toEqual({
        showTabBar: true,
        showAboutCard: true,
        showSectionRail: false,
        mainAriaLabel: 'Store settings content',
        panelsAriaLabel: 'Store settings sections',
      });
    });

    it('hides tab bar and about card in continuous store settings layout', () => {
      expect(resolveSettingsShellLayout({ isAppSettings: true, showAllAppSections: true })).toEqual(
        {
          showTabBar: false,
          showAboutCard: false,
          showSectionRail: true,
          mainAriaLabel: 'Store settings content',
          panelsAriaLabel: 'Store settings sections',
        }
      );
    });

    it('uses account labels outside app settings route', () => {
      expect(
        resolveSettingsShellLayout({ isAppSettings: false, showAllAppSections: false })
      ).toEqual({
        showTabBar: true,
        showAboutCard: true,
        showSectionRail: false,
        mainAriaLabel: 'Account settings content',
        panelsAriaLabel: 'Account settings panel',
      });
    });
  });

  describe('getSettingsWorkspaceClassFlags', () => {
    it('enables rail only in continuous layout', () => {
      expect(
        getSettingsWorkspaceClassFlags({ showAllAppSections: true, sectionRailCollapsed: false })
      ).toEqual({ withRail: true, railCollapsed: false });
      expect(
        getSettingsWorkspaceClassFlags({ showAllAppSections: false, sectionRailCollapsed: true })
      ).toEqual({ withRail: false, railCollapsed: false });
    });

    it('marks rail collapsed only when rail is visible', () => {
      expect(
        getSettingsWorkspaceClassFlags({ showAllAppSections: true, sectionRailCollapsed: true })
      ).toEqual({ withRail: true, railCollapsed: true });
    });
  });

  describe('buildSettingsWorkspaceClassName', () => {
    it('joins base and optional module classes', () => {
      const className = buildSettingsWorkspaceClassName(
        'settingsWorkspace',
        { withRail: true, railCollapsed: true },
        { withRail: 'withRail', railCollapsed: 'railCollapsed' }
      );
      expect(className).toBe('settingsWorkspace withRail railCollapsed');
    });
  });
});
