import { useMemo } from 'react';

export function useShippingCurrentSetup(setup) {
  return useMemo(() => {
    const rates = Array.isArray(setup?.rates) ? setup.rates : [];
    const profiles = Array.isArray(setup?.profiles) ? setup.profiles : [];
    const methodNames = Array.from(
      new Set(
        rates
          .map(rate => String(rate?.name || '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
      )
    );

    return {
      rates,
      profiles,
      methodNames,
      hasRates: rates.length > 0,
      hasProfiles: profiles.length > 0,
    };
  }, [setup]);
}
