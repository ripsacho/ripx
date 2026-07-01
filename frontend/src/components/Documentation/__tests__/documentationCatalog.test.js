import {
  DOC_MODES,
  DOC_AUDIENCE_JOURNEYS,
  DOC_HUB_TAB_ID,
  DOC_RESEARCH_LIBRARY,
  FEATURE_GUIDE_DECISION_CARDS,
  FEATURE_GUIDE_PATHS,
  buildDocsUrl,
  buildSectionTabId,
  createDefaultDocTabs,
  filterSectionsByDocMode,
  findDocModeForSection,
  getDocsFooterResources,
  getAudienceJourneys,
  getDocTabLabel,
  getFeatureGuideDecisionCards,
  getFeatureGuideStats,
  getResearchLibraryForMode,
  getRelatedSectionIds,
  getSectionKindMeta,
  isHubTabId,
  normalizeDocMode,
  normalizeDocTab,
  parseSectionTabId,
  persistDocMode,
  persistDocTabs,
  readPersistedDocMode,
  readPersistedDocTabs,
  sectionMatchesDocMode,
} from '../documentationCatalog';

const SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'installation', title: 'Installation' },
  { id: 'price-testing', title: 'Price testing' },
  { id: 'goals-metrics', title: 'Goals & Metrics' },
  { id: 'getting-started', title: 'Getting Started' },
  { id: 'api', title: 'API Reference' },
];

describe('documentationCatalog', () => {
  it('normalizes unknown doc modes to all', () => {
    expect(normalizeDocMode('feature-guides')).toBe('feature-guides');
    expect(normalizeDocMode('unknown')).toBe('all');
  });

  it('filters sections by feature-guides and setup modes', () => {
    const featureSections = filterSectionsByDocMode(SECTIONS, 'feature-guides');
    expect(featureSections.map(section => section.id)).toEqual([
      'overview',
      'price-testing',
      'goals-metrics',
    ]);

    const setupSections = filterSectionsByDocMode(SECTIONS, 'setup');
    expect(setupSections.map(section => section.id)).toEqual(['overview', 'installation']);
  });

  it('finds the best mode for a section id', () => {
    expect(findDocModeForSection('price-testing')).toBe('feature-guides');
    expect(findDocModeForSection('goals-metrics')).toBe('feature-guides');
    expect(findDocModeForSection('installation')).toBe('setup');
    expect(findDocModeForSection('api')).toBe('developer');
  });

  it('exposes section kind and related section metadata', () => {
    expect(getSectionKindMeta('price-testing').label).toBe('Feature guide');
    expect(getSectionKindMeta('api').id).toBe('dev');
    expect(getRelatedSectionIds('price-testing')).toContain('launch-preflight');
  });

  it('returns mode-scoped footer resources', () => {
    const devResources = getDocsFooterResources('developer');
    expect(devResources.some(item => item.sectionId === 'api')).toBe(true);
    expect(getDocsFooterResources('unknown-mode').length).toBeGreaterThan(0);
  });

  it('persists browse mode in session storage', () => {
    const store = {};
    const storage = {
      getItem: key => store[key] ?? null,
      setItem: (key, value) => {
        store[key] = String(value);
      },
      removeItem: key => {
        delete store[key];
      },
    };
    const originalWindow = global.window;
    global.window = { sessionStorage: storage };

    persistDocMode('feature-guides');
    expect(readPersistedDocMode()).toBe('feature-guides');
    persistDocMode('all');
    expect(readPersistedDocMode()).toBe(null);

    global.window = originalWindow;
  });

  it('builds docs URLs with optional mode and hash', () => {
    expect(buildDocsUrl({ mode: 'feature-guides', sectionId: 'price-testing' })).toBe(
      '/docs?mode=feature-guides#price-testing'
    );
    expect(buildDocsUrl({ sectionId: 'installation' })).toBe('/docs#installation');
  });

  it('keeps feature guide paths aligned with catalog modes', () => {
    FEATURE_GUIDE_PATHS.forEach(path => {
      const mode = normalizeDocMode(path.mode || 'feature-guides');
      path.sectionIds.forEach(sectionId => {
        expect(sectionMatchesDocMode(sectionId, mode)).toBe(true);
      });
    });
    expect(DOC_MODES.some(mode => mode.id === 'feature-guides')).toBe(true);
  });

  it('summarizes feature guide coverage', () => {
    const stats = getFeatureGuideStats();
    expect(stats.pathCount).toBe(FEATURE_GUIDE_PATHS.length);
    expect(stats.uniqueSectionCount).toBeGreaterThan(5);
    expect(stats.totalStepCount).toBeGreaterThan(stats.pathCount);
  });

  it('keeps decision cards pointed at feature guide sections', () => {
    expect(getFeatureGuideDecisionCards()).toBe(FEATURE_GUIDE_DECISION_CARDS);
    FEATURE_GUIDE_DECISION_CARDS.forEach(card => {
      expect(sectionMatchesDocMode(card.sectionId, 'feature-guides')).toBe(true);
    });
  });

  it('filters audience journeys by browse mode', () => {
    expect(getAudienceJourneys('all')).toBe(DOC_AUDIENCE_JOURNEYS);
    expect(getAudienceJourneys('developer').every(item => item.mode === 'developer')).toBe(true);
  });

  it('keeps each audience journey anchored to at least one rendered section', () => {
    DOC_AUDIENCE_JOURNEYS.forEach(journey => {
      const mode = normalizeDocMode(journey.mode);
      expect(journey.sectionIds.some(sectionId => sectionMatchesDocMode(sectionId, mode))).toBe(
        true
      );
    });
  });

  it('filters research resources by browse mode', () => {
    expect(getResearchLibraryForMode('all')).toBe(DOC_RESEARCH_LIBRARY);
    const setupResources = getResearchLibraryForMode('setup');
    expect(setupResources.every(item => item.mode === 'setup')).toBe(true);
    expect(setupResources.length).toBeGreaterThan(0);
  });

  it('builds and normalizes browser tab ids', () => {
    expect(buildSectionTabId('price-testing')).toBe('section:price-testing');
    expect(parseSectionTabId('section:api')).toBe('api');
    expect(isHubTabId(DOC_HUB_TAB_ID)).toBe(true);
    expect(
      normalizeDocTab({ id: buildSectionTabId('api'), kind: 'section' }, { sections: SECTIONS })
    ).toEqual({
      id: 'section:api',
      kind: 'section',
      closable: true,
    });
  });

  it('creates default tabs and labels', () => {
    const tabs = createDefaultDocTabs('overview');
    expect(tabs[0].id).toBe(DOC_HUB_TAB_ID);
    expect(tabs[1].id).toBe('section:overview');
    const byId = Object.fromEntries(SECTIONS.map(section => [section.id, section]));
    expect(getDocTabLabel(tabs[0], byId)).toBe('Guide hub');
    expect(getDocTabLabel(tabs[1], byId)).toBe('Overview');
  });

  it('persists open doc tabs in session storage', () => {
    const store = {};
    const storage = {
      getItem: key => store[key] ?? null,
      setItem: (key, value) => {
        store[key] = String(value);
      },
      removeItem: key => {
        delete store[key];
      },
    };
    const originalWindow = global.window;
    global.window = { sessionStorage: storage };

    const tabs = createDefaultDocTabs('installation');
    persistDocTabs(tabs);
    expect(readPersistedDocTabs({ sections: SECTIONS })?.length).toBe(2);

    global.window = originalWindow;
  });
});
