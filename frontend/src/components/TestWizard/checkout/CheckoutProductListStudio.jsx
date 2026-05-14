import React from 'react';
import styles from '../TargetingSection.module.css';

export default function CheckoutProductListStudio({
  sourceCards = [],
  productRows = [],
  sourceOptions = [],
  getOptionLabel,
  onAddProductList,
}) {
  const hasManualRows = sourceCards.some(card => card.value === 'manual' && card.count > 0);
  const hasCartRelatedRows = sourceCards.some(
    card => card.value === 'cart_related' && card.count > 0
  );
  const hasCollectionRows = sourceCards.some(card => card.value === 'collection' && card.count > 0);
  const needsMerchandiseIds = sourceCards.some(card => card.needsMerchandiseIds);
  const sourceGuidance = {
    manual: {
      bestFor: 'Known add-ons or curated offers',
      required: 'Saved title, price, image, and merchandise ID for add-to-cart',
      action: 'Add manual list',
    },
    cart_related: {
      bestFor: 'Relevant offers based on the live cart',
      required: 'A realistic checkout cart for final proof',
      action: 'Add cart-related list',
    },
    collection: {
      bestFor: 'Merchandising from a Shopify collection',
      required: 'Collection IDs and assignment hydration',
      action: 'Add collection-fed list',
    },
  };
  const processSteps = [
    {
      label: '1. Choose source',
      detail: hasManualRows
        ? 'Manual rows are active, so prioritize merchandise ID readiness before visual polish.'
        : 'Pick Manual, Cart-related, or Collection-fed by adding or editing a product-list block.',
    },
    {
      label: '2. Configure only what matters',
      detail: hasCollectionRows
        ? 'Collection-fed blocks need collection IDs and hydration limits.'
        : hasCartRelatedRows
          ? 'Cart-related blocks are runtime-only and depend on the shopper cart.'
          : 'Manual blocks use saved rows, images, prices, and merchandise IDs.',
    },
    {
      label: '3. Verify runtime output',
      detail: hasCartRelatedRows
        ? 'Cart-related rows require a realistic checkout cart to verify output.'
        : 'Use Shopify checkout for final proof, especially add-to-cart and dynamic rows.',
    },
  ];
  return (
    <div className={styles.checkoutProductStudioSummary}>
      <div className={styles.checkoutProductProcessStrip}>
        {processSteps.map(step => (
          <div key={step.label}>
            <strong>{step.label}</strong>
            <span>{step.detail}</span>
          </div>
        ))}
      </div>
      <div className={styles.checkoutProductSourceCardGrid}>
        {sourceCards.map(sourceCard => (
          <div
            key={`product-source-${sourceCard.value}`}
            className={`${styles.checkoutProductSourceCard} ${
              sourceCard.count > 0 ? styles.checkoutProductSourceCardActive : ''
            }`}
          >
            <strong>{sourceCard.label}</strong>
            {sourceCard.value !== 'manual' ? (
              <em className={styles.checkoutRuntimeBadge}>Runtime only</em>
            ) : null}
            <span>
              {sourceCard.count} block{sourceCard.count === 1 ? '' : 's'}
            </span>
            <small>
              {sourceCard.value === 'manual'
                ? sourceCard.needsMerchandiseIds
                  ? 'Needs merchandise IDs'
                  : sourceCard.addToCartCount > 0
                    ? 'Add-to-cart ready'
                    : 'Display cards'
                : sourceCard.value === 'cart_related'
                  ? 'Depends on checkout cart'
                  : 'Hydrates from Shopify collections'}
            </small>
            <div className={styles.checkoutProductSourceRequirements}>
              <span>Best for: {sourceGuidance[sourceCard.value]?.bestFor}</span>
              <span>Required: {sourceGuidance[sourceCard.value]?.required}</span>
            </div>
            <button
              type="button"
              className={styles.checkoutProductSourceAction}
              onClick={() => onAddProductList(sourceCard.value)}
            >
              {sourceGuidance[sourceCard.value]?.action || 'Add source list'}
            </button>
          </div>
        ))}
      </div>
      {needsMerchandiseIds ? (
        <div className={styles.checkoutProductStudioWarning}>
          Add-to-cart will not render reliably until at least one manual product card has a
          merchandise or variant GID.
        </div>
      ) : null}
      {productRows.length > 0 ? (
        <div className={styles.checkoutProductMatrix}>
          <div className={styles.checkoutProductMatrixHead}>
            <span>Product</span>
            <span>Source</span>
            <span>Price</span>
            <span>Action readiness</span>
          </div>
          {productRows.slice(0, 8).map(row => (
            <div
              key={`product-matrix-${row.sectionIndex}-${row.itemIndex}`}
              className={styles.checkoutProductMatrixRow}
            >
              <span>
                {row.image ? <img src={row.image} alt="" loading="lazy" /> : null}
                <strong>{row.title}</strong>
              </span>
              <span>{getOptionLabel(sourceOptions, row.sourceMode, 'Manual cards')}</span>
              <span>{row.price}</span>
              <span>
                {row.action === 'add_to_cart'
                  ? row.merchandiseId
                    ? 'Ready'
                    : 'Needs merchandise ID'
                  : 'Display only'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.checkoutStudioEmptyState}>
          <div>
            <strong>No product list rows yet</strong>
            <span>
              Start with one product-list block, choose a source, then verify what can be previewed
              in admin versus what only appears in Shopify checkout.
            </span>
          </div>
          <div className={styles.checkoutStudioEmptyPreview}>
            <span>Manual: merchandise IDs</span>
            <span>Cart-related: runtime cart</span>
            <span>Collection-fed: assignment hydration</span>
          </div>
        </div>
      )}
      <button
        type="button"
        className={styles.checkoutQuickAddButton}
        onClick={() => onAddProductList('manual')}
      >
        <div className={styles.checkoutQuickAddButtonTop}>
          <strong>Add product list block</strong>
          <span className={styles.checkoutQuickAddButtonBadge}>Product mode</span>
        </div>
        <span>
          Create a filtered product-list workspace with source, action, and preview controls.
        </span>
      </button>
      <div className={styles.checkoutRuntimePreviewNotes}>
        <span>Manual add-to-cart requires merchandise IDs.</span>
        <span>Cart-related lists render from checkout cart lines.</span>
        <span>Collection-fed lists hydrate during assignment.</span>
        <span>Final add buttons and dynamic rows must be verified in Shopify checkout.</span>
      </div>
    </div>
  );
}
