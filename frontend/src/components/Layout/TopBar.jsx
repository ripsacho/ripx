/**
 * Top Bar Component
 * 
 * Premium top navigation bar with user menu and settings
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  InlineStack,
  Popover,
  ActionList
} from '@shopify/polaris';

function TopBar({ sidebarWidth = 280, sidebarCollapsed = false }) {
  const navigate = useNavigate();
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
        left: `${sidebarWidth}px`,
        right: 0
      }}
    >
      {/* Right Side: Notifications, Settings, User Menu */}
      <InlineStack gap="200" align="end" style={{ flexShrink: 0 }}>
        {/* Notifications */}
        <button
          onClick={() => {}}
          aria-label="Notifications"
          className="top-bar-icon"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div className="notification-badge" />
        </button>

        {/* Settings Menu */}
        <Popover
          active={settingsMenuActive}
          activator={
              <button
                onClick={toggleSettingsMenu}
                aria-label="Settings"
                className={`top-bar-icon ${settingsMenuActive ? 'active' : ''}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            }
            onClose={toggleSettingsMenu}
            preferredAlignment="right"
            preferredPosition="below"
          >
            <ActionList items={settingsMenuActions} />
          </Popover>

        {/* User Menu - Icon Only */}
        <Popover
          active={userMenuActive}
          activator={
              <button
                onClick={toggleUserMenu}
                aria-label="User menu"
                className={`top-bar-icon ${userMenuActive ? 'active' : ''}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
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
