/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { SettingsPageShell } from '../SettingsPageShell';

jest.mock(
  '../Settings.module.css',
  () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => String(prop),
      }
    )
);

jest.mock('../../../constants', () => ({
  CONTENT_GAP: '400',
}));

jest.mock('../../Shared', () => ({
  PageShell: ({ children, className }) => (
    <div data-testid="page-shell" className={className}>
      {children}
    </div>
  ),
}));

jest.mock('@shopify/polaris', () => ({
  BlockStack: ({ children }) => <div data-testid="block-stack">{children}</div>,
  Page: ({ children }) => <div data-testid="polaris-page">{children}</div>,
}));

jest.mock('../SettingsPageHeader', () => ({
  SettingsPageHeader: () => <div data-testid="settings-header">Header</div>,
}));

jest.mock('../SettingsSectionRail', () => ({
  SettingsSectionRail: () => <div data-testid="settings-rail">Rail</div>,
}));

jest.mock('../SettingsDisplayOptions', () => ({
  SettingsDisplayOptions: () => <div data-testid="display-options">Display options</div>,
}));

jest.mock('../SettingsAboutCard', () => ({
  SettingsAboutCard: () => <div data-testid="about-card">About</div>,
}));

jest.mock('../primitives/SettingsTabBar', () => ({
  SettingsTabBar: () => <div data-testid="tab-bar">Tabs</div>,
}));

const baseProps = {
  pageShell: {},
  header: {},
  mainRef: { current: null },
  isAppSettings: true,
  tabBar: {},
  loading: false,
  showAllAppSections: false,
  sectionRailCollapsed: false,
  rail: {},
  showDisplayOptions: false,
  displayOptions: {},
  tabIntro: null,
  modals: null,
};

describe('SettingsPageShell', () => {
  it('renders tabbed store settings layout with about card', () => {
    render(
      <SettingsPageShell {...baseProps} showTabBar showAboutCard>
        <div data-testid="panel-content">Panel</div>
      </SettingsPageShell>
    );

    expect(screen.getByTestId('settings-header')).toBeInTheDocument();
    expect(screen.getByTestId('tab-bar')).toBeInTheDocument();
    expect(screen.getByTestId('panel-content')).toBeInTheDocument();
    expect(screen.getByTestId('about-card')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-rail')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Store settings content')).toBeInTheDocument();
  });

  it('renders continuous layout with section rail and without tab bar', () => {
    render(
      <SettingsPageShell {...baseProps} showAllAppSections showTabBar={false} showAboutCard={false}>
        <div data-testid="panel-content">Panel</div>
      </SettingsPageShell>
    );

    expect(screen.queryByTestId('tab-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-rail')).toBeInTheDocument();
    expect(screen.queryByTestId('about-card')).not.toBeInTheDocument();
  });

  it('shows loading skeleton while data is loading', () => {
    render(
      <SettingsPageShell {...baseProps} loading showTabBar showAboutCard>
        <div data-testid="panel-content">Panel</div>
      </SettingsPageShell>
    );

    expect(screen.queryByTestId('panel-content')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Store settings content')).toBeInTheDocument();
  });
});
