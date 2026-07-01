/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { TechnicalHealthChecksPanel } from '../TechnicalHealthChecksPanel';

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

jest.mock('@shopify/polaris', () => ({
  Badge: ({ children }) => <span data-testid="badge">{children}</span>,
  Button: ({ children, onClick, pressed }) => (
    <button type="button" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  ),
  Text: ({ children, as: Tag = 'span' }) => <Tag>{children}</Tag>,
}));

describe('TechnicalHealthChecksPanel', () => {
  it('shows blocking summary and opens the panel by default', () => {
    render(
      <TechnicalHealthChecksPanel
        storeHealth={{
          checks: [
            {
              key: 'checkout_diag',
              ok: false,
              required: true,
              message: 'Batch URL missing',
            },
          ],
        }}
      />
    );

    expect(screen.getByText('Technical health checks')).toBeInTheDocument();
    expect(screen.getByText(/1 blocking issue/)).toBeInTheDocument();
    expect(screen.getByText('Batch URL missing')).toBeInTheDocument();
  });

  it('renders passing summary when all required checks pass', () => {
    render(
      <TechnicalHealthChecksPanel
        storeHealth={{
          checks: [{ key: 'script_detected', ok: true, required: true, message: 'Script ok' }],
        }}
      />
    );

    expect(screen.getByText(/All required checks are passing/)).toBeInTheDocument();
  });
});
