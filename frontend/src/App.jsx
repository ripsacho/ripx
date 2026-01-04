/**
 * Main App Component
 * 
 * Root component for the Shopify AB Testing App
 */

import React, { useState, useEffect } from 'react';
import { AppProvider } from '@shopify/polaris';
import '@shopify/polaris/build/esm/styles.css';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { initializeTheme } from './utils/theme';

import { Sidebar, TopBar } from './components/Layout';
import Dashboard from './components/Dashboard/Dashboard';
import TestList from './components/TestList/TestList';
import TestCreator from './components/TestCreator/TestCreator';
import TestDetail from './components/TestDetail/TestDetail';
import Analytics from './components/Analytics/Analytics';
import AnalyticsOverview from './components/Analytics/AnalyticsOverview';
import Settings from './components/Settings/Settings';
import Profile from './components/Profile/Profile';
import Export from './components/Export/Export';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';

// Wrapper component to get testId from route params
function ExportWrapper() {
  const { id } = useParams();
  return <Export testId={id} />;
}

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarWidth = sidebarCollapsed ? 80 : 280;

  // Initialize theme on app load
  useEffect(() => {
    initializeTheme();
    
    // Set up interval to check for auto/custom theme changes
    const interval = setInterval(() => {
      try {
        const saved = localStorage.getItem('ripx_preferences');
        if (saved) {
          const preferences = JSON.parse(saved);
          if (preferences.theme === 'auto' || preferences.theme === 'custom') {
            initializeTheme();
          }
        }
      } catch (err) {
        console.error('Error checking theme:', err);
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  return (
    <AppProvider
      i18n={{
        Polaris: {
          Avatar: {
            label: 'Avatar',
            labelWithInitials: 'Avatar with initials {initials}',
          },
          ContextualSaveBar: {
            save: 'Save',
            discard: 'Discard',
          },
          TextField: {
            characterCount: '{count} characters',
          },
        },
      }}
    >
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}
      >
        <div style={{ 
          display: 'flex', 
          minHeight: '100vh', 
          backgroundColor: 'var(--bg-primary)',
          position: 'relative',
          transition: 'background-color 0.3s ease'
        }}>
          <Sidebar 
            collapsed={sidebarCollapsed} 
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
          <div
            style={{
              marginLeft: sidebarWidth,
              width: `calc(100% - ${sidebarWidth}px)`,
              transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              minHeight: '100vh',
              position: 'relative'
            }}
          >
            <TopBar 
              sidebarWidth={sidebarWidth} 
              sidebarCollapsed={sidebarCollapsed}
            />
            <div 
              className="main-content-wrapper"
              style={{ 
                marginTop: '44px', 
                padding: '2rem',
                maxWidth: '1400px',
                marginLeft: 'auto',
                marginRight: 'auto',
                width: '100%',
                backgroundColor: 'var(--bg-primary)',
                minHeight: 'calc(100vh - 44px)',
                transition: 'background-color 0.3s ease'
              }}
            >
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/tests" element={<TestList />} />
                  <Route path="/tests/new" element={<TestCreator />} />
                  <Route path="/tests/:id" element={<TestDetail />} />
                  <Route path="/tests/:id/analytics" element={<Analytics />} />
                  <Route path="/tests/:id/export" element={<ExportWrapper />} />
                  <Route path="/analytics" element={<AnalyticsOverview />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/profile" element={<Profile />} />
                  {/* Catch-all route for unmatched paths */}
                  <Route path="*" element={<Dashboard />} />
                </Routes>
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;

