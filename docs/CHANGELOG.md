# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Variant display reliability**: Robust variant count display across list, detail, and wizard
  - `getVariantCount()` utility prefers `variant_count` from API, falls back to `variants.length`
  - Backend `ensureVariantCount()` helper on all test-returning endpoints
  - `variant_count` in create, update, clone, variants/codes, variants/allocation responses
- **Data flow improvements**: Immediate correct display when navigating
  - Pass `listTest` when navigating from list/dashboard to detail (placeholderData)
  - Pass `createdTest` when navigating from create/clone to detail
  - Pre-populate React Query cache before navigation
- **TestWizard sync**: Always sync variants from server when count differs
  - Key-based remount when variant count changes
  - Accept server data when it has more variants (refetch after save)
- **Cache invalidation**: Single-test query invalidated on save, start, stop
  - `useInvalidateTests(testId)` invalidates both list and single test
  - `useStartTest` / `useStopTest` invalidate single test in `onSettled`
  - `useDeleteTest` removes deleted test from cache
- **useTest enhancements**: `refetchOnMount: 'always'`, `refetchOnWindowFocus: true`, `staleTime: 10s`
- **Test type display fix**: Onsite-edit tests no longer mislabeled as Theme when config is empty
  - Use `goal.template_key` when config has no distinctive keys

### Fixed

- Variant count showing 2 instead of 3 on test list and detail
- Onsite-edit tests incorrectly displayed as Theme test type
- Stale variant data after save (cache now updated from API response)
- Test detail not refreshing after start/stop mutations

## [1.0.0] - 2025-02-15

### Added

- Initial release
- AB testing platform for Shopify and standalone sites
- Multi-variant testing (A/B, A/B/C, multivariate)
- Analytics dashboard with statistical significance
- Docker support, CI/CD, pre-commit hooks
