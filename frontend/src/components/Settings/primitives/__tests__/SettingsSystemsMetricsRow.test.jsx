/** @jest-environment jsdom */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsSystemsMetricsRow } from '../SettingsSystemsMetricsRow';

jest.mock(
  '../../Settings.module.css',
  () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => String(prop),
      }
    )
);

describe('SettingsSystemsMetricsRow', () => {
  const metrics = [
    {
      id: 'storefront',
      label: 'Storefront',
      value: 'Live',
      hint: 'Script detected',
      status: 'ok',
      tabId: 'installation',
    },
    {
      id: 'connections',
      label: 'Connections',
      value: '0/2',
      hint: 'Optional analytics destinations',
      status: 'neutral',
      tabId: 'integrations',
    },
  ];

  it('renders metrics and invokes navigation callback', () => {
    const onMetricSelect = jest.fn();
    render(<SettingsSystemsMetricsRow metrics={metrics} onMetricSelect={onMetricSelect} />);

    expect(screen.getByRole('region', { name: 'Store systems status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Storefront: Live/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Connections: 0\/2/i }));
    expect(onMetricSelect).toHaveBeenCalledWith('integrations', 'connections');
  });
});
