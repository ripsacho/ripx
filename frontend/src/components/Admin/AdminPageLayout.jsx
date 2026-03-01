/**
 * AdminPageLayout
 *
 * Wraps admin page content with a single hero (AdminHero) and hides the Polaris Page header
 * to avoid duplicate titles. Uses pathname to look up title, subtitle, icon from adminHeroConfig.
 */

import React from 'react';
import { useLocation } from 'react-router-dom';
import { Page } from '@shopify/polaris';
import { ROUTES } from '../../constants';
import AdminHero from './AdminHero';
import { ADMIN_HERO_CONFIG } from './adminHeroConfig';

export default function AdminPageLayout({ children, primaryAction, secondaryActions = [] }) {
  const { pathname } = useLocation();
  const config = ADMIN_HERO_CONFIG[pathname] || {
    title: 'Admin',
    subtitle: '',
    icon: null,
  };

  const isOverview = pathname === ROUTES.ADMIN_OVERVIEW || pathname === ROUTES.ADMIN;
  const backLabel = isOverview ? 'App' : 'Admin';
  const backUrl = isOverview ? '/' : ROUTES.ADMIN;

  return (
    <Page title={config.title}>
      <AdminHero
        title={config.title}
        subtitle={config.subtitle}
        icon={config.icon}
        backLabel={backLabel}
        backUrl={backUrl}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
      />
      {children}
    </Page>
  );
}
