/**
 * Targeting Service
 *
 * Handles user targeting and segmentation for AB tests.
 * Supports geographic, device, customer segment, and custom targeting.
 */

class TargetingService {
  /**
   * Check if user matches targeting criteria
   *
   * @param {Object} targeting - Targeting configuration
   * @param {Object} userContext - User context (IP, device, location, etc.)
   * @returns {boolean} Whether user matches targeting
   */
  matchesTargeting(targeting, userContext) {
    if (!targeting || !targeting.enabled) {
      return true; // No targeting = show to everyone
    }

    // Geographic targeting
    if (targeting.geographic && !this.matchesGeographic(targeting.geographic, userContext)) {
      return false;
    }

    // Device targeting
    if (targeting.device && !this.matchesDevice(targeting.device, userContext)) {
      return false;
    }

    // Customer segment targeting
    if (targeting.customerSegment && !this.matchesCustomerSegment(targeting.customerSegment, userContext)) {
      return false;
    }

    // Time-based targeting
    if (targeting.timeBased && !this.matchesTimeBased(targeting.timeBased)) {
      return false;
    }

    // Custom rules
    if (targeting.customRules && !this.matchesCustomRules(targeting.customRules, userContext)) {
      return false;
    }

    return true;
  }

  /**
   * Check geographic targeting
   *
   * @param {Object} geographic - Geographic targeting config
   * @param {Object} userContext - User context
   * @returns {boolean}
   */
  matchesGeographic(geographic, userContext) {
    if (!geographic.enabled) {return true;}

    const userCountry = userContext.country || userContext.geo?.country;
    const userRegion = userContext.region || userContext.geo?.region;
    const userCity = userContext.city || userContext.geo?.city;

    // Country targeting
    if (geographic.countries && geographic.countries.length > 0) {
      if (!geographic.countries.includes(userCountry)) {
        return false;
      }
    }

    // Exclude countries
    if (geographic.excludeCountries && geographic.excludeCountries.includes(userCountry)) {
      return false;
    }

    // Region targeting
    if (geographic.regions && geographic.regions.length > 0) {
      if (!geographic.regions.includes(userRegion)) {
        return false;
      }
    }

    // City targeting
    if (geographic.cities && geographic.cities.length > 0) {
      if (!geographic.cities.includes(userCity)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check device targeting
   *
   * @param {Object} device - Device targeting config
   * @param {Object} userContext - User context
   * @returns {boolean}
   */
  matchesDevice(device, userContext) {
    if (!device.enabled) {return true;}

    const userDevice = userContext.device || this.detectDevice(userContext.userAgent);

    // Device type
    if (device.types && device.types.length > 0) {
      if (!device.types.includes(userDevice.type)) {
        return false;
      }
    }

    // Browser targeting
    if (device.browsers && device.browsers.length > 0) {
      const browser = this.detectBrowser(userContext.userAgent);
      if (!device.browsers.includes(browser)) {
        return false;
      }
    }

    // Screen size targeting
    if (device.screenSize) {
      const screenWidth = userContext.screenWidth || 0;
      if (device.screenSize.min && screenWidth < device.screenSize.min) {
        return false;
      }
      if (device.screenSize.max && screenWidth > device.screenSize.max) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check customer segment targeting
   *
   * @param {Object} segment - Customer segment config
   * @param {Object} userContext - User context
   * @returns {boolean}
   */
  matchesCustomerSegment(segment, userContext) {
    if (!segment.enabled) {return true;}

    const customerTags = userContext.customerTags || [];
    const customerType = userContext.customerType; // 'new', 'returning', 'vip', etc.
    const totalSpent = userContext.totalSpent || 0;
    const orderCount = userContext.orderCount || 0;

    // Tag matching
    if (segment.tags && segment.tags.length > 0) {
      const hasMatchingTag = segment.tags.some(tag => customerTags.includes(tag));
      if (!hasMatchingTag) {
        return false;
      }
    }

    // Customer type
    if (segment.customerType && segment.customerType !== customerType) {
      return false;
    }

    // Total spent range
    if (segment.totalSpent) {
      if (segment.totalSpent.min && totalSpent < segment.totalSpent.min) {
        return false;
      }
      if (segment.totalSpent.max && totalSpent > segment.totalSpent.max) {
        return false;
      }
    }

    // Order count range
    if (segment.orderCount) {
      if (segment.orderCount.min && orderCount < segment.orderCount.min) {
        return false;
      }
      if (segment.orderCount.max && orderCount > segment.orderCount.max) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check time-based targeting
   *
   * @param {Object} timeBased - Time-based config
   * @returns {boolean}
   */
  matchesTimeBased(timeBased) {
    if (!timeBased.enabled) {return true;}

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Time of day
    if (timeBased.timeOfDay) {
      if (timeBased.timeOfDay.start && currentHour < timeBased.timeOfDay.start) {
        return false;
      }
      if (timeBased.timeOfDay.end && currentHour >= timeBased.timeOfDay.end) {
        return false;
      }
    }

    // Day of week
    if (timeBased.daysOfWeek && timeBased.daysOfWeek.length > 0) {
      if (!timeBased.daysOfWeek.includes(currentDay)) {
        return false;
      }
    }

    // Date range
    if (timeBased.dateRange) {
      const startDate = new Date(timeBased.dateRange.start);
      const endDate = new Date(timeBased.dateRange.end);
      if (now < startDate || now > endDate) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check custom rules
   *
   * @param {Array} customRules - Custom targeting rules
   * @param {Object} userContext - User context
   * @returns {boolean}
   */
  matchesCustomRules(customRules, userContext) {
    if (!customRules || customRules.length === 0) {return true;}

    // Evaluate each rule
    return customRules.every(rule => {
      const field = userContext[rule.field];
      const value = rule.value;
      const operator = rule.operator || 'equals';

      switch (operator) {
        case 'equals':
          return field === value;
        case 'not_equals':
          return field !== value;
        case 'contains':
          return String(field).includes(value);
        case 'greater_than':
          return Number(field) > Number(value);
        case 'less_than':
          return Number(field) < Number(value);
        case 'in':
          return Array.isArray(value) && value.includes(field);
        default:
          return true;
      }
    });
  }

  /**
   * Detect device type from user agent
   *
   * @param {string} userAgent - User agent string
   * @returns {Object} Device info
   */
  detectDevice(userAgent) {
    if (!userAgent) {return { type: 'desktop' };}

    const ua = userAgent.toLowerCase();

    if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
      return { type: 'mobile' };
    } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
      return { type: 'tablet' };
    } else {
      return { type: 'desktop' };
    }
  }

  /**
   * Detect browser from user agent
   *
   * @param {string} userAgent - User agent string
   * @returns {string} Browser name
   */
  detectBrowser(userAgent) {
    if (!userAgent) {return 'unknown';}

    const ua = userAgent.toLowerCase();

    if (ua.includes('chrome')) {return 'chrome';}
    if (ua.includes('firefox')) {return 'firefox';}
    if (ua.includes('safari') && !ua.includes('chrome')) {return 'safari';}
    if (ua.includes('edge')) {return 'edge';}
    if (ua.includes('opera')) {return 'opera';}

    return 'unknown';
  }
}

module.exports = new TargetingService();

