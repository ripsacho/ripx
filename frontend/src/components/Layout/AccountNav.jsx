/**
 * AccountNav – shared top bar for User panel (/) and My domains (/domains).
 * Provides consistent navigation: Home | My domains | Admin (if admin) | Sign out.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@shopify/polaris';
import { GlobeIcon, HomeIcon } from '@shopify/polaris-icons';
import { ROUTES } from '../../constants';
import { useAdminMe } from '../../hooks';
import { clearAuthStorage, logout, redirectToAppUrl, getConnectUrl } from '../../services';
import styles from './AccountNav.module.css';

const LockIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function AccountNav({ current = 'home' }) {
  const { isAdmin, isLoading } = useAdminMe();

  const handleSignOut = () => {
    logout();
    clearAuthStorage();
    redirectToAppUrl(getConnectUrl());
  };

  return (
    <header className={styles.accountNav} role="banner">
      <div className={styles.accountNavInner}>
        <Link to={ROUTES.USER_PANEL} className={styles.accountNavLogo} aria-label="RipX Home">
          <img src="/logo.svg" alt="" className={styles.accountNavLogoImg} width={32} height={32} />
          <span className={styles.accountNavLogoText}>RipX</span>
        </Link>

        <nav className={styles.accountNavLinks} aria-label="Account navigation">
          <Link
            to={ROUTES.USER_PANEL}
            className={`${styles.accountNavLink} ${current === 'home' ? styles.accountNavLinkCurrent : ''}`}
            aria-current={current === 'home' ? 'page' : undefined}
          >
            <Icon source={HomeIcon} tone="base" />
            <span>Home</span>
          </Link>
          <Link
            to={ROUTES.DOMAINS}
            className={`${styles.accountNavLink} ${current === 'domains' ? styles.accountNavLinkCurrent : ''}`}
            aria-current={current === 'domains' ? 'page' : undefined}
          >
            <Icon source={GlobeIcon} tone="base" />
            <span>My domains</span>
          </Link>
          {!isLoading && isAdmin && (
            <Link to={ROUTES.ADMIN} className={styles.accountNavLinkAdmin} aria-label="Admin panel">
              <LockIcon />
              <span>Admin</span>
            </Link>
          )}
        </nav>

        <div className={styles.accountNavActions}>
          <button
            type="button"
            onClick={handleSignOut}
            className={styles.accountNavSignOut}
            aria-label="Sign out"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
