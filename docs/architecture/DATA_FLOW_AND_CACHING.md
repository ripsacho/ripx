# Data Flow & Caching Architecture

How test data flows from API to UI and how caching keeps it consistent.

---

## Overview

RipX uses **TanStack Query** (React Query) for server state. Test data is cached with two query keys:

| Query Key | Data | Stale Time |
|-----------|------|------------|
| `['tests']` | Array of all tests | 30s |
| `['tests', id]` | Single test | 10s |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NAVIGATION SOURCES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  List/Dashboard          Create/Clone           Direct URL / Refresh        │
│  (has listTest)          (has createdTest)      (no state)                   │
└────────┬────────────────────────┬────────────────────────┬─────────────────┘
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TestDetail Component                                 │
│  • useTest(id, { placeholderData })                                         │
│  • placeholderData = listTest || createdTest (when id matches)              │
│  • Pre-populate cache via useEffect when state has test                      │
└────────┬────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         useTest(id) Hook                                     │
│  • Returns: placeholderData (immediate) OR cached OR fetches                │
│  • refetchOnMount: 'always'                                                 │
│  • refetchOnWindowFocus: true                                                │
│  • staleTime: 10s                                                            │
└────────┬────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TestWizard (initialData={test})                      │
│  • key={`test-wizard-${test.id}-${getVariantCount(test)}`}                  │
│  • Syncs variants from initialData; remounts when variant count changes     │
│  • Accepts server data when it has more variants (refetch after save)         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Variant Display Reliability

### Problem

Tests with 3+ variants sometimes showed "2 variants" due to:
- Stale cache from list
- Cache not updated after save
- Test type mislabeled (onsite-edit → theme) when config empty

### Solution

| Layer | Fix |
|-------|-----|
| **Backend** | `ensureVariantCount(test)` on all test-returning endpoints; adds `variant_count` |
| **Frontend utils** | `getVariantCount(test)` prefers `variant_count`, else `variants.filter(Boolean).length` |
| **Test type** | `getTestTypeDisplay()` uses `goal.template_key` when config has no distinctive keys |
| **Cache** | Pre-populate from list/create; update from save response; invalidate on mutations |
| **Wizard** | Key includes variant count; sync when server has more variants |

---

## Mutation Flow

### Save (PUT /api/tests/:id)

```
User clicks Save
  → apiPut('/tests/:id', payload)
  → Response has updated test with variant_count
  → queryClient.setQueryData(['tests', id], updatedTest)
  → invalidateTests(id)
  → useTest refetches (or uses set data)
  → TestWizard remounts (key changed if variant count changed)
```

### Start / Stop

```
User clicks Start/Stop
  → mutateAsync(testId)
  → onSettled: invalidateQueries(['tests']), invalidateQueries(['tests', testId])
  → useTest refetches
  → Fresh data with new status
```

### Delete

```
User clicks Delete
  → mutateAsync(testId)
  → onSuccess: invalidateQueries(['tests']), removeQueries(['tests', testId])
  → Navigate to /tests
  → Deleted test gone from list; no stale cache for deleted id
```

---

## API Response Shape

All test-returning endpoints include `variant_count`:

```json
{
  "success": true,
  "test": {
    "id": "uuid",
    "name": "My Test",
    "type": "content",
    "variants": [...],
    "variant_count": 3,
    "goal": { "template_key": "onsite-edit", ... }
  }
}
```

Endpoints with `variant_count`:
- `POST /api/tests` (create)
- `GET /api/tests/:id`
- `PUT /api/tests/:id`
- `PUT /api/tests/:id/variants/codes`
- `PUT /api/tests/:id/variants/allocation`
- `POST /api/tests/:id/clone`
- `GET /api/tests` (list; each test has `variant_count`)

---

## Navigation State

When navigating, pass the test in `location.state`:

| From | State Key | When |
|------|-----------|------|
| List | `listTest` | Click test card |
| Dashboard | `listTest` | Click test card or View |
| Create | `createdTest` | After successful create |
| Clone | `createdTest` | After successful clone |

TestDetail reads: `location.state?.listTest` and `location.state?.createdTest`.

---

## Related Files

- `frontend/src/hooks/useTests.js` — Query and mutation hooks
- `frontend/src/utils/testType.js` — `getTestTypeDisplay`, `getVariantCount`
- `backend/src/routes/testRoutes.js` — `ensureVariantCount` helper
- `frontend/src/components/TestDetail/TestDetail.jsx` — Cache pre-population, placeholderData
- `frontend/src/components/TestList/TestList.jsx` — `navigate(..., { state: { listTest } })`
- `frontend/src/components/TestCreator/TestCreator.jsx` — Pre-populate before navigate
