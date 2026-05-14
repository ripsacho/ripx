import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TextField, Button, Text } from '@shopify/polaris';
import { SearchIcon, XIcon } from '@shopify/polaris-icons';
import { Icon } from '@shopify/polaris';
import {
  ISO_COUNTRIES,
  normalizeCountryCode,
  getCountryDisplayLabel,
} from '../../utils/iso3166CountryDisplay';
import styles from './AudienceCountryMultiSelect.module.css';

function normalizeSelectedList(value) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    const c = normalizeCountryCode(raw);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

function measureMenuBox(triggerEl) {
  if (!triggerEl || typeof window === 'undefined') {
    return null;
  }
  const r = triggerEl.getBoundingClientRect();
  const margin = 4;
  const viewportPad = 12;
  const top = r.bottom + margin;
  const left = r.left;
  const maxRight = window.innerWidth - viewportPad;
  const width = Math.min(Math.max(r.width, 280), maxRight - viewportPad);
  const adjustedLeft = Math.min(left, Math.max(viewportPad, maxRight - width));
  const availableBelow = window.innerHeight - top - viewportPad;
  const availableAbove = r.top - viewportPad - margin;
  const preferBelow = availableBelow >= 160 || availableBelow >= availableAbove;
  if (preferBelow) {
    const maxHeight = Math.max(120, Math.min(520, availableBelow));
    return { top, left: adjustedLeft, width, maxHeight, placement: 'below' };
  }
  const maxHeight = Math.max(120, Math.min(520, availableAbove));
  const bottom = window.innerHeight - r.top + margin;
  return {
    bottom,
    left: adjustedLeft,
    width,
    maxHeight,
    placement: 'above',
  };
}

/**
 * Multi-select countries by ISO 3166-1 alpha-2; persists uppercase codes (same contract as comma field).
 * List is portaled to document.body with position:fixed so wizard overflow/transform cannot clip it.
 * @param {{ value?: string[], onChange: (codes: string[]) => void }} props
 */
export default function AudienceCountryMultiSelect({ value = [], onChange }) {
  const selected = useMemo(() => normalizeSelectedList(value), [value]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState(null);
  const wrapRef = useRef(null);
  const menuRef = useRef(null);

  const updateMenuBox = useCallback(() => {
    if (!open || !wrapRef.current) {
      setMenuBox(null);
      return;
    }
    setMenuBox(measureMenuBox(wrapRef.current));
  }, [open]);

  useLayoutEffect(() => {
    updateMenuBox();
  }, [open, updateMenuBox]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const ro =
      typeof ResizeObserver !== 'undefined' && wrapRef.current
        ? new ResizeObserver(() => updateMenuBox())
        : null;
    if (ro && wrapRef.current) {
      ro.observe(wrapRef.current);
    }
    window.addEventListener('resize', updateMenuBox);
    window.addEventListener('scroll', updateMenuBox, true);
    return () => {
      if (ro) {
        ro.disconnect();
      }
      window.removeEventListener('resize', updateMenuBox);
      window.removeEventListener('scroll', updateMenuBox, true);
    };
  }, [open, updateMenuBox]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onDoc = e => {
      const t = e.target;
      if (wrapRef.current && wrapRef.current.contains(t)) {
        return;
      }
      if (menuRef.current && menuRef.current.contains(t)) {
        return;
      }
      setOpen(false);
    };
    const onKey = e => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return ISO_COUNTRIES;
    }
    return ISO_COUNTRIES.filter(r => {
      const code = String(r.code).toLowerCase();
      const name = String(r.name).toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }, [query]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = useCallback(
    code => {
      const n = normalizeCountryCode(code);
      if (!n) {
        return;
      }
      if (selectedSet.has(n)) {
        onChange(selected.filter(c => c !== n));
      } else {
        onChange([...selected, n]);
      }
    },
    [selected, selectedSet, onChange]
  );

  const remove = useCallback(
    code => {
      const n = normalizeCountryCode(code);
      onChange(selected.filter(c => c !== n));
    },
    [selected, onChange]
  );

  const clearAll = useCallback(() => {
    onChange([]);
    setQuery('');
  }, [onChange]);

  const menuStyle =
    menuBox && typeof document !== 'undefined'
      ? {
          position: 'fixed',
          zIndex: 10000,
          left: menuBox.left,
          width: menuBox.width,
          maxHeight: menuBox.maxHeight,
          ...(menuBox.placement === 'above' ? { bottom: menuBox.bottom } : { top: menuBox.top }),
        }
      : null;

  const totalCountries = ISO_COUNTRIES.length;
  const queryTrim = query.trim();
  const headerHint =
    queryTrim === ''
      ? `${totalCountries} countries — type to filter`
      : filtered.length === 0
        ? 'No matches — try another spelling'
        : `${filtered.length} match${filtered.length === 1 ? '' : 'es'}`;

  const dropdown =
    open && menuBox && menuStyle && typeof document !== 'undefined'
      ? createPortal(
          <>
            <button
              type="button"
              className={styles.backdrop}
              aria-label="Close country list"
              onClick={() => setOpen(false)}
            />
            <div
              ref={menuRef}
              className={styles.dropdownPortal}
              style={menuStyle}
              role="dialog"
              aria-modal="false"
              aria-label="Country selector"
            >
              <div className={styles.menuHeader}>
                <Text variant="headingSm" as="h3">
                  Countries
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  {headerHint}
                </Text>
              </div>
              {filtered.length > 0 ? (
                <ul
                  className={styles.list}
                  role="listbox"
                  aria-multiselectable="true"
                  aria-label="Countries"
                >
                  {filtered.map(row => {
                    const code = String(row.code).toUpperCase();
                    const isOn = selectedSet.has(code);
                    return (
                      <li key={code} role="presentation" className={styles.optionLi}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isOn}
                          className={`${styles.option} ${isOn ? styles.optionSelected : ''}`}
                          onClick={() => toggle(code)}
                        >
                          <span
                            className={`${styles.optionCheck} ${isOn ? styles.optionCheckOn : ''}`}
                            aria-hidden="true"
                          >
                            {isOn ? '✓' : ''}
                          </span>
                          <span className={styles.optionText}>
                            <span className={styles.optionName}>{row.name}</span>
                            <span className={styles.optionCode}> ({code})</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className={styles.emptyState}>
                  <Text variant="bodyMd" as="p" tone="subdued">
                    No countries match &quot;{queryTrim}&quot;.
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    Try a shorter fragment or the two-letter code (e.g. DE).
                  </Text>
                </div>
              )}
              {selected.length > 0 && (
                <div className={styles.toolbar}>
                  <Text variant="bodySm" as="span" tone="subdued">
                    {selected.length} selected in this test
                  </Text>
                  <Button variant="plain" tone="critical" onClick={clearAll}>
                    Clear all
                  </Button>
                </div>
              )}
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <div data-ripx-country-dropdown={open ? 'open' : undefined} className={styles.root}>
      <div ref={wrapRef} className={`${styles.wrap} ${open ? styles.wrapOpen : ''}`}>
        <div className={`${styles.searchShell} ${open ? styles.searchShellOpen : ''}`}>
          <TextField
            label="Search countries"
            labelHidden
            value={query}
            onChange={setQuery}
            onFocus={() => setOpen(true)}
            placeholder="Search name or code…"
            autoComplete="off"
            clearButton
            onClearButtonClick={() => setQuery('')}
            prefix={
              <span className={styles.searchPrefix} aria-hidden="true">
                <Icon source={SearchIcon} />
              </span>
            }
          />
        </div>
      </div>
      {dropdown}

      {selected.length > 0 ? (
        <div className={styles.badgesRegion}>
          <div className={styles.badgesHeading}>
            <Text variant="bodySm" as="span" fontWeight="semibold">
              Selected countries
            </Text>
            <Text variant="bodySm" as="span" tone="subdued">
              ({selected.length})
            </Text>
          </div>
          <div className={styles.badges} aria-label="Selected countries">
            {selected.map(code => (
              <span key={code} className={styles.badge}>
                <span className={styles.badgeLabel} title={getCountryDisplayLabel(code)}>
                  {getCountryDisplayLabel(code)}
                </span>
                <button
                  type="button"
                  className={styles.badgeRemove}
                  onClick={() => remove(code)}
                  aria-label={`Remove ${getCountryDisplayLabel(code)}`}
                >
                  <Icon source={XIcon} />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className={styles.emptySelectionHint}>
          No country filter — visitors from all countries can match this test.
        </p>
      )}
    </div>
  );
}
