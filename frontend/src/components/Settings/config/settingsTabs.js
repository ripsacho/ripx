import {
  ChartVerticalIcon,
  DataTableIcon,
  TargetIcon,
  CodeIcon,
  SettingsIcon,
} from '@shopify/polaris-icons';

/** Full store settings tabs (inside /app/:domain/settings). */
export const TAB_CONFIG_APP = [
  {
    id: 'installation',
    label: 'Store setup',
    icon: CodeIcon,
    eyebrow: 'Setup',
    description: 'Connect RipX to your theme, checkout, and offer paths before launching tests.',
  },
  {
    id: 'general',
    label: 'Testing defaults',
    icon: SettingsIcon,
    eyebrow: 'Defaults',
    description: 'Sample size, confidence, auto-stop, and webhooks for new tests.',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: ChartVerticalIcon,
    eyebrow: 'Optional',
    description: 'Forward events to GA4 or export results to BigQuery when you need them.',
  },
  {
    id: 'presets',
    label: 'Targeting presets',
    icon: TargetIcon,
    eyebrow: 'Reuse',
    description: 'Saved audience and page targeting you can apply in the Test Wizard.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: DataTableIcon,
    eyebrow: 'Support',
    description:
      'Diagnostics, preview probes, function inventory, and JSON export for troubleshooting.',
  },
];

/** Legacy fallback if Settings is ever rendered outside /app/:domain/settings. */
export const TAB_CONFIG_ACCOUNT = [
  { id: 'account', label: 'Account settings', icon: SettingsIcon },
];

export function getSettingsTabLabelById(tabId, tabConfig = TAB_CONFIG_APP) {
  const id = String(tabId || '').trim();
  if (!id) return null;
  const tab = tabConfig.find(entry => entry.id === id);
  return tab?.label || null;
}

export function tabIndexFromSearchParams(searchParams, tabConfig) {
  const tab = searchParams.get('tab');
  const ids = tabConfig.map(t => t.id);
  const i = ids.indexOf(tab);
  return i >= 0 ? i : 0;
}

export function filterVisibleTabEntries(
  tabConfig,
  { isAppSettings, isGuidedSetupMode, showAllAppSections }
) {
  const entries = tabConfig.map((tab, index) => ({ tab, index }));
  if (isAppSettings && isGuidedSetupMode && !showAllAppSections) {
    return entries.filter(entry => entry.tab.id === 'installation');
  }
  return entries;
}

export function createTabNavKeyDownHandler({
  isGuidedSetupMode,
  tabCount,
  selectedTab,
  setSelectedTab,
}) {
  return e => {
    if (isGuidedSetupMode) {
      return;
    }
    if (e.key === 'ArrowLeft' && selectedTab > 0) {
      e.preventDefault();
      setSelectedTab(selectedTab - 1);
    } else if (e.key === 'ArrowRight' && selectedTab < tabCount - 1) {
      e.preventDefault();
      setSelectedTab(selectedTab + 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectedTab(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectedTab(tabCount - 1);
    }
  };
}
