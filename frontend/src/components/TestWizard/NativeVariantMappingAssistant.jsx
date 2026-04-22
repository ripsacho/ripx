import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Collapsible,
  Icon,
  InlineStack,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { ChevronDownIcon, ChevronRightIcon, ProductIcon } from '@shopify/polaris-icons';

import { apiGet } from '../../services';
import styles from './TargetingSection.module.css';
import {
  PRICE_PRODUCT_MODAL_REVEAL_BATCH,
  buildProgressiveListWindow,
} from './wizardCheckoutConstants';

export default function NativeVariantMappingAssistant({
  shopDomain,
  disabled,
  currentValue,
  required = false,
  preferredProductId = null,
  title = 'Mapping assistant',
  description = 'Search Shopify products and pick the real variant RipX should add to cart when native pricing is needed.',
  onSelect,
  onClear,
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedProductId, setExpandedProductId] = useState(null);
  const [visibleProductCount, setVisibleProductCount] = useState(PRICE_PRODUCT_MODAL_REVEAL_BATCH);

  const normalizeProductIdForCompare = useCallback(value => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const gidMatch = raw.match(/Product\/\s*(\d+)/i);
    if (gidMatch) return gidMatch[1];
    const numericMatch = raw.match(/\b(\d{6,})\b/);
    if (numericMatch) return numericMatch[1];
    return raw;
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (disabled || !shopDomain) {
      setProducts([]);
      setError(null);
      setVisibleProductCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
      return;
    }
    setLoading(true);
    setError(null);
    apiGet('/shopify/product-variants', {
      shop: shopDomain,
      query: debouncedSearch.trim(),
      ...(preferredProductId ? { productId: preferredProductId } : {}),
      first: 18,
      variantsFirst: 25,
    })
      .then(res => {
        const list = res.data?.products || [];
        const emptyReason = res.data?.empty_reason || null;
        setProducts(list);
        setVisibleProductCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
        setError(list.length === 0 ? emptyReason : null);
        if (list.length > 0) {
          setExpandedProductId(prev => prev || list[0].id);
        }
      })
      .catch(err => {
        setProducts([]);
        setVisibleProductCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
        setError(
          err?.response?.data?.error ||
            err?.message ||
            'Could not load Shopify variants for mapping.'
        );
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, disabled, shopDomain, preferredProductId]);

  const normalizeVariantIdForCompare = useCallback(value => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const gidMatch = raw.match(/ProductVariant\/\s*(\d+)/i);
    if (gidMatch) return gidMatch[1];
    const numericMatch = raw.match(/\b(\d{6,})\b/);
    if (numericMatch) return numericMatch[1];
    return raw;
  }, []);

  const selectedVariantId = normalizeVariantIdForCompare(currentValue);
  const selectedVariantMeta = useMemo(() => {
    for (const product of products) {
      for (const variant of product?.variants || []) {
        if (normalizeVariantIdForCompare(variant.id) === selectedVariantId) {
          return {
            productTitle: product.title,
            variantTitle: variant.displayName || variant.title,
            price: variant.price,
          };
        }
      }
    }
    return null;
  }, [products, selectedVariantId, normalizeVariantIdForCompare]);

  const filteredProducts = useMemo(
    () =>
      products.filter(product => {
        if (!preferredProductId) return true;
        return (
          normalizeProductIdForCompare(product.id) ===
          normalizeProductIdForCompare(preferredProductId)
        );
      }),
    [products, preferredProductId, normalizeProductIdForCompare]
  );

  const selectedProductId = useMemo(() => {
    if (!selectedVariantId) return null;
    for (const product of filteredProducts) {
      const hasSelectedVariant = (product?.variants || []).some(
        variant => normalizeVariantIdForCompare(variant.id) === selectedVariantId
      );
      if (hasSelectedVariant) return product.id;
    }
    return null;
  }, [filteredProducts, selectedVariantId, normalizeVariantIdForCompare]);

  const productsProgressiveWindow = buildProgressiveListWindow(
    filteredProducts,
    visibleProductCount,
    {
      pinnedIds: [selectedProductId, expandedProductId],
    }
  );
  const visibleProducts = productsProgressiveWindow.visibleItems;
  const shownProductsCount = productsProgressiveWindow.shownCount;
  const hasHiddenLoadedProducts = productsProgressiveWindow.hasHiddenLoaded;
  const canCollapseProducts = productsProgressiveWindow.canCollapse;

  if (disabled) {
    return (
      <div className={styles.nativeVariantAssistant}>
        <Text as="p" variant="bodySm" tone="subdued">
          Connect a Shopify store to search real products and variants here. You can still paste a
          variant ID manually.
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.nativeVariantAssistant}>
      <div className={styles.nativeVariantAssistantSummary}>
        <div>
          <Text as="p" variant="bodySm" fontWeight="semibold">
            {title}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {description}
          </Text>
        </div>
        <InlineStack gap="200" wrap>
          <Badge tone={selectedVariantId ? 'success' : required ? 'critical' : 'info'} size="small">
            {selectedVariantId ? 'Mapped' : required ? 'Required' : 'Optional'}
          </Badge>
          {selectedVariantId && (
            <Button size="slim" variant="plain" onClick={onClear}>
              Clear mapping
            </Button>
          )}
        </InlineStack>
      </div>

      {(selectedVariantMeta || selectedVariantId) && (
        <div className={styles.nativeVariantSelectedCard}>
          <Text as="p" variant="bodySm" fontWeight="semibold">
            Current mapped variant
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {selectedVariantMeta
              ? `${selectedVariantMeta.productTitle} -> ${selectedVariantMeta.variantTitle}${selectedVariantMeta.price ? ` (${selectedVariantMeta.price})` : ''}`
              : `Variant ID ${selectedVariantId}`}
          </Text>
        </div>
      )}

      <div className={styles.storeResourceList}>
        <div className={styles.storeResourceListHeader}>
          <div className={styles.storeResourceListSearch}>
            <TextField
              label="Search Shopify variants"
              labelHidden
              value={search}
              onChange={setSearch}
              placeholder="Search products or variants..."
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setSearch('')}
            />
          </div>
          <span className={styles.storeResourceSelectedBadge}>
            {filteredProducts.length} product{filteredProducts.length === 1 ? '' : 's'}
          </span>
        </div>

        {loading ? (
          <div className={styles.storeResourceListLoading}>
            <div className={styles.storeResourceListLoadingIcon}>
              <Spinner size="small" />
            </div>
            <Text as="span" variant="bodySm" tone="subdued">
              Loading Shopify variants...
            </Text>
          </div>
        ) : error ? (
          <div className={styles.storeResourceListEmpty}>
            <div className={styles.storeResourceListEmptyIcon}>
              <Icon source={ProductIcon} />
            </div>
            <Text as="p" variant="bodySm" tone="subdued">
              {error}
            </Text>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className={styles.storeResourceListEmpty}>
            <div className={styles.storeResourceListEmptyIcon}>
              <Icon source={ProductIcon} />
            </div>
            <Text as="p" variant="bodySm" tone="subdued">
              {search ? 'No matching products or variants found.' : 'No products found yet.'}
            </Text>
          </div>
        ) : (
          <>
            <div className={styles.storeResourceListMeta}>
              <Text as="span" variant="bodySm" tone="subdued">
                Showing {shownProductsCount} of {filteredProducts.length} loaded products
              </Text>
              {canCollapseProducts && (
                <Button
                  size="slim"
                  variant="plain"
                  onClick={() => setVisibleProductCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH)}
                >
                  Collapse
                </Button>
              )}
            </div>
            <div className={styles.nativeVariantAssistantScroll}>
              {visibleProducts.map(product => {
                const isExpanded = expandedProductId === product.id;
                return (
                  <div key={product.id} className={styles.nativeVariantProductCard}>
                    <button
                      type="button"
                      className={styles.nativeVariantProductHeader}
                      onClick={() =>
                        setExpandedProductId(prev => (prev === product.id ? null : product.id))
                      }
                    >
                      <span className={styles.nativeVariantProductHeaderCopy}>
                        <span className={styles.nativeVariantProductTitle}>{product.title}</span>
                        <span className={styles.nativeVariantProductMeta}>
                          {product.handle ? `/${product.handle}` : 'Product'} ·{' '}
                          {(product.variants || []).length} variant
                          {(product.variants || []).length === 1 ? '' : 's'}
                        </span>
                      </span>
                      <Icon source={isExpanded ? ChevronDownIcon : ChevronRightIcon} />
                    </button>
                    <Collapsible open={isExpanded} id={`native-variant-product-${product.id}`}>
                      <div className={styles.nativeVariantList}>
                        {(product.variants || []).map(variant => {
                          const normalizedId = normalizeVariantIdForCompare(variant.id);
                          const selected = normalizedId === selectedVariantId;
                          return (
                            <button
                              key={variant.id}
                              type="button"
                              className={`${styles.nativeVariantListItem} ${selected ? styles.nativeVariantListItemSelected : ''}`}
                              onClick={() => onSelect(variant.id)}
                            >
                              <span className={styles.nativeVariantListCopy}>
                                <span className={styles.nativeVariantListTitle}>
                                  {variant.displayName || variant.title}
                                </span>
                                <span className={styles.nativeVariantListMeta}>
                                  {variant.sku ? `SKU ${variant.sku}` : 'No SKU'}
                                  {variant.price ? ` · ${variant.price}` : ''}
                                  {variant.compareAtPrice
                                    ? ` · compare-at ${variant.compareAtPrice}`
                                    : ''}
                                </span>
                              </span>
                              <Badge tone={selected ? 'success' : 'info'} size="small">
                                {selected ? 'Selected' : 'Use variant'}
                              </Badge>
                            </button>
                          );
                        })}
                      </div>
                    </Collapsible>
                  </div>
                );
              })}
            </div>
            {hasHiddenLoadedProducts && (
              <div className={styles.storeResourceListFooter}>
                <Button
                  size="slim"
                  onClick={() =>
                    setVisibleProductCount(prev =>
                      Math.min(prev + PRICE_PRODUCT_MODAL_REVEAL_BATCH, filteredProducts.length)
                    )
                  }
                >
                  {`Show ${Math.min(
                    productsProgressiveWindow.nextRevealCount || PRICE_PRODUCT_MODAL_REVEAL_BATCH,
                    filteredProducts.length - shownProductsCount
                  )} more`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
