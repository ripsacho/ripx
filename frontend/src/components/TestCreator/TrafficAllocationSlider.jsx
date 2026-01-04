/**
 * Traffic Allocation Slider Component
 * 
 * Intelligems-style draggable slider for traffic allocation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  TextField,
  Modal
} from '@shopify/polaris';

function TrafficAllocationSlider({ variants, onChange, onAddVariant, onRemoveVariant }) {
  const [localVariants, setLocalVariants] = useState(variants || []);
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [addVariantModal, setAddVariantModal] = useState(false);
  const [newVariantName, setNewVariantName] = useState('');
  const [newVariantCode, setNewVariantCode] = useState('');
  const sliderRef = useRef(null);

  // Sync local state with props, but don't call onChange
  useEffect(() => {
    if (variants && JSON.stringify(variants) !== JSON.stringify(localVariants)) {
      setLocalVariants(variants || []);
    }
  }, [variants]);

  const normalizeAllocations = (vars) => {
    const total = vars.reduce((sum, v) => sum + (v.allocation || 0), 0);
    if (total === 0) return vars;
    return vars.map(v => ({
      ...v,
      allocation: Math.round((v.allocation / total) * 100)
    }));
  };

  const handleEqualSplit = () => {
    const equalAllocation = Math.floor(100 / localVariants.length);
    const remainder = 100 - (equalAllocation * localVariants.length);
    
    const updated = localVariants.map((v, i) => ({
      ...v,
      allocation: equalAllocation + (i < remainder ? 1 : 0)
    }));
    
    setLocalVariants(updated);
  };

  const handleMouseDown = (index, e) => {
    e.preventDefault();
    setDraggingIndex(index);
    setDragStartX(e.clientX);
  };

  const handleMouseMove = useCallback((e) => {
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
          updated[originalIndex].allocation = Math.max(0, Math.min(100, updated[originalIndex].allocation + adjustment));
        });
      }

      updated[draggingIndex].allocation = Math.round(newAllocation);
      
      // Normalize to ensure total is 100%
      const normalized = normalizeAllocations(updated);
      return normalized;
    });
    
    setDragStartX(e.clientX);
  }, [draggingIndex, dragStartX]);

  const handleMouseUp = useCallback(() => {
    setDraggingIndex(null);
  }, []);

  // Call onChange after state updates, not during render
  useEffect(() => {
    if (onChange && localVariants.length > 0) {
      // Use a small timeout to ensure this runs after render
      const timeoutId = setTimeout(() => {
        onChange(localVariants);
      }, 0);
      return () => clearTimeout(timeoutId);
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

  const handleAddVariant = () => {
    if (!newVariantName.trim()) return;

    const newVariant = {
      name: newVariantName,
      allocation: 0,
      config: newVariantCode ? { code: newVariantCode } : {}
    };

    // Redistribute allocations
    const redistribution = Math.floor(100 / (localVariants.length + 1));
    const updated = localVariants.map(v => ({
      ...v,
      allocation: redistribution
    }));
    
    updated.push({
      ...newVariant,
      allocation: 100 - (redistribution * localVariants.length)
    });

    const normalized = normalizeAllocations(updated);
    setLocalVariants(normalized);
    if (onAddVariant) onAddVariant(newVariant);

    setNewVariantName('');
    setNewVariantCode('');
    setAddVariantModal(false);
  };

  const handleRemoveVariant = (index) => {
    if (localVariants.length <= 2) {
      alert('You need at least 2 variants');
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
        v.allocation = equal + (i < (100 - equal * updated.length) ? 1 : 0);
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

  const totalAllocation = localVariants.reduce((sum, v) => sum + (v.allocation || 0), 0);
  const COLORS = ['#008060', '#5C6AC4', '#F49342', '#47C1BF', '#B98900', '#E91E63'];

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingLg" as="h2">
            Traffic Allocation
          </Text>
          <InlineStack gap="200">
            <Button onClick={handleEqualSplit}>
              Split Equally
            </Button>
            <Button onClick={() => setAddVariantModal(true)}>
              Add Variant
            </Button>
          </InlineStack>
        </InlineStack>

        <Text variant="bodySm" color="subdued" as="p">
          Drag the handles or enter values manually. Total: {totalAllocation}%
        </Text>

        {/* Slider Container */}
        <div
          ref={sliderRef}
          className={`traffic-slider-container ${draggingIndex !== null ? 'dragging' : ''}`}
        >
          {localVariants.map((variant, index) => {
            const width = variant.allocation || 0;
            const left = localVariants.slice(0, index).reduce((sum, v) => sum + (v.allocation || 0), 0);
            const color = COLORS[index % COLORS.length];

            return (
              <div
                key={index}
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  width: `${width}%`,
                  height: '100%',
                  backgroundColor: color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'grab',
                  transition: draggingIndex === null ? 'all 0.2s' : 'none',
                  borderRight: index < localVariants.length - 1 ? '2px solid var(--bg-secondary)' : 'none',
                  boxShadow: draggingIndex === index ? '0 4px 12px var(--shadow-md)' : 'none',
                  zIndex: draggingIndex === index ? 10 : 1
                }}
                onMouseDown={(e) => handleMouseDown(index, e)}
              >
                {width > 5 && (
                  <Text variant="bodyMd" fontWeight="semibold" style={{ color: 'var(--text-inverse)', pointerEvents: 'none' }}>
                    {variant.name}
                  </Text>
                )}
                
                {/* Drag Handle */}
                {index < localVariants.length - 1 && (
                  <div
                    className="traffic-slider-handle"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(index, e);
                    }}
                  >
                    <div className="traffic-slider-handle-bar" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Variant Details */}
        <BlockStack gap="300">
          {localVariants.map((variant, index) => {
            const color = COLORS[index % COLORS.length];
            
            return (
              <Card key={index} sectioned>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" align="center">
                      <div
                        className="variant-color-indicator"
                        style={{ backgroundColor: color }}
                      />
                      <Text variant="bodyMd" fontWeight="semibold">
                        {variant.name}
                      </Text>
                    </InlineStack>
                    {localVariants.length > 2 && (
                      <Button
                        plain
                        destructive
                        onClick={() => handleRemoveVariant(index)}
                      >
                        Remove
                      </Button>
                    )}
                  </InlineStack>

                  <InlineStack gap="300" align="start">
                    <div className="flex-1">
                      <TextField
                        label="Allocation (%)"
                        type="number"
                        value={variant.allocation?.toString() || '0'}
                        onChange={(value) => handleManualChange(index, value)}
                        min={0}
                        max={100}
                        suffix="%"
                      />
                    </div>
                    <div className="flex-1">
                      <Text variant="bodySm" color="subdued" as="p">
                        {variant.allocation || 0}% of traffic
                      </Text>
                    </div>
                  </InlineStack>
                </BlockStack>
              </Card>
            );
          })}
        </BlockStack>

        {/* Add Variant Modal */}
        <Modal
          open={addVariantModal}
          onClose={() => setAddVariantModal(false)}
          title="Add New Variant"
          primaryAction={{
            content: 'Add Variant',
            onAction: handleAddVariant,
            disabled: !newVariantName.trim()
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setAddVariantModal(false)
            }
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
              <TextField
                label="Custom Code (Optional)"
                value={newVariantCode}
                onChange={setNewVariantCode}
                multiline={4}
                placeholder="Enter custom JavaScript/HTML code for this variant..."
                helpText="Add custom code that will be executed for this variant"
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      </BlockStack>
    </Card>
  );
}

export default TrafficAllocationSlider;

