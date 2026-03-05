/**
 * Traffic Allocation Slider Component
 *
 * Premium draggable slider for traffic allocation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, InlineStack, Text, Button, Tooltip, Icon } from '@shopify/polaris';
import {
  ViewIcon,
  LinkIcon,
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
  const [errorMessage, setErrorMessage] = useState(null);
  const [copySuccess, setCopySuccess] = useState(null);
  const [editingVariantIndex, setEditingVariantIndex] = useState(null);
  const [editingVariantName, setEditingVariantName] = useState('');
  const sliderRef = useRef(null);
  const lastEmittedRef = useRef(null);
  const nameInputRef = useRef(null);
  /** After add/remove we wait for parent to pass updated variants; don't overwrite with stale props */
  const pendingCountRef = useRef(null);
  /** Refs for smooth drag: avoid stale closure and enable RAF throttling */
  const dragStateRef = useRef({ index: null, lastClientX: 0 });
  const rafIdRef = useRef(null);

  // Sync local state with props when variants change externally (e.g. initial load, template change)
  // Skip sync when we just did add/remove and parent hasn't updated yet (avoids undoing add/remove)
  // Skip when we just emitted allocation/rename to avoid overwriting user changes
  useEffect(() => {
    if (!variants || variants.length === 0) return;
    if (lastEmittedRef.current && variants === lastEmittedRef.current) return;

    // We're waiting for parent to reflect an add or remove; don't overwrite until props match
    if (pendingCountRef.current !== null) {
      if (variants.length === pendingCountRef.current) {
        pendingCountRef.current = null;
        setLocalVariants(variants.map(v => ({ ...v, allocation: v.allocation ?? 0 })));
      }
      return;
    }

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

  const applyDragDelta = useCallback((index, deltaPercent) => {
    setLocalVariants(prev => {
      const updated = prev.map(v => ({ ...v, allocation: v.allocation || 0 }));
      const currentAllocation = updated[index].allocation || 0;
      const newAllocation = Math.max(0, Math.min(100, currentAllocation + deltaPercent));
      const diff = newAllocation - currentAllocation;
      const otherVariants = updated.filter((_, i) => i !== index);
      const otherTotal = otherVariants.reduce((sum, v) => sum + (v.allocation || 0), 0);

      if (otherTotal > 0) {
        otherVariants.forEach((v, i) => {
          const originalIndex = i < index ? i : i + 1;
          const adjustment = (v.allocation / otherTotal) * -diff;
          updated[originalIndex].allocation = Math.max(
            0,
            Math.min(100, updated[originalIndex].allocation + adjustment)
          );
        });
      }
      updated[index].allocation = Math.round(newAllocation);
      return normalizeAllocations(updated);
    });
  }, []);

  const handlePointerDown = useCallback((index, e) => {
    e.preventDefault();
    if (e.button !== undefined && e.button !== 0) return;
    const clientX = e.clientX ?? e.touches?.[0]?.pageX ?? 0;
    dragStateRef.current = { index, lastClientX: clientX };
    setDraggingIndex(index);
    try {
      const track = sliderRef.current;
      if (track && e.pointerId !== undefined && e.pointerId !== null) {
        track.setPointerCapture(e.pointerId);
      }
    } catch {
      // ignore pointer capture errors
    }
  }, []);

  const handlePointerMove = useCallback(
    e => {
      const { index, lastClientX } = dragStateRef.current;
      if (index === null) return;

      const clientX = e.clientX ?? e.touches?.[0]?.pageX ?? 0;
      const deltaX = clientX - lastClientX;
      dragStateRef.current.lastClientX = clientX;

      const sliderWidth = sliderRef.current?.offsetWidth || 400;
      const deltaPercent = (deltaX / sliderWidth) * 100;
      if (Math.abs(deltaPercent) < 0.01) return;

      if (rafIdRef.current !== null && rafIdRef.current !== undefined) {
        cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        applyDragDelta(index, deltaPercent);
      });
    },
    [applyDragDelta]
  );

  const handlePointerUp = useCallback(e => {
    if (rafIdRef.current !== null && rafIdRef.current !== undefined) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    try {
      const track = sliderRef.current;
      if (track && e?.pointerId !== undefined && e?.pointerId !== null) {
        track.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore pointer release errors
    }
    dragStateRef.current = { index: null, lastClientX: 0 };
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
    if (draggingIndex === null) return;
    const onMove = e => {
      e.preventDefault();
      handlePointerMove(e);
    };
    const onUp = e => {
      e.preventDefault();
      handlePointerUp(e);
    };
    document.addEventListener('pointermove', onMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onUp, { capture: true });
    document.addEventListener('pointercancel', onUp, { capture: true });
    return () => {
      document.removeEventListener('pointermove', onMove, { capture: true });
      document.removeEventListener('pointerup', onUp, { capture: true });
      document.removeEventListener('pointercancel', onUp, { capture: true });
    };
  }, [draggingIndex, handlePointerMove, handlePointerUp]);

  useEffect(() => {
    if (editingVariantIndex !== null && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingVariantIndex]);

  /** Next default name: Variant A, Variant B, Variant C, ... (based on current count) */
  const getDefaultVariantName = () => {
    const letter = String.fromCharCode(65 + localVariants.length);
    return `Variant ${letter}`;
  };

  const handleAddVariant = () => {
    const defaultName = getDefaultVariantName();
    const newVariant = {
      name: defaultName,
      allocation: 0,
      config: {},
    };

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
    if (onAddVariant) {
      pendingCountRef.current = normalized.length;
      onAddVariant(newVariant);
    }
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
    if (onRemoveVariant) {
      pendingCountRef.current = normalized.length;
      onRemoveVariant(index);
    }
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

  const handleAllocationKeyDown = (index, e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleAllocationStep(index, 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleAllocationStep(index, -1);
    }
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
            <Button onClick={handleAddVariant}>Add Variant</Button>
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
              Use ± buttons or type for precision
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
              onClick={handleAddVariant}
            >
              <Icon source={PlusIcon} />
              Add Variant
            </button>
          </div>
        </div>
      )}

      {/* Traffic split – bar + legend layout */}
      <div className={styles.sliderSection} role="group" aria-label="Traffic allocation">
        <div className={styles.sliderSectionHeader}>
          <span className={styles.sliderSectionTitle}>Traffic split</span>
          {(() => {
            const total = localVariants.reduce((s, v) => s + (v.allocation || 0), 0);
            const isOk = total === 100;
            const isWarn = total > 0 && total < 100;
            return (
              <span
                className={`${styles.sliderSectionTotal} ${isOk ? styles.sliderSectionTotalOk : ''} ${isWarn ? styles.sliderSectionTotalWarn : ''}`}
                title={
                  isOk
                    ? 'Allocation complete'
                    : isWarn
                      ? 'Total should be 100%'
                      : 'Allocation total'
                }
              >
                Total: {total}%
              </span>
            );
          })()}
        </div>
        <div className={styles.sliderBarCard}>
          <div className={styles.sliderBarWrap}>
            <span className={styles.sliderScaleLabel} aria-hidden>
              0
            </span>
            <div className={styles.sliderWrapper}>
              <div
                ref={sliderRef}
                className={`${styles.sliderTrack} ${draggingIndex !== null ? styles.trackDragging : ''}`}
                role="presentation"
              >
                {localVariants.map((variant, index) => {
                  const width = variant.allocation || 0;
                  const left = localVariants
                    .slice(0, index)
                    .reduce((sum, v) => sum + (v.allocation || 0), 0);
                  const color = COLORS[index % COLORS.length];
                  const isFirst = index === 0;
                  const isLast = index === localVariants.length - 1;

                  return (
                    <div
                      key={index}
                      className={`${styles.segment} ${draggingIndex === index ? styles.segmentDragging : ''} ${isFirst ? styles.segmentFirst : ''} ${isLast ? styles.segmentLast : ''}`}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        '--segment-color': color,
                        zIndex: draggingIndex === index ? 10 : 1,
                      }}
                      onPointerDown={e => handlePointerDown(index, e)}
                    >
                      <span className={styles.segmentContent}>
                        {width >= 8 && <span className={styles.segmentPercent}>{width}%</span>}
                      </span>
                      {index < localVariants.length - 1 && (
                        <div
                          className={styles.handle}
                          role="slider"
                          aria-label={`Divider between ${variant.name || `Variant ${index + 1}`} and ${localVariants[index + 1]?.name || `Variant ${index + 2}`}. Drag or use arrow keys to adjust.`}
                          aria-valuenow={width}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          tabIndex={0}
                          onPointerDown={e => {
                            e.stopPropagation();
                            handlePointerDown(index, e);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'ArrowLeft') {
                              e.preventDefault();
                              handleAllocationStep(index, -1);
                            } else if (e.key === 'ArrowRight') {
                              e.preventDefault();
                              handleAllocationStep(index, 1);
                            }
                          }}
                        >
                          <span className={styles.handleGrip} aria-hidden />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <span className={styles.sliderScaleLabel} aria-hidden>
              100
            </span>
          </div>
          <p className={styles.sliderHint}>Drag dividers or use arrow keys on focus to adjust</p>
          <div className={styles.sliderLegend}>
            {localVariants.map((variant, index) => {
              const color = COLORS[index % COLORS.length];
              const pct = variant.allocation ?? 0;
              return (
                <div
                  key={index}
                  className={styles.sliderLegendItem}
                  style={{ '--legend-color': color }}
                >
                  <span className={styles.sliderLegendBadge}>{index + 1}</span>
                  <span className={styles.sliderLegendDot} />
                  <span className={styles.sliderLegendName}>
                    {variant.name || `Variant ${index + 1}`}
                  </span>
                  <span className={styles.sliderLegendPct}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Variant cards */}
      <div className={styles.variantCards}>
        {localVariants.map((variant, index) => {
          const color = COLORS[index % COLORS.length];

          return (
            <div key={index} className={styles.variantCard} style={{ '--variant-color': color }}>
              <div className={styles.variantCardAccent} style={{ backgroundColor: color }} />
              <div className={styles.variantCardInner}>
                <div className={styles.variantCardHead}>
                  <span className={styles.variantCardBadge} style={{ backgroundColor: color }}>
                    {index + 1}
                  </span>
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
                        Edit
                      </span>
                    </button>
                  )}
                  {localVariants.length > 2 && index !== 0 && (
                    <Tooltip content="Remove variant" preferredPosition="below">
                      <button
                        type="button"
                        className={styles.variantCardRemoveBtn}
                        onClick={() => handleRemoveVariant(index)}
                        aria-label="Remove variant"
                      >
                        ×
                      </button>
                    </Tooltip>
                  )}
                </div>
                <div className={styles.variantCardTraffic}>
                  <label className={styles.trafficLabel} htmlFor={`allocation-${index}`}>
                    Traffic
                  </label>
                  <div className={styles.trafficControl}>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      onClick={() => handleAllocationStep(index, -5)}
                      aria-label="Decrease by 5"
                      title="−5%"
                    >
                      −5
                    </button>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      onClick={() => handleAllocationStep(index, -1)}
                      aria-label="Decrease by 1"
                    >
                      −
                    </button>
                    <input
                      id={`allocation-${index}`}
                      type="number"
                      min={0}
                      max={100}
                      value={variant.allocation?.toString() || '0'}
                      onChange={e => handleManualChange(index, e.target.value)}
                      onKeyDown={e => handleAllocationKeyDown(index, e)}
                      className={styles.stepperInput}
                      aria-label={`Traffic % for ${variant.name || `Variant ${index + 1}`}. Arrow keys: ±1%.`}
                    />
                    <span className={styles.trafficUnit}>%</span>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      onClick={() => handleAllocationStep(index, 1)}
                      aria-label="Increase by 1"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className={styles.stepperBtn}
                      onClick={() => handleAllocationStep(index, 5)}
                      aria-label="Increase by 5"
                      title="+5%"
                    >
                      +5
                    </button>
                  </div>
                </div>
                <div className={styles.variantCardActions}>
                  {onPreviewVariant && (
                    <Tooltip content="Open in new tab" preferredPosition="above">
                      <button
                        type="button"
                        className={`${styles.cardActionBtn} ${styles.cardActionBtnPrimary}`}
                        onClick={() => onPreviewVariant(variant, index)}
                        aria-label="Preview variant"
                      >
                        <span className={styles.cardActionBtnIcon} aria-hidden>
                          <Icon source={ViewIcon} />
                        </span>
                        <span className={styles.cardActionBtnLabel}>Preview</span>
                      </button>
                    </Tooltip>
                  )}
                  {getPreviewUrl && (
                    <Tooltip content="Copy URL" preferredPosition="above">
                      <button
                        type="button"
                        className={styles.cardActionBtn}
                        onClick={() => handleCopyPreviewLink(variant, index)}
                        aria-label="Copy preview link"
                      >
                        <span className={styles.cardActionBtnIcon} aria-hidden>
                          <Icon source={LinkIcon} />
                        </span>
                        <span className={styles.cardActionBtnLabel}>Copy link</span>
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return compact ? content : <Card>{content}</Card>;
}

export default TrafficAllocationSlider;
