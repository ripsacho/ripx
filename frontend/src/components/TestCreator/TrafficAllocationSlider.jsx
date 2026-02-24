/**
 * Traffic Allocation Slider Component
 *
 * Premium draggable slider for traffic allocation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  TextField,
  Modal,
  Tooltip,
  Icon,
} from '@shopify/polaris';
import {
  ViewIcon,
  LinkIcon,
  DeleteIcon,
  MinusIcon,
  PlusIcon,
  DragHandleIcon,
  EditIcon,
  ChartHorizontalIcon,
} from '@shopify/polaris-icons';
import Toast from '../Toast/Toast';
import { VARIANT_COLORS } from '../../constants';
import styles from './TrafficAllocationSlider.module.css';

function TrafficAllocationSlider({
  variants,
  onChange,
  onAddVariant,
  onRemoveVariant,
  onPreviewVariant,
  getPreviewUrl,
  compact = false,
}) {
  const [localVariants, setLocalVariants] = useState(variants || []);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [addVariantModal, setAddVariantModal] = useState(false);
  const [newVariantName, setNewVariantName] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
  const [copySuccess, setCopySuccess] = useState(null);
  const [editingVariantIndex, setEditingVariantIndex] = useState(null);
  const [editingVariantName, setEditingVariantName] = useState('');
  const sliderRef = useRef(null);
  const lastEmittedRef = useRef(null);
  const nameInputRef = useRef(null);

  // Sync local state with props when variants change externally (e.g. initial load, template change)
  // Skip sync when we just emitted an update to avoid overwriting user changes
  // Compare by allocation + count only (not name) so renames don't trigger overwrite
  useEffect(() => {
    if (!variants || variants.length === 0) return;
    if (lastEmittedRef.current && variants === lastEmittedRef.current) return;

    const propAllocKey = variants.map(v => v.allocation ?? 0).join(',');
    const localAllocKey = localVariants.map(v => v.allocation ?? 0).join(',');
    const needsSync = variants.length !== localVariants.length || propAllocKey !== localAllocKey;
    if (needsSync) {
      setLocalVariants(variants.map(v => ({ ...v, allocation: v.allocation ?? 0 })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from props only, localVariants would cause loop
  }, [variants]);

  const normalizeAllocations = vars => {
    const total = vars.reduce((sum, v) => sum + (v.allocation || 0), 0);
    if (total === 0) return vars;

    const scaled = vars.map(v => ({
      ...v,
      allocation: (v.allocation / total) * 100,
    }));

    const rounded = scaled.map(v => ({
      ...v,
      allocation: Math.floor(v.allocation),
    }));

    const remainder = 100 - rounded.reduce((sum, v) => sum + v.allocation, 0);
    if (remainder > 0) {
      const fractional = scaled
        .map((v, index) => ({
          index,
          fraction: v.allocation - Math.floor(v.allocation),
        }))
        .sort((a, b) => b.fraction - a.fraction);

      for (let i = 0; i < remainder; i += 1) {
        const targetIndex = fractional[i % fractional.length]?.index;
        if (targetIndex !== undefined) {
          rounded[targetIndex].allocation += 1;
        }
      }
    }

    return rounded;
  };

  const handleEqualSplit = () => {
    const equalAllocation = Math.floor(100 / localVariants.length);
    const remainder = 100 - equalAllocation * localVariants.length;

    const updated = localVariants.map((v, i) => ({
      ...v,
      allocation: equalAllocation + (i < remainder ? 1 : 0),
    }));

    setLocalVariants(updated);
  };

  const handleMouseDown = (index, e) => {
    e.preventDefault();
    setDraggingIndex(index);
    setDragStartX(e.clientX);
  };

  const handleMouseMove = useCallback(
    e => {
      if (draggingIndex === null) return;

      const deltaX = e.clientX - dragStartX;
      const sliderWidth = sliderRef.current?.offsetWidth || 400;
      const deltaPercent = (deltaX / sliderWidth) * 100;

      setLocalVariants(prev => {
        const updated = [...prev];
        const currentAllocation = updated[draggingIndex].allocation || 0;
        const newAllocation = Math.max(0, Math.min(100, currentAllocation + deltaPercent));

        // Calculate how much to adjust other variants
        const diff = newAllocation - currentAllocation;
        const otherVariants = updated.filter((_, i) => i !== draggingIndex);
        const otherTotal = otherVariants.reduce((sum, v) => sum + (v.allocation || 0), 0);

        if (otherTotal > 0) {
          otherVariants.forEach((v, i) => {
            const originalIndex = i < draggingIndex ? i : i + 1;
            const adjustment = (v.allocation / otherTotal) * -diff;
            updated[originalIndex].allocation = Math.max(
              0,
              Math.min(100, updated[originalIndex].allocation + adjustment)
            );
          });
        }

        updated[draggingIndex].allocation = Math.round(newAllocation);

        // Normalize to ensure total is 100%
        const normalized = normalizeAllocations(updated);
        return normalized;
      });

      setDragStartX(e.clientX);
    },
    [draggingIndex, dragStartX]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingIndex(null);
  }, []);

  // Call onChange after state updates, not during render
  useEffect(() => {
    if (onChange && localVariants.length > 0) {
      lastEmittedRef.current = localVariants;
      const timeoutId = setTimeout(() => {
        onChange(localVariants);
      }, 0);
      const clearId = setTimeout(() => {
        lastEmittedRef.current = null;
      }, 150);
      return () => {
        clearTimeout(timeoutId);
        clearTimeout(clearId);
      };
    }
  }, [localVariants, onChange]);

  useEffect(() => {
    if (draggingIndex !== null) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingIndex, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (editingVariantIndex !== null && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingVariantIndex]);

  const handleAddVariant = () => {
    if (!newVariantName.trim()) return;

    const newVariant = {
      name: newVariantName,
      allocation: 0,
      config: {},
    };

    // Redistribute allocations
    const redistribution = Math.floor(100 / (localVariants.length + 1));
    const updated = localVariants.map(v => ({
      ...v,
      allocation: redistribution,
    }));

    updated.push({
      ...newVariant,
      allocation: 100 - redistribution * localVariants.length,
    });

    const normalized = normalizeAllocations(updated);
    setLocalVariants(normalized);
    if (onAddVariant) onAddVariant(newVariant);

    setNewVariantName('');
    setAddVariantModal(false);
  };

  const handleRemoveVariant = index => {
    if (localVariants.length <= 2) {
      setErrorMessage('You need at least 2 variants.');
      return;
    }

    const removed = localVariants[index];
    const updated = localVariants.filter((_, i) => i !== index);

    // Redistribute the removed variant's allocation
    const removedAllocation = removed.allocation || 0;
    const otherTotal = updated.reduce((sum, v) => sum + (v.allocation || 0), 0);

    if (otherTotal > 0) {
      updated.forEach(v => {
        v.allocation = Math.round(v.allocation + (v.allocation / otherTotal) * removedAllocation);
      });
    } else {
      // Equal split if no other allocations
      const equal = Math.floor(100 / updated.length);
      updated.forEach((v, i) => {
        v.allocation = equal + (i < 100 - equal * updated.length ? 1 : 0);
      });
    }

    const normalized = normalizeAllocations(updated);
    setLocalVariants(normalized);
    if (onRemoveVariant) onRemoveVariant(index);
  };

  const handleManualChange = (index, value) => {
    const numValue = parseFloat(value) || 0;
    const updated = [...localVariants];
    updated[index].allocation = Math.max(0, Math.min(100, numValue));

    // Normalize
    const normalized = normalizeAllocations(updated);
    setLocalVariants(normalized);
  };

  const handleAllocationStep = (index, delta) => {
    const updated = [...localVariants];
    const current = updated[index].allocation || 0;
    updated[index].allocation = Math.max(0, Math.min(100, Math.round(current + delta)));
    const normalized = normalizeAllocations(updated);
    setLocalVariants(normalized);
  };

  const _handleRenameVariant = (index, newName) => {
    const trimmed = (newName || '').trim();
    const updated = localVariants.map((v, i) =>
      i === index ? { ...v, name: trimmed || v.name } : v
    );
    setLocalVariants(updated);
    lastEmittedRef.current = updated;
    if (onChange) onChange(updated);
  };

  const startEditingName = index => {
    setEditingVariantIndex(index);
    setEditingVariantName(localVariants[index]?.name || '');
  };

  const commitEditingName = () => {
    if (editingVariantIndex === null) return;
    const trimmed = (editingVariantName || '').trim();
    const updated = localVariants.map((v, i) =>
      i === editingVariantIndex ? { ...v, name: trimmed || v.name } : v
    );
    setLocalVariants(updated);
    lastEmittedRef.current = updated;
    if (onChange) onChange(updated);
    setEditingVariantIndex(null);
    setEditingVariantName('');
  };

  const cancelEditingName = () => {
    setEditingVariantIndex(null);
    setEditingVariantName('');
  };

  const clearCopySuccess = useCallback(() => setCopySuccess(null), []);
  const clearErrorMessage = useCallback(() => setErrorMessage(null), []);

  const handleCopyPreviewLink = async (variant, index) => {
    const url = getPreviewUrl?.(variant, index);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopySuccess(`Preview link copied for ${variant?.name || `Variant ${index + 1}`}`);
    } catch {
      setErrorMessage('Failed to copy link');
    }
  };

  const COLORS = VARIANT_COLORS;

  const content = (
    <div className={`${styles.wrapper} ${compact ? styles.wrapperCompact : ''}`}>
      <Toast message={errorMessage} type="error" onClose={clearErrorMessage} duration={3000} />
      <Toast message={copySuccess} type="success" onClose={clearCopySuccess} duration={2500} />
      {!compact && (
        <div className={styles.nonCompactHeader}>
          <Text variant="headingLg" as="h2">
            Traffic Allocation
          </Text>
          <InlineStack gap="300">
            <Button onClick={handleEqualSplit}>Split Equally</Button>
            <Button onClick={() => setAddVariantModal(true)}>Add Variant</Button>
          </InlineStack>
        </div>
      )}
      {compact && (
        <div className={styles.toolbarBar}>
          <div className={styles.toolbarHints}>
            <span className={styles.toolbarHint}>
              <Icon source={DragHandleIcon} />
              Drag segments to adjust
            </span>
            <span className={styles.toolbarDivider} aria-hidden />
            <span className={styles.toolbarHint}>
              <Icon source={EditIcon} />
              Enter values for precision
            </span>
          </div>
          <div className={styles.toolbarActions}>
            <button type="button" className={styles.toolbarBtn} onClick={handleEqualSplit}>
              <Icon source={ChartHorizontalIcon} />
              Split Equally
            </button>
            <button
              type="button"
              className={`${styles.toolbarBtn} ${styles.toolbarBtnPrimary}`}
              onClick={() => setAddVariantModal(true)}
            >
              <Icon source={PlusIcon} />
              Add Variant
            </button>
          </div>
        </div>
      )}

      {/* Slider */}
      <div className={styles.sliderWrapper}>
        <div
          ref={sliderRef}
          className={`${styles.sliderTrack} ${draggingIndex !== null ? styles.dragging : ''}`}
        >
          {localVariants.map((variant, index) => {
            const width = variant.allocation || 0;
            const left = localVariants
              .slice(0, index)
              .reduce((sum, v) => sum + (v.allocation || 0), 0);
            const color = COLORS[index % COLORS.length];

            return (
              <div
                key={index}
                className={`${styles.segment} ${draggingIndex === index ? styles.dragging : ''}`}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
                  boxShadow:
                    draggingIndex === index
                      ? `0 8px 24px ${color}44`
                      : '0 1px 3px rgba(0,0,0,0.08)',
                  zIndex: draggingIndex === index ? 10 : 1,
                  borderRightColor:
                    index < localVariants.length - 1 ? 'rgba(255,255,255,0.6)' : 'transparent',
                }}
                onMouseDown={e => handleMouseDown(index, e)}
              >
                {width > 8 && (
                  <Text
                    variant="bodyMd"
                    fontWeight="semibold"
                    as="span"
                    className={styles.segmentLabel}
                  >
                    {variant.name}
                  </Text>
                )}

                {index < localVariants.length - 1 && (
                  <div
                    className={styles.handle}
                    onMouseDown={e => {
                      e.stopPropagation();
                      handleMouseDown(index, e);
                    }}
                  >
                    <div className={styles.handleBar} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Variant Cards */}
      <div className={styles.variantCards}>
        {localVariants.map((variant, index) => {
          const color = COLORS[index % COLORS.length];

          return (
            <div key={index} className={styles.variantCard} style={{ '--variant-color': color }}>
              <span className={styles.variantCardBadge} style={{ backgroundColor: color }}>
                {index + 1}
              </span>
              <div className={styles.variantCardHeader}>
                <div className={styles.variantCardTitleRow}>
                  <div className={styles.variantColorDot} style={{ backgroundColor: color }} />
                  {editingVariantIndex === index ? (
                    <div className={styles.variantNameEdit}>
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={editingVariantName}
                        onChange={e => setEditingVariantName(e.target.value)}
                        onBlur={commitEditingName}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEditingName();
                          if (e.key === 'Escape') cancelEditingName();
                        }}
                        placeholder="Variant name"
                        className={styles.variantNameInput}
                        autoComplete="off"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.variantNameDisplay}
                      onClick={() => startEditingName(index)}
                      title="Click to edit name"
                    >
                      <span
                        className={`${styles.variantNameText} ${!variant.name?.trim() ? styles.placeholder : ''}`}
                      >
                        {variant.name || 'Unnamed variant'}
                      </span>
                      <span className={styles.variantNameEditHint} aria-hidden>
                        ✎
                      </span>
                    </button>
                  )}
                </div>
                <div className={styles.variantCardActions}>
                  {onPreviewVariant && (
                    <Tooltip content="Open variant in new tab" preferredPosition="above">
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnPreview}`}
                        onClick={() => onPreviewVariant(variant, index)}
                        aria-label="Preview variant"
                      >
                        <span className={styles.actionBtnIcon}>
                          <Icon source={ViewIcon} />
                        </span>
                        <span className={styles.actionBtnLabel}>Preview</span>
                      </button>
                    </Tooltip>
                  )}
                  {getPreviewUrl && (
                    <Tooltip content="Copy preview URL to clipboard" preferredPosition="above">
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnCopy}`}
                        onClick={() => handleCopyPreviewLink(variant, index)}
                        aria-label="Copy preview link"
                      >
                        <span className={styles.actionBtnIcon}>
                          <Icon source={LinkIcon} />
                        </span>
                        <span className={styles.actionBtnLabel}>Copy link</span>
                      </button>
                    </Tooltip>
                  )}
                  {localVariants.length > 2 && index !== 0 && (
                    <Tooltip content="Remove this variant" preferredPosition="above">
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnRemove}`}
                        onClick={() => handleRemoveVariant(index)}
                        aria-label="Remove variant"
                      >
                        <span className={styles.actionBtnIcon}>
                          <Icon source={DeleteIcon} />
                        </span>
                        <span className={styles.actionBtnLabel}>Remove</span>
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>

              <div className={styles.variantCardBody}>
                <div className={styles.allocationRingWrapper}>
                  <div
                    className={styles.allocationRing}
                    style={{
                      '--ring-progress': variant.allocation || 0,
                      '--ring-color': color,
                    }}
                  >
                    <div className={styles.allocationRingInner}>
                      <span className={styles.allocationRingValue}>{variant.allocation || 0}</span>
                      <span className={styles.allocationRingUnit}>%</span>
                    </div>
                  </div>
                </div>
                <div className={styles.variantCardInput}>
                  <label className={styles.allocationLabel} htmlFor={`allocation-${index}`}>
                    Allocation
                  </label>
                  <div className={styles.allocationInputWrapper}>
                    <button
                      type="button"
                      className={styles.allocationStepBtn}
                      onClick={() => handleAllocationStep(index, -5)}
                      aria-label="Decrease allocation by 5"
                    >
                      <Icon source={MinusIcon} />
                    </button>
                    <input
                      id={`allocation-${index}`}
                      type="number"
                      min={0}
                      max={100}
                      value={variant.allocation?.toString() || '0'}
                      onChange={e => handleManualChange(index, e.target.value)}
                      className={styles.allocationInput}
                      aria-label={`Allocation percentage for ${variant.name || `Variant ${index + 1}`}`}
                    />
                    <span className={styles.allocationSuffix}>%</span>
                    <button
                      type="button"
                      className={styles.allocationStepBtn}
                      onClick={() => handleAllocationStep(index, 5)}
                      aria-label="Increase allocation by 5"
                    >
                      <Icon source={PlusIcon} />
                    </button>
                  </div>
                </div>
              </div>
              <div
                className={styles.variantCardAllocationBar}
                style={{ width: `${variant.allocation || 0}%`, backgroundColor: color }}
                aria-hidden
              />
            </div>
          );
        })}
      </div>

      {/* Add Variant Modal */}
      <Modal
        open={addVariantModal}
        onClose={() => setAddVariantModal(false)}
        title="Add New Variant"
        primaryAction={{
          content: 'Add Variant',
          onAction: handleAddVariant,
          disabled: !newVariantName.trim(),
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setAddVariantModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField
              label="Variant Name"
              value={newVariantName}
              onChange={setNewVariantName}
              placeholder="e.g., Variant B, Variant C"
              required
              helpText="Give your variant a descriptive name"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </div>
  );

  return compact ? content : <Card>{content}</Card>;
}

export default TrafficAllocationSlider;
