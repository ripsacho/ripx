import { Button } from '@shopify/polaris';
import styles from '../ShippingStudio.module.css';

const STRATEGY_TILES = [
  {
    value: 'replace_rate',
    label: 'Replace rate',
    description: 'Hide selected Shopify methods and show a new variant rate instead.',
    group: 'Most common',
    badge: 'Recommended',
    shopperOutcome: 'Selected native methods disappear and one RipX replacement appears.',
    bestFor: 'Changing Standard, Express, or Free Shipping without touching control.',
    nextStep: 'Pick active Shopify methods in Step 2.',
  },
  {
    value: 'add_rate',
    label: 'Add new rate',
    description: 'Add a new RipX rate beside Shopify’s existing methods.',
    group: 'Most common',
    badge: 'Compare',
    shopperOutcome: 'Shopify keeps its current methods and RipX adds another option.',
    bestFor: 'Testing a new delivery option without hiding existing methods.',
    nextStep: 'Set the new amount and label in Step 3.',
  },
  {
    value: 'hide_method',
    label: 'Hide method',
    description: 'Hide selected existing delivery methods for this variant.',
    group: 'Existing methods',
    badge: 'Variant-only',
    shopperOutcome: 'Only selected native delivery methods are removed.',
    bestFor: 'Testing fewer choices or removing a low-value method.',
    nextStep: 'Choose methods in Step 2.',
  },
  {
    value: 'rename_method',
    label: 'Rename method',
    description: 'Rename selected existing delivery methods for this variant.',
    group: 'Existing methods',
    badge: 'Copy test',
    shopperOutcome: 'The same native method stays visible with new wording.',
    bestFor: 'Testing labels like Priority, Tracked, or Eco Shipping.',
    nextStep: 'Choose methods, then enter the new label.',
  },
  {
    value: 'threshold_free_shipping',
    label: 'Free over threshold',
    description: 'Make shipping free when cart value reaches a threshold.',
    group: 'Discounts',
    badge: 'Cart value',
    shopperOutcome: 'Eligible carts see free shipping after a minimum spend.',
    bestFor: 'Increasing AOV with a clear shipping incentive.',
    nextStep: 'Set the threshold in Step 3.',
  },
  {
    value: 'discount_percentage',
    label: 'Percent off',
    description: 'Apply a percentage discount to shipping.',
    group: 'Discounts',
    badge: 'Discount',
    shopperOutcome: 'Shipping cost is reduced by a percentage.',
    bestFor: 'Testing broad shipping incentives across rates.',
    nextStep: 'Set the percent off in Step 3.',
  },
  {
    value: 'discount_fixed',
    label: 'Fixed discount',
    description: 'Take a fixed amount off eligible shipping.',
    group: 'Discounts',
    badge: 'Discount',
    shopperOutcome: 'Shipping cost is reduced by a fixed amount.',
    bestFor: 'Testing a capped incentive like $5 off shipping.',
    nextStep: 'Set the discount amount in Step 3.',
  },
  {
    value: 'free_shipping',
    label: 'Free shipping',
    description: 'Force free shipping for this variant.',
    group: 'Discounts',
    badge: 'Free',
    shopperOutcome: 'Matching delivery groups become free.',
    bestFor: 'Testing a strong shipping incentive.',
    nextStep: 'Confirm scope and finish setup.',
  },
  {
    value: 'carrier_quote',
    label: 'Carrier/app rate',
    description: 'Return provider-backed calculated rates.',
    group: 'Advanced',
    badge: 'Advanced',
    shopperOutcome: 'RipX returns a calculated rate from a provider-style adapter.',
    bestFor: 'Static provider rates or destination-aware quote tables.',
    nextStep: 'Configure provider details in Step 3.',
  },
];

const TILE_GROUPS = ['Most common', 'Existing methods', 'Discounts', 'Advanced'];
const AUTOMATED_PATH = 'replace_rate';
const SIMPLE_ALTERNATIVE_PATH = 'add_rate';

const OUTCOME_STEPS = [
  {
    label: 'Choose intent',
    description: 'Start from what shoppers should see.',
  },
  {
    label: 'Target safely',
    description: 'Method targeting is variant-only when needed.',
  },
  {
    label: 'Finish details',
    description: 'Set the amount, label, or discount next.',
  },
];

export default function VariationBuilderPanel({
  selectedCategory,
  disabled = false,
  onCategorySelect,
  onQuickApply,
}) {
  const selectedTile =
    STRATEGY_TILES.find(tile => tile.value === selectedCategory) || STRATEGY_TILES[0];
  const selectedIndex = STRATEGY_TILES.findIndex(tile => tile.value === selectedTile.value);
  const automatedTile =
    STRATEGY_TILES.find(tile => tile.value === AUTOMATED_PATH) || STRATEGY_TILES[0];
  const alternativeTile =
    STRATEGY_TILES.find(tile => tile.value === SIMPLE_ALTERNATIVE_PATH) || STRATEGY_TILES[1];
  const isAdvancedSelection = ![AUTOMATED_PATH, SIMPLE_ALTERNATIVE_PATH].includes(
    selectedTile.value
  );
  const secondaryGroups = TILE_GROUPS.map(group => ({
    group,
    tiles: STRATEGY_TILES.filter(
      tile =>
        tile.group === group && ![AUTOMATED_PATH, SIMPLE_ALTERNATIVE_PATH].includes(tile.value)
    ),
  })).filter(item => item.tiles.length > 0);

  const renderTile = (tile, { compact = false } = {}) => (
    <button
      key={tile.value}
      type="button"
      disabled={disabled}
      className={`${styles.strategyTile} ${compact ? styles.strategyTileCompact : ''} ${
        selectedCategory === tile.value ? styles.strategyTileActive : ''
      }`}
      title={tile.description}
      aria-label={`${tile.label}: ${tile.description}`}
      onClick={() => onCategorySelect?.(tile.value)}
    >
      <span className={styles.strategyTileTopline}>
        <strong>{tile.label}</strong>
        {tile.badge ? <small>{tile.badge}</small> : null}
      </span>
      {!compact ? <span>{tile.description}</span> : null}
      {selectedCategory === tile.value ? <em>Selected</em> : null}
    </button>
  );

  return (
    <section className={styles.panel} aria-label="Shipping variation builder">
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Step 1</span>
          <strong>Choose the type of change.</strong>
          <p className={styles.mutedText}>
            Start with the merchant outcome. RipX maps it to the best Shopify execution path.
          </p>
        </div>
      </div>

      <div className={styles.builderGrid}>
        <div className={styles.intentHeroAdvanced}>
          <div className={styles.selectedIntentSummary}>
            <span className={styles.eyebrow}>Selected category</span>
            <strong>{selectedTile.label}</strong>
            <span>{selectedTile.description}</span>
            <div className={styles.intentSignalGrid}>
              <div>
                <small>Shopper outcome</small>
                <b>{selectedTile.shopperOutcome}</b>
              </div>
              <div>
                <small>Best for</small>
                <b>{selectedTile.bestFor}</b>
              </div>
              <div>
                <small>Next action</small>
                <b>{selectedTile.nextStep}</b>
              </div>
            </div>
          </div>
          <div className={styles.intentPathCard}>
            <span className={styles.eyebrow}>Guided path</span>
            <strong>{selectedIndex >= 0 ? `Path ${selectedIndex + 1}` : 'Recommended path'}</strong>
            <div className={styles.intentPath}>
              {OUTCOME_STEPS.map((step, index) => (
                <div className={styles.intentPathStep} key={step.label}>
                  <span>{index + 1}</span>
                  <strong>{step.label}</strong>
                  <small>{step.description}</small>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.automationPathCard}>
          <div className={styles.automationPathContent}>
            <span className={styles.eyebrow}>Recommended automation</span>
            <strong>Let RipX replace the selected Shopify method.</strong>
            <p>
              Best default for most shipping A/B tests: pick an active method next, then RipX
              creates the replacement rate and hides the original only for this variant.
            </p>
            <div className={styles.automationPills}>
              <span>Variant-only</span>
              <span>Auto carrier rate</span>
              <span>Hides control method safely</span>
            </div>
          </div>
          <Button
            disabled={disabled}
            onClick={() => onCategorySelect?.(automatedTile.value)}
            variant={selectedCategory === automatedTile.value ? 'primary' : 'secondary'}
          >
            {selectedCategory === automatedTile.value
              ? 'Automated setup selected'
              : 'Use automated setup'}
          </Button>
        </div>

        <div className={styles.simpleAlternativeRow}>
          <div>
            <strong>Need to keep existing Shopify methods visible?</strong>
            <span>{alternativeTile.shopperOutcome}</span>
          </div>
          <Button
            disabled={disabled}
            onClick={() => onCategorySelect?.(alternativeTile.value)}
            size="slim"
            variant={selectedCategory === alternativeTile.value ? 'primary' : 'tertiary'}
          >
            {selectedCategory === alternativeTile.value
              ? 'Add-rate path selected'
              : 'Add separate rate instead'}
          </Button>
        </div>

        <details className={styles.strategyLibrary} open={isAdvancedSelection}>
          <summary className={styles.strategyLibrarySummary}>
            <div>
              <span className={styles.eyebrow}>Advanced paths</span>
              <strong>Show less-common shipping test types</strong>
              <small>
                Use these only for discounts, label tests, hiding methods without replacement, or
                provider-backed rates.
              </small>
            </div>
            {isAdvancedSelection ? <em>{selectedTile.label} selected</em> : null}
          </summary>
          {secondaryGroups.map(({ group, tiles }) => (
            <details className={styles.strategyDetailsGroup} key={group}>
              <summary>
                <span>{group}</span>
                <small>
                  {group === 'Existing methods'
                    ? 'Use when changing current Shopify methods'
                    : group === 'Discounts'
                      ? 'Use for free shipping or shipping discounts'
                      : 'Use for provider-backed calculated rates'}
                </small>
              </summary>
              <div className={styles.strategyTiles}>
                {tiles.map(tile => renderTile(tile, { compact: true }))}
              </div>
            </details>
          ))}
        </details>

        <div className={styles.intentPathMobile}>
          <div className={styles.intentPath}>
            {OUTCOME_STEPS.map((step, index) => (
              <div className={styles.intentPathStep} key={step.label}>
                <span>{index + 1}</span>
                <strong>{step.label}</strong>
                <small>{step.description}</small>
              </div>
            ))}
          </div>
        </div>

        {onQuickApply ? (
          <div className={styles.actionRow}>
            <Button disabled={disabled} onClick={onQuickApply} size="slim" variant="tertiary">
              Copy this setup to treatment variants
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
