/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 * Supports resetKeys to auto-reset when route/keys change (e.g. navigation).
 */

import React from 'react';
import { Page, Card, Button, BlockStack, Text, InlineStack } from '@shopify/polaris';
import { ROUTES } from '../../constants';
import styles from './ErrorBoundary.module.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true };
  }

  componentDidUpdate(prevProps) {
    if (
      this.state.hasError &&
      this.props.resetKeys &&
      prevProps.resetKeys &&
      (this.props.resetKeys.length !== prevProps.resetKeys.length ||
        this.props.resetKeys.some((key, i) => key !== prevProps.resetKeys[i]))
    ) {
      this.setState({ hasError: false, error: null, errorInfo: null });
    }
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('Error caught by boundary:', error, errorInfo);
    }

    this.setState({
      error,
      errorInfo,
    });

    // Report to backend for centralized logging; Sentry when SENTRY_DSN is set
    if (!import.meta.env.DEV) {
      try {
        const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') || '/api';
        fetch(`${baseUrl}/track/client-error`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: (error?.message || 'Unknown error').slice(0, 2000),
            stack: (error?.stack || '').slice(0, 5000),
            componentStack: (errorInfo?.componentStack || '').slice(0, 2000),
            url: window.location.href?.slice(0, 500) || '',
            shopDomain: window?.Shopify?.shop || null,
            metadata: {
              userAgent: navigator.userAgent?.slice(0, 200) || '',
            },
          }),
        }).catch(() => {});
        // Placeholder: when VITE_SENTRY_DSN is set, add Sentry.captureException(error)
      } catch (_reportError) {
        // Ignore reporting errors to avoid recursive failures
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.resetOnError) {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.errorPage} role="alert" aria-live="assertive">
          <Page title="Something went wrong">
            <Card sectioned>
              <BlockStack gap="400">
                <div>
                  <Text variant="headingLg" as="h2" tone="critical">
                    Something went wrong
                  </Text>
                  <Text variant="bodyMd" as="p" tone="subdued">
                    We&apos;re sorry, but something unexpected happened. Please try refreshing the
                    page.
                  </Text>
                </div>

                {import.meta.env.DEV && this.state.error && (
                  <Card sectioned>
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">
                        Error Details (Development Only)
                      </Text>
                      <Text
                        variant="bodySm"
                        as="pre"
                        style={{
                          background: 'var(--bg-tertiary)',
                          padding: '1rem',
                          borderRadius: '4px',
                          overflow: 'auto',
                          fontSize: '0.875rem',
                        }}
                      >
                        {this.state.error.toString()}
                        {this.state.errorInfo?.componentStack}
                      </Text>
                    </BlockStack>
                  </Card>
                )}

                <InlineStack gap="200">
                  <Button
                    variant="primary"
                    onClick={this.handleReset}
                    aria-label="Try again and reload the page"
                  >
                    Try Again
                  </Button>
                  <Button
                    onClick={() => {
                      window.location.href = ROUTES.DASHBOARD;
                      window.location.reload();
                    }}
                    aria-label="Go to dashboard and reload"
                  >
                    Go to Dashboard
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Page>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
