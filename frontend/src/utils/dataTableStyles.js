/**
 * DataTable Styles Utility
 *
 * Common utility for applying dark theme styles to DataTable buttons
 * Reduces code duplication across components
 */

/**
 * Apply dark theme styles to DataTable buttons
 * This is a workaround for Polaris DataTable buttons not respecting dark theme
 *
 * @param {boolean} isDarkTheme - Whether dark theme is active
 */
export function applyDataTableButtonStyles(isDarkTheme) {
  if (!isDarkTheme) return;

  const buttons = document.querySelectorAll(
    '.Polaris-DataTable td .Polaris-Button--plain, .Polaris-DataTable td .Polaris-Button[plain]'
  );

  buttons.forEach(button => {
    const computedStyle = window.getComputedStyle(button);
    const bgColor = computedStyle.backgroundColor;

    // Only apply if background is transparent or white
    if (
      bgColor === 'rgba(0, 0, 0, 0)' ||
      bgColor === 'rgb(255, 255, 255)' ||
      bgColor === 'transparent'
    ) {
      button.style.setProperty('background', 'transparent', 'important');
      button.style.setProperty('color', 'var(--accent-primary)', 'important');
    }
  });
}

/**
 * Set up automatic DataTable button styling
 * Call this in useEffect to continuously apply styles
 *
 * @returns {Function} Cleanup function
 */
export function setupDataTableButtonStyling() {
  const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';

  if (!isDarkTheme) {
    return () => {}; // No-op cleanup
  }

  // Apply immediately
  applyDataTableButtonStyles(true);

  // Watch for DOM changes
  const observer = new MutationObserver(() => {
    applyDataTableButtonStyles(true);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Also apply on interval as fallback
  const interval = setInterval(() => {
    applyDataTableButtonStyles(true);
  }, 500);

  // Cleanup function
  return () => {
    observer.disconnect();
    clearInterval(interval);
  };
}
