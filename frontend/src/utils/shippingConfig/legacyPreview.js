export const DEFAULT_LEGACY_PREVIEW_LABEL_PREFIXES = ['RipX Preview', 'New'];

export function collectLegacyPreviewLabelPrefixes(cfg = {}) {
  const configured = String(
    cfg.preview_label_prefix || cfg.previewLabelPrefix || cfg.label_prefix || cfg.labelPrefix || ''
  ).trim();
  return Array.from(
    new Set([configured, ...DEFAULT_LEGACY_PREVIEW_LABEL_PREFIXES].filter(Boolean))
  );
}

export function stripLegacyPreviewLabelFromName(
  name,
  prefixes = DEFAULT_LEGACY_PREVIEW_LABEL_PREFIXES
) {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) return '';

  for (const prefix of prefixes) {
    const normalizedPrefix = String(prefix || '').trim();
    if (!normalizedPrefix) continue;
    const lowerName = normalizedName.toLowerCase();
    const lowerPrefix = normalizedPrefix.toLowerCase();
    if (lowerName.startsWith(`${lowerPrefix}:`)) {
      return normalizedName.slice(normalizedPrefix.length + 1).trim();
    }
    if (lowerName.startsWith(`${lowerPrefix} `)) {
      return normalizedName.slice(normalizedPrefix.length + 1).trim();
    }
  }

  return normalizedName;
}

export function sanitizeLegacyShippingPreviewConfig(cfg = {}) {
  if (!cfg || typeof cfg !== 'object') return {};
  const prefixes = collectLegacyPreviewLabelPrefixes(cfg);
  const cleaned = { ...cfg };
  delete cleaned.preview_label_prefix;
  delete cleaned.previewLabelPrefix;
  delete cleaned.label_prefix;
  delete cleaned.labelPrefix;

  if (Array.isArray(cleaned.rates)) {
    cleaned.rates = cleaned.rates.map(rate => {
      const item = rate && typeof rate === 'object' ? { ...rate } : {};
      ['name', 'service_name', 'serviceName'].forEach(field => {
        if (item[field]) {
          item[field] = stripLegacyPreviewLabelFromName(item[field], prefixes);
        }
      });
      return item;
    });
  }

  if (cleaned.label) {
    cleaned.label = stripLegacyPreviewLabelFromName(cleaned.label, prefixes);
  }

  const metadata =
    cleaned.metadata && typeof cleaned.metadata === 'object' ? { ...cleaned.metadata } : null;
  if (metadata) {
    if (metadata.quote_service_name) {
      metadata.quote_service_name = stripLegacyPreviewLabelFromName(
        metadata.quote_service_name,
        prefixes
      );
    }
    if (metadata.quoteServiceName) {
      metadata.quoteServiceName = stripLegacyPreviewLabelFromName(
        metadata.quoteServiceName,
        prefixes
      );
    }
    cleaned.metadata = metadata;
  }

  return cleaned;
}
