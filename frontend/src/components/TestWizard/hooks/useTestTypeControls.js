import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiGet } from '../../../services';
import { STANDALONE_TEST_TYPE_IDS } from '../../../constants';
import { getDefaultTestTypeState, normalizeTestTypeKey } from '../../../utils/testTypeControls';

export const DEFAULT_TEST_TYPE_STATE = Object.freeze(getDefaultTestTypeState());

export function useTestTypeControls({
  isStandalone,
  selectedTemplate,
  setSelectedTemplate,
  testTypeCategories,
}) {
  const [testTypeControls, setTestTypeControls] = useState(DEFAULT_TEST_TYPE_STATE);

  const getTemplateControl = useCallback(
    templateKey => {
      const normalized = normalizeTestTypeKey(templateKey);
      if (!normalized) {
        return { mode: 'enabled', message: '', hidden: false };
      }
      const control = testTypeControls[normalized] || { mode: 'enabled', message: '' };
      return {
        mode: control.mode || 'enabled',
        message: control.message || '',
        hidden: control.mode === 'hidden',
      };
    },
    [testTypeControls]
  );

  const isTemplateTypeEnabled = useCallback(
    templateKey => {
      const control = getTemplateControl(templateKey);
      return control.mode === 'enabled';
    },
    [getTemplateControl]
  );

  const isTemplateTypeHidden = useCallback(
    templateKey => getTemplateControl(templateKey).hidden,
    [getTemplateControl]
  );

  const getTemplateUnavailableReason = useCallback(
    templateKey => {
      if (isTemplateTypeEnabled(templateKey)) {
        return '';
      }
      const control = getTemplateControl(templateKey);
      return control.message || 'This test type is currently unavailable (under construction).';
    },
    [getTemplateControl, isTemplateTypeEnabled]
  );

  const contentTypesForStep = useMemo(() => {
    const baseTypes = isStandalone
      ? testTypeCategories.content.types.filter(t => STANDALONE_TEST_TYPE_IDS.includes(t.key))
      : testTypeCategories.content.types;
    return baseTypes.filter(type => !isTemplateTypeHidden(type.key));
  }, [isStandalone, isTemplateTypeHidden, testTypeCategories]);

  const profitTypesForStep = useMemo(
    () => testTypeCategories.profit.types.filter(type => !isTemplateTypeHidden(type.key)),
    [isTemplateTypeHidden, testTypeCategories]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet('/settings/test-type-controls');
        const payload = res?.data?.data ?? res?.data;
        const types = Array.isArray(payload?.types) ? payload.types : [];
        const next = { ...DEFAULT_TEST_TYPE_STATE };
        types.forEach(type => {
          const typeKey = normalizeTestTypeKey(type?.key);
          if (!typeKey || !(typeKey in next)) {
            return;
          }
          next[typeKey] = {
            mode:
              String(type?.mode || 'enabled')
                .trim()
                .toLowerCase() || 'enabled',
            message: String(type?.message || '').trim(),
          };
        });
        if (!cancelled) {
          setTestTypeControls(next);
        }
      } catch (_err) {
        if (!cancelled) {
          setTestTypeControls({ ...DEFAULT_TEST_TYPE_STATE });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedTemplate) return;
    if (!isTemplateTypeHidden(selectedTemplate) && isTemplateTypeEnabled(selectedTemplate)) return;
    setSelectedTemplate(null);
  }, [selectedTemplate, isTemplateTypeEnabled, isTemplateTypeHidden, setSelectedTemplate]);

  return {
    testTypeControls,
    setTestTypeControls,
    getTemplateControl,
    isTemplateTypeEnabled,
    isTemplateTypeHidden,
    getTemplateUnavailableReason,
    contentTypesForStep,
    profitTypesForStep,
  };
}
