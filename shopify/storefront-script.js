/**
 * Storefront Integration Script
 * 
 * This script is injected into the Shopify storefront to:
 * 1. Get variant assignments for users
 * 2. Apply test variations (prices, content, etc.)
 * 3. Track conversion events
 * 
 * Add this to your theme's theme.liquid file or as a theme app extension
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    apiUrl: 'https://your-app-url.com/api', // Replace with your app URL
    cookieName: 'ab_test_user_id',
    cookieExpiry: 365 // days
  };

  /**
   * Generate or retrieve user ID
   */
  function getUserId() {
    let userId = getCookie(CONFIG.cookieName);
    
    if (!userId) {
      // Generate a unique ID
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      setCookie(CONFIG.cookieName, userId, CONFIG.cookieExpiry);
    }
    
    return userId;
  }

  /**
   * Get shop domain
   */
  function getShopDomain() {
    return window.Shopify?.shop || document.domain.replace('.myshopify.com', '');
  }

  /**
   * Get variant for a test
   */
  async function getVariant(testId) {
    const userId = getUserId();
    const shopDomain = getShopDomain();
    
    try {
      const response = await fetch(
        `${CONFIG.apiUrl}/track/variant?test_id=${testId}&user_id=${userId}&shop_domain=${shopDomain}`
      );
      
      if (response.ok) {
        const data = await response.json();
        return data.variant;
      }
    } catch (error) {
      console.error('Error getting variant:', error);
    }
    
    return null;
  }

  /**
   * Track conversion event
   */
  async function trackConversion(testId, variantId, value = 0, metadata = {}) {
    const userId = getUserId();
    const shopDomain = getShopDomain();
    
    try {
      await fetch(`${CONFIG.apiUrl}/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          test_id: testId,
          variant_id: variantId,
          user_id: userId,
          shop_domain: shopDomain,
          event_type: 'conversion',
          event_value: value,
          metadata: metadata
        })
      });
    } catch (error) {
      console.error('Error tracking conversion:', error);
    }
  }

  /**
   * Apply price test
   */
  async function applyPriceTest(testId, productId, variantId) {
    const variant = await getVariant(testId);
    
    if (!variant) return;
    
    // Find the price element and update it
    const priceSelectors = [
      `.product-price[data-product-id="${productId}"]`,
      `.price[data-variant-id="${variantId}"]`,
      `.product__price`
    ];
    
    priceSelectors.forEach(selector => {
      const element = document.querySelector(selector);
      if (element && variant.config && variant.config.price) {
        element.textContent = formatPrice(variant.config.price);
        element.setAttribute('data-test-variant', variant.variantId);
      }
    });
  }

  /**
   * Track checkout completion
   */
  function trackCheckout() {
    // This would be called on the order confirmation page
    if (window.Shopify?.checkout) {
      const orderId = window.Shopify.checkout.order_id;
      const totalPrice = window.Shopify.checkout.total_price;
      
      // Get all active test variants from the page
      const testVariants = document.querySelectorAll('[data-test-variant]');
      
      testVariants.forEach(element => {
        const testId = element.getAttribute('data-test-id');
        const variantId = element.getAttribute('data-test-variant');
        
        if (testId && variantId) {
          trackConversion(testId, variantId, parseFloat(totalPrice) / 100, {
            order_id: orderId
          });
        }
      });
    }
  }

  /**
   * Cookie helpers
   */
  function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = 'expires=' + date.toUTCString();
    document.cookie = name + '=' + value + ';' + expires + ';path=/';
  }

  function getCookie(name) {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  /**
   * Format price
   */
  function formatPrice(price) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  }

  /**
   * Initialize on page load
   */
  function init() {
    // Check if we're on the order confirmation page
    if (window.location.pathname.includes('/thank_you') || 
        window.location.pathname.includes('/orders/')) {
      trackCheckout();
    }

    // Apply any active price tests
    // This would be configured based on your active tests
    const activeTests = window.AB_TEST_CONFIG?.activeTests || [];
    
    activeTests.forEach(test => {
      if (test.type === 'price') {
        applyPriceTest(test.id, test.targetId, test.variantId);
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for use in other scripts
  window.ABTestTracker = {
    getVariant,
    trackConversion,
    applyPriceTest
  };

})();

