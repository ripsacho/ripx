/**
 * Theme Management Utility
 * 
 * Handles theme switching, auto mode (7am-7pm light, 7pm-7am dark),
 * and persistence
 */

/**
 * Get current time-based theme (for auto mode)
 * Light: 7am - 7pm (07:00 - 19:00)
 * Dark: 7pm - 7am (19:00 - 07:00)
 * 
 * @param {Object} customTimes - Optional custom times { start: number, end: number }
 */
export const getTimeBasedTheme = (customTimes = null) => {
  const now = new Date();
  const hour = now.getHours();
  
  let lightStart, lightEnd;
  
  if (customTimes) {
    lightStart = customTimes.start;
    lightEnd = customTimes.end;
  } else {
    // Default: 7am (7) to 7pm (19)
    lightStart = 7;
    lightEnd = 19;
  }
  
  // Handle case where light theme spans midnight
  if (lightStart < lightEnd) {
    // Normal case: lightStart to lightEnd = light theme
    if (hour >= lightStart && hour < lightEnd) {
      return 'light';
    }
    return 'dark';
  } else {
    // Spans midnight: lightStart to 24, then 0 to lightEnd = light theme
    if (hour >= lightStart || hour < lightEnd) {
      return 'light';
    }
    return 'dark';
  }
};

/**
 * Apply theme to document
 * 
 * @param {string} theme - Theme mode: 'light', 'dark', 'auto', or 'custom'
 * @param {Object} customTimes - Optional custom times for 'custom' mode { start: number, end: number }
 */
export const applyTheme = (theme, customTimes = null) => {
  const root = document.documentElement;
  
  if (theme === 'auto') {
    const timeBasedTheme = getTimeBasedTheme();
    root.setAttribute('data-theme', timeBasedTheme);
    root.setAttribute('data-theme-mode', 'auto');
  } else if (theme === 'custom') {
    const timeBasedTheme = getTimeBasedTheme(customTimes);
    root.setAttribute('data-theme', timeBasedTheme);
    root.setAttribute('data-theme-mode', 'custom');
    if (customTimes) {
      root.setAttribute('data-theme-start', customTimes.start.toString());
      root.setAttribute('data-theme-end', customTimes.end.toString());
    }
  } else {
    root.setAttribute('data-theme', theme);
    root.removeAttribute('data-theme-mode');
    root.removeAttribute('data-theme-start');
    root.removeAttribute('data-theme-end');
  }
};

/**
 * Get saved theme preference from localStorage
 */
export const getSavedTheme = () => {
  try {
    const saved = localStorage.getItem('ripx_preferences');
    if (saved) {
      const preferences = JSON.parse(saved);
      return preferences.theme || 'light';
    }
  } catch (err) {
    console.error('Error loading theme preference:', err);
  }
  return 'light';
};

/**
 * Initialize theme on app load
 */
export const initializeTheme = () => {
  try {
    const saved = localStorage.getItem('ripx_preferences');
    const preferences = saved ? JSON.parse(saved) : {};
    const theme = preferences.theme || 'light';
    
    if (theme === 'custom' && preferences.customThemeStart !== undefined && preferences.customThemeEnd !== undefined) {
      applyTheme('custom', {
        start: preferences.customThemeStart,
        end: preferences.customThemeEnd
      });
    } else {
      applyTheme(theme);
    }
    
    // If auto or custom mode, set up interval to check time
    if (theme === 'auto' || theme === 'custom') {
      // Check every minute for time-based theme changes
      setInterval(() => {
        const saved = localStorage.getItem('ripx_preferences');
        const prefs = saved ? JSON.parse(saved) : {};
        const currentTheme = prefs.theme || 'light';
        
        if (currentTheme === 'auto') {
          applyTheme('auto');
        } else if (currentTheme === 'custom' && prefs.customThemeStart !== undefined && prefs.customThemeEnd !== undefined) {
          applyTheme('custom', {
            start: prefs.customThemeStart,
            end: prefs.customThemeEnd
          });
        }
      }, 60000); // Check every minute
    }
  } catch (err) {
    console.error('Error initializing theme:', err);
    applyTheme('light');
  }
};

/**
 * Update theme preference
 * 
 * @param {string} theme - Theme mode: 'light', 'dark', 'auto', or 'custom'
 * @param {Object} customTimes - Optional custom times for 'custom' mode { start: number, end: number }
 */
export const updateTheme = (theme, customTimes = null) => {
  try {
    const saved = localStorage.getItem('ripx_preferences');
    const preferences = saved ? JSON.parse(saved) : {};
    preferences.theme = theme;
    
    if (customTimes) {
      preferences.customThemeStart = customTimes.start;
      preferences.customThemeEnd = customTimes.end;
    }
    
    localStorage.setItem('ripx_preferences', JSON.stringify(preferences));
    
    if (theme === 'custom' && customTimes) {
      applyTheme('custom', customTimes);
    } else {
      applyTheme(theme);
    }
  } catch (err) {
    console.error('Error updating theme:', err);
  }
};

