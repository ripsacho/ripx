/**
 * Error Boundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI
 */

import React from 'react';
import { Page, Card, Button, BlockStack, Text, InlineStack } from '@shopify/polaris';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('Error caught by boundary:', error, errorInfo);
    }
    
    this.setState({
      error,
      errorInfo
    });

    // TODO: Log to error reporting service (e.g., Sentry) in production
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Optionally reload the page
    if (this.props.resetOnError) {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <Page>
          <Card sectioned>
            <BlockStack gap="400">
              <div>
                <Text variant="headingLg" as="h2" tone="critical">
                  Something went wrong
                </Text>
                <Text variant="bodyMd" as="p" tone="subdued">
                  We're sorry, but something unexpected happened. Please try refreshing the page.
                </Text>
              </div>

              {import.meta.env.DEV && this.state.error && (
                <Card sectioned>
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h3">Error Details (Development Only)</Text>
                    <Text variant="bodySm" as="pre" style={{ 
                      background: 'var(--bg-tertiary)', 
                      padding: '1rem', 
                      borderRadius: '4px',
                      overflow: 'auto',
                      fontSize: '0.875rem'
                    }}>
                      {this.state.error.toString()}
                      {this.state.errorInfo?.componentStack}
                    </Text>
                  </BlockStack>
                </Card>
              )}

              <InlineStack gap="200">
                <Button primary onClick={this.handleReset}>
                  Try Again
                </Button>
                <Button onClick={() => {
                  window.location.href = '/';
                  window.location.reload();
                }}>
                  Go to Dashboard
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Page>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

