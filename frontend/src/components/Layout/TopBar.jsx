/**
 * Top Bar Component
 * 
 * Premium top navigation bar with user menu and settings
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  InlineStack,
  Button,
  Popover,
  ActionList,
  Avatar,
  Text
} from '@shopify/polaris';

function TopBar({ sidebarWidth = 280, sidebarCollapsed = false, onToggleSidebar }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [userMenuActive, setUserMenuActive] = useState(false);
  const [settingsMenuActive, setSettingsMenuActive] = useState(false);

  const toggleUserMenu = useCallback(() => setUserMenuActive((active) => !active), []);
  const toggleSettingsMenu = useCallback(() => setSettingsMenuActive((active) => !active), []);

  // Force red color for logout button in dark theme
  useEffect(() => {
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
      const applyLogoutButtonStyles = () => {
        const logoutButtons = document.querySelectorAll(
          '.top-bar .logout-action-item, .top-bar .Polaris-ActionList__Item:last-child[data-polaris-destructive], .top-bar .Polaris-ActionList__Item:last-child[data-destructive="true"]'
        );
        
        logoutButtons.forEach(button => {
          // Force red color on the button and all its children
          button.style.setProperty('color', '#ef4444', '!important');
          
          // Also target text elements inside
          const textElements = button.querySelectorAll('*');
          textElements.forEach(el => {
            const computedStyle = window.getComputedStyle(el);
            if (computedStyle.color !== 'rgb(239, 68, 68)' && computedStyle.color !== '#ef4444') {
              el.style.setProperty('color', '#ef4444', 'important');
            }
          });
        });
      };

      // Apply immediately
      applyLogoutButtonStyles();

      // Watch for DOM changes
      const observer = new MutationObserver(applyLogoutButtonStyles);
      observer.observe(document.body, { childList: true, subtree: true });

      // Also apply on interval as fallback
      const interval = setInterval(applyLogoutButtonStyles, 500);

      return () => {
        observer.disconnect();
        clearInterval(interval);
      };
    }
  }, [userMenuActive]);

  // Get page title based on route
  const getPageTitle = () => {
    if (location.pathname === '/') return 'Dashboard';
    if (location.pathname === '/tests' || location.pathname === '/tests/') return 'All Tests';
    if (location.pathname.startsWith('/tests/new')) return 'Create Test';
    if (location.pathname.startsWith('/tests/') && location.pathname.includes('/analytics')) return 'Test Analytics';
    if (location.pathname.startsWith('/tests/') && location.pathname.includes('/export')) return 'Export Test';
    if (location.pathname.startsWith('/tests/')) return 'Test Details';
    if (location.pathname === '/analytics') return 'Analytics';
    if (location.pathname === '/settings') return 'Settings';
    if (location.pathname === '/profile') return 'My Profile';
    return 'Dashboard';
  };

  const userMenuActions = [
    {
      content: 'My Profile',
      onAction: () => {
        setUserMenuActive(false);
        navigate('/profile');
      }
    },
    {
      content: 'Account Settings',
      onAction: () => {
        setUserMenuActive(false);
        navigate('/profile?tab=account');
      }
    },
    {
      content: 'Preferences',
      onAction: () => {
        setUserMenuActive(false);
        navigate('/profile?tab=preferences');
      }
    },
    {
      content: 'Logout',
      destructive: true,
      className: 'logout-action-item',
      onAction: () => {
        setUserMenuActive(false);
        // Handle logout
      }
    }
  ];

  const settingsMenuActions = [
    {
      content: 'General Settings',
      onAction: () => {
        setSettingsMenuActive(false);
        navigate('/settings');
      }
    },
    {
      content: 'Notifications',
      onAction: () => {
        setSettingsMenuActive(false);
        navigate('/profile?tab=preferences');
      }
    },
    {
      content: 'API Keys',
      onAction: () => {
        setSettingsMenuActive(false);
        navigate('/profile?tab=account');
      }
    }
  ];

  return (
    <div
      className="top-bar"
      style={{ 
        left: sidebarWidth,
        right: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.5rem',
        overflow: 'hidden'
      }}
    >
      {/* Left Side: Toggle Button + Page Title */}
      <InlineStack gap="300" align="center" blockAlign="center" style={{ flexShrink: 0, minWidth: 0 }}>
        {/* Sidebar Toggle Button */}
        <button
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            minWidth: '40px',
            height: '40px',
            borderRadius: '10px',
            padding: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg-active)',
            border: '1px solid var(--border-accent)',
            cursor: 'pointer',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            overflow: 'hidden',
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            e.currentTarget.style.borderColor = 'var(--border-accent)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-active)';
            e.currentTarget.style.borderColor = 'var(--border-accent)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <div style={{
            position: 'relative',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{
              position: 'absolute',
              width: '2px',
              height: '12px',
              backgroundColor: 'var(--accent-primary)',
              borderRadius: '1px',
              transform: sidebarCollapsed ? 'rotate(45deg) translateX(3px)' : 'rotate(-45deg) translateX(-3px)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }} />
            <div style={{
              position: 'absolute',
              width: '2px',
              height: '12px',
              backgroundColor: 'var(--accent-primary)',
              borderRadius: '1px',
              transform: sidebarCollapsed ? 'rotate(-45deg) translateX(-3px)' : 'rotate(45deg) translateX(3px)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }} />
          </div>
        </button>

        {/* Page Title Section */}
        <div style={{ maxWidth: '600px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Text variant="headingMd" as="h1" fontWeight="semibold" tone="base">
            {getPageTitle()}
          </Text>
        </div>
      </InlineStack>
      
      {/* Right Side: Notifications, Settings, User Menu */}
      <InlineStack gap="200" align="end" style={{ flexShrink: 0 }}>
        {/* Notifications */}
        <Button
          plain
          onClick={() => {}}
          accessibilityLabel="Notifications"
          className="top-bar-button"
        >
          <span style={{ fontSize: '1.25rem' }}>🔔</span>
          <div className="notification-badge" />
        </Button>

        {/* Settings Menu */}
        <Popover
          active={settingsMenuActive}
          activator={
              <Button
                plain
                onClick={toggleSettingsMenu}
                accessibilityLabel="Settings"
                className={`top-bar-button ${settingsMenuActive ? 'active' : ''}`}
              >
                <span style={{ fontSize: '1.25rem' }}>⚙️</span>
              </Button>
            }
            onClose={toggleSettingsMenu}
            preferredAlignment="right"
            preferredPosition="below"
          >
            <ActionList items={settingsMenuActions} />
          </Popover>

        {/* User Menu */}
        <Popover
          active={userMenuActive}
          activator={
              <Button
                plain
                onClick={toggleUserMenu}
                accessibilityLabel="User menu"
                className={`top-bar-button ${userMenuActive ? 'active' : ''}`}
                style={{ padding: '0.5rem 0.75rem', minWidth: 'fit-content' }}
              >
                <InlineStack gap="200" align="center">
                  <Avatar
                    name="User"
                    size="small"
                    initials="U"
                  />
                  <Text variant="bodyMd" fontWeight="medium" tone="base">
                    User
                  </Text>
                </InlineStack>
              </Button>
            }
            onClose={toggleUserMenu}
            preferredAlignment="right"
            preferredPosition="below"
          >
            <ActionList items={userMenuActions} />
          </Popover>
      </InlineStack>
    </div>
  );
}

export default TopBar;
