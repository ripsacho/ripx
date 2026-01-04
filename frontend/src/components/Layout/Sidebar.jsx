/**
 * Sidebar Navigation Component
 * 
 * Premium collapsible sidebar with enhanced UI
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BlockStack,
  InlineStack,
  Text
} from '@shopify/polaris';

const navigationItems = [
  { path: '/', label: 'Dashboard', icon: '📊', color: '#008060' },
  { path: '/tests', label: 'All Tests', icon: '🧪', color: '#5C6AC4' },
  { path: '/tests/new', label: 'Create Test', icon: '✨', color: '#5C6AC4' },
  { path: '/analytics', label: 'Analytics', icon: '📈', color: '#F49342' },
  { path: '/settings', label: 'Settings', icon: '⚙️', color: '#637381' }
];

function Sidebar({ collapsed = false }) {
  const [showLogo, setShowLogo] = useState(true);
  const [showIcon, setShowIcon] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path) => {
    // Exact match for root
    if (path === '/') {
      return location.pathname === '/';
    }
    
    // Exact match
    if (location.pathname === path) {
      return true;
    }
    
    // For paths that start with the navigation path, check if it's not another nav item
    if (location.pathname.startsWith(path)) {
      // Get all other navigation paths that are longer/more specific
      const otherPaths = navigationItems
        .map(item => item.path)
        .filter(p => p !== path && p.startsWith(path));
      
      // If there are more specific paths, check if current pathname matches any of them
      // If it does, this item should not be active
      if (otherPaths.length > 0) {
        const matchesMoreSpecific = otherPaths.some(otherPath => 
          location.pathname === otherPath || location.pathname.startsWith(otherPath + '/')
        );
        // Only active if it doesn't match a more specific path
        return !matchesMoreSpecific;
      }
      
      // No more specific paths, so this is active
      return true;
    }
    
    return false;
  };

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Logo/Brand Section */}
      <div className="sidebar-header">
        {!collapsed ? (
          <div 
            onClick={() => navigate('/')}
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}
          >
            {showLogo && (
              <img 
                src="/RipsX.png" 
                alt="RipX Logo" 
                style={{
                  height: '40px',
                  width: 'auto',
                  objectFit: 'contain',
                  flexShrink: 0
                }}
                onError={(e) => {
                  // Try SVG fallback
                  if (e.target.src !== '/logo.svg') {
                    e.target.src = '/logo.svg';
                  } else {
                    // Hide image on error, show text fallback
                    setShowLogo(false);
                    e.target.style.display = 'none';
                  }
                }}
              />
            )}
            <div>
              <Text variant="headingLg" as="h2" fontWeight="bold" tone="base">
                RipX
              </Text>
              <Text variant="bodySm" as="p" tone="subdued">
                AB Testing Platform
              </Text>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => navigate('/')}
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%'
            }}
          >
            {showIcon && (
              <img 
                src="/icon.svg" 
                alt="RipX Icon" 
                style={{
                  height: '32px',
                  width: '32px',
                  objectFit: 'contain'
                }}
                onError={(e) => {
                  // Hide image on error, show text fallback
                  setShowIcon(false);
                  e.target.style.display = 'none';
                }}
              />
            )}
            {!showIcon && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <Text variant="headingLg" as="h2" fontWeight="bold" tone="base">
                  R
                </Text>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <div className="sidebar-nav">
        <BlockStack gap="100">
          {navigationItems.map((item) => {
            const active = isActive(item.path);
            
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`sidebar-nav-item ${active ? 'active' : ''}`}
              >
                <span style={{ 
                  fontSize: '1.25rem',
                  opacity: active ? 1 : 0.7,
                  transition: 'opacity 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px'
                }}>
                  {item.icon}
                </span>
                {!collapsed && (
                  <Text 
                    variant="bodyMd" 
                    fontWeight={active ? 'semibold' : 'regular'}
                    tone={active ? 'base' : 'subdued'}
                    as="span"
                  >
                    {item.label}
                  </Text>
                )}
                {active && !collapsed && (
                  <div style={{
                    position: 'absolute',
                    right: '1.5rem',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-primary)',
                    boxShadow: '0 0 0 3px var(--accent-hover)'
                  }} />
                )}
              </button>
            );
          })}
        </BlockStack>
      </div>

      {/* Footer Section */}
      {!collapsed && (
        <div style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-tertiary)'
        }}>
          <Text variant="bodySm" as="p" tone="subdued" alignment="center">
            Version 1.0.0
          </Text>
        </div>
      )}
    </div>
  );
}

export default Sidebar;

