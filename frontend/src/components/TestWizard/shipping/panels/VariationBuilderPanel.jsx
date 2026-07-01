import styles from '../ShippingStudio.module.css';
import { getShippingWizardStep1Types } from '../config/shippingWizardBlueprint';

export default function VariationBuilderPanel({
  selectedCategory,
  disabled = false,
  onCategorySelect,
}) {
  const step1Types = getShippingWizardStep1Types();
  const normalizedSelection = String(selectedCategory || '')
    .trim()
    .toLowerCase();
  const resolvedSelection =
    normalizedSelection === 'replace_rate' ? 'add_rate' : normalizedSelection;
  const isReplaceMode = normalizedSelection === 'replace_rate';

  return (
    <section className={styles.panel} aria-label="Shipping test type">
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Step 1</span>
          <strong>Select a shipping test type.</strong>
        </div>
      </div>

      <div
        className={`${styles.strategyTiles} ${styles.strategyTilesSingleColumn}`}
        role="radiogroup"
        aria-label="Shipping test type options"
      >
        {step1Types.map(type => {
          const isSelected = resolvedSelection === type.key;
          return (
            <button
              key={type.key}
              type="button"
              role="radio"
              disabled={disabled}
              className={`${styles.strategyTile} ${styles.strategyTileCompact} ${
                isSelected ? styles.strategyTileActive : ''
              }`}
              title={type.description}
              aria-label={type.title}
              aria-pressed={isSelected}
              onClick={() => onCategorySelect?.(type.key)}
            >
              <span className={styles.strategyTileTopline}>
                <strong>{type.shortTitle || type.title}</strong>
                {type.key === 'add_rate' && isReplaceMode ? (
                  <small>Replace mode</small>
                ) : type.badge ? (
                  <small>{type.badge}</small>
                ) : null}
              </span>
              <span>{type.description}</span>
              {isSelected ? <em>{isReplaceMode ? 'Replace mode (legacy)' : 'Selected'}</em> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
