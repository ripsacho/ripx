# Custom Hooks Guide

Reusable React hooks for data fetching, mutations, and state management.

---

## Table of Contents

1. [useTests](#usetests)
2. [useTest](#usetest)
3. [useInvalidateTests](#useinvalidatetests)
4. [Mutations](#mutations)
5. [Data Flow & Caching](#data-flow--caching)

---

## useTests

Fetches the list of all tests for the current shop.

```javascript
import { useTests } from '../hooks';

function TestList() {
  const { data: tests = [], isLoading, isError, error, refetch } = useTests();

  if (isLoading) return <Loading />;
  if (isError) return <Error message={error.message} />;

  return (
    <ul>
      {tests.map(test => (
        <li key={test.id}>{test.name}</li>
      ))}
    </ul>
  );
}
```

**Options:**

- `staleTime`: 30 seconds (default)
- Uses TanStack Query `['tests']` as query key

---

## useTest

Fetches a single test by ID. Used on the test detail page.

```javascript
import { useTest } from '../hooks';

function TestDetail({ id }) {
  const {
    data: test,
    isLoading,
    isError,
    error,
  } = useTest(id, {
    placeholderData: placeholderTest, // Optional: show immediately when navigating from list/create
  });

  if (isLoading && !test) return <Loading />;
  if (!test) return <NotFound />;

  return <TestWizard initialData={test} />;
}
```

**Options:**

- `placeholderData`: Test object to show immediately (e.g. from `location.state.listTest` or `createdTest`)
- `staleTime`: 10 seconds
- `refetchOnMount`: `'always'` — refetch when navigating to detail
- `refetchOnWindowFocus`: `true` — refetch when returning to tab
- Query key: `['tests', id]`

**When to pass placeholderData:**

- From **list**: `location.state?.listTest` when `listTest?.id === id`
- From **create/clone**: `location.state?.createdTest` when `createdTest?.id === id`

---

## useInvalidateTests

Invalidates the tests cache. Call after create, update, or when data may be stale.

```javascript
import { useInvalidateTests } from '../hooks';

function TestCreator() {
  const invalidateTests = useInvalidateTests();

  const handleCreate = async payload => {
    const { test } = await apiPost('/tests', payload);
    invalidateTests(test.id); // Invalidates list AND single test
    navigate(`/tests/${test.id}`);
  };
}
```

**Signature:** `invalidateTests(testId?: string)`

- No arg: invalidates list only
- With `testId`: invalidates list and `['tests', testId]`

---

## Mutations

### useStartTest

```javascript
const startMutation = useStartTest();
await startMutation.mutateAsync(testId);
// Invalidates list and single test on success/error
```

### useStopTest

```javascript
const stopMutation = useStopTest();
await stopMutation.mutateAsync(testId);
// Invalidates list and single test on success/error
```

### useDeleteTest

```javascript
const deleteMutation = useDeleteTest();
await deleteMutation.mutateAsync(testId);
// Invalidates list; removes ['tests', testId] from cache
```

### usePersonalizeTest

```javascript
const personalizeMutation = usePersonalizeTest();
await personalizeMutation.mutateAsync({ testId, variantIndex });
// Invalidates list and single test on success
```

### useRolloutTest

```javascript
const rolloutMutation = useRolloutTest();
await rolloutMutation.mutateAsync({ testId, initialPercent, schedule });
// Invalidates list and single test on success
```

### useDisablePersonalization

```javascript
const disableMutation = useDisablePersonalization();
await disableMutation.mutateAsync(testId);
// Invalidates list and single test on success
```

---

## Data Flow & Caching

### Cache Keys

| Key             | Data           | Used By                             |
| --------------- | -------------- | ----------------------------------- |
| `['tests']`     | Array of tests | List, Dashboard, Analytics overview |
| `['tests', id]` | Single test    | Test detail, TestWizard             |

### Navigation Flow

1. **List → Detail**: `navigate(\`/tests/${test.id}\`, { state: { listTest: test } })`
   - TestDetail uses `listTest` as `placeholderData`
   - Cache pre-populated when list has variants
   - Refetch runs in background

2. **Create → Detail**: `queryClient.setQueryData(['tests', id], testData)` then `navigate(..., { state: { createdTest } })`
   - Cache already has the created test
   - No loading flash

3. **Save**: Response used to `setQueryData(['tests', id], updatedTest)`; then `invalidateTests(id)`

### Best Practices

- **Always pass test in state** when navigating from list/dashboard to detail
- **Pre-populate cache** before navigating from create/clone
- **Invalidate with testId** after save so detail view refetches
- **Use `getVariantCount(test)`** for display instead of `test.variants?.length`

---

## Other Hooks

- **useAnalytics** — Analytics data for a test
- **useAnimatedCounter** — Animated number transitions
- **useMouseTilt** — 3D tilt effect on hover
- **useCursorGlow** — Cursor glow effect

See `frontend/src/hooks/index.js` for exports.
