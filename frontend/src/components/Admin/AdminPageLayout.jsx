/**
 * AdminPageLayout
 *
 * Wraps admin page content with a single hero (AdminHero) and hides the Polaris Page header
 * to avoid duplicate titles. Uses pathname to look up title, subtitle, icon from adminHeroConfig.
 */

import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Page } from '@shopify/polaris';
import AdminHero from './AdminHero';
import { ADMIN_HERO_CONFIG } from './adminHeroConfig';

export default function AdminPageLayout({ children, primaryAction, secondaryActions = [] }) {
  const { pathname } = useLocation();
  const config = ADMIN_HERO_CONFIG[pathname] || {
    title: 'Admin',
    subtitle: '',
    icon: null,
  };

  useEffect(() => {
    if (config.title) {
      document.title = `${config.title} – Admin`;
    }
  }, [config.title]);

  return (
    <Page title="">
      <AdminHero
        title={config.title}
        subtitle={config.subtitle}
        icon={config.icon}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
      />
      {children}
    </Page>
  );
}
