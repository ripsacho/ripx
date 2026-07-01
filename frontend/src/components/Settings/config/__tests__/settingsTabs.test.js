import {
  TAB_CONFIG_APP,
  TAB_CONFIG_ACCOUNT,
  getSettingsTabLabelById,
  tabIndexFromSearchParams,
  filterVisibleTabEntries,
  createTabNavKeyDownHandler,
} from '../settingsTabs';

describe('settingsTabs', () => {
  it('defaults to first tab when tab param is missing or invalid', () => {
    expect(tabIndexFromSearchParams(new URLSearchParams(), TAB_CONFIG_APP)).toBe(0);
    expect(tabIndexFromSearchParams(new URLSearchParams('tab=unknown'), TAB_CONFIG_APP)).toBe(0);
  });

  it('resolves tab index from search params', () => {
    expect(tabIndexFromSearchParams(new URLSearchParams('tab=advanced'), TAB_CONFIG_APP)).toBe(4);
    expect(tabIndexFromSearchParams(new URLSearchParams('tab=general'), TAB_CONFIG_APP)).toBe(1);
  });

  it('maps tab ids to merchant-facing labels', () => {
    expect(getSettingsTabLabelById('installation')).toBe('Store setup');
    expect(getSettingsTabLabelById('advanced')).toBe('Advanced');
    expect(getSettingsTabLabelById('unknown')).toBeNull();
    expect(getSettingsTabLabelById('')).toBeNull();
  });

  it('filters to store setup only in guided setup tabbed mode', () => {
    const entries = filterVisibleTabEntries(TAB_CONFIG_APP, {
      isAppSettings: true,
      isGuidedSetupMode: true,
      showAllAppSections: false,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].tab.id).toBe('installation');
  });

  it('shows all tabs in continuous layout during guided setup', () => {
    const entries = filterVisibleTabEntries(TAB_CONFIG_APP, {
      isAppSettings: true,
      isGuidedSetupMode: true,
      showAllAppSections: true,
    });
    expect(entries).toHaveLength(TAB_CONFIG_APP.length);
  });

  it('uses account tab config outside app settings route', () => {
    expect(TAB_CONFIG_ACCOUNT).toHaveLength(1);
    expect(TAB_CONFIG_ACCOUNT[0].id).toBe('account');
  });

  it('supports arrow key navigation between tabs', () => {
    const setSelectedTab = jest.fn();
    const handler = createTabNavKeyDownHandler({
      isGuidedSetupMode: false,
      tabCount: TAB_CONFIG_APP.length,
      selectedTab: 1,
      setSelectedTab,
    });
    handler({ key: 'ArrowLeft', preventDefault: jest.fn() });
    expect(setSelectedTab).toHaveBeenCalledWith(0);
  });

  it('ignores keyboard navigation in guided setup mode', () => {
    const setSelectedTab = jest.fn();
    const handler = createTabNavKeyDownHandler({
      isGuidedSetupMode: true,
      tabCount: TAB_CONFIG_APP.length,
      selectedTab: 1,
      setSelectedTab,
    });
    handler({ key: 'ArrowRight', preventDefault: jest.fn() });
    expect(setSelectedTab).not.toHaveBeenCalled();
  });
});
