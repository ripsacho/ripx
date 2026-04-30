# Query Builder Recommendation

## Current State: Raw SQL Queries

**Pros:**

- ✅ Full control over queries
- ✅ No additional dependencies
- ✅ Direct performance optimization
- ✅ Using parameterized queries (SQL injection safe)
- ✅ Works well for simple queries

**Cons:**

- ❌ Verbose and repetitive code
- ❌ Hard to maintain (see the fallback query logic)
- ❌ No type safety
- ❌ Database-specific code
- ❌ Harder to test
- ❌ Complex queries become unreadable
- ❌ Manual column name management

## Recommendation: Use Knex.js Query Builder

### Why Knex.js?

1. **Cleaner Code**: Your current `createTest` has 60+ lines with fallback logic. With Knex, it would be ~15 lines.

2. **Better Maintainability**:
   - Current: Manual string concatenation, error-prone
   - With Knex: Type-safe, chainable queries

3. **Migration Support**: Built-in migration system (you're already using SQL migrations, but Knex makes it easier)

4. **Database Agnostic**: Easy to switch databases if needed

5. **Type Safety**: Can add TypeScript later for full type safety

### Example: Current vs Knex

**Current (Raw SQL):**

```javascript
let sql = `
  INSERT INTO tests (
    shop_domain, name, type, target_type, target_id, 
    status, goal, variants, scheduled_start_at, scheduled_stop_at,
    auto_start, auto_stop, timezone, created_at, updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
  RETURNING *
`;

let params = [
  shop_domain,
  name,
  type,
  target_type || null,
  target_id || null,
  status,
  goal ? JSON.stringify(goal) : '{}',
  variants ? JSON.stringify(variants) : '[]',
  scheduled_start_at || null,
  scheduled_stop_at || null,
  auto_start,
  auto_stop,
  timezone,
];

// Then fallback logic...
```

**With Knex:**

```javascript
const insertData = {
  shop_domain: shopDomain,
  name,
  type,
  target_type: targetType || null,
  target_id: targetId || null,
  status,
  goal: goal || {},
  variants: variants || [],
  scheduled_start_at: scheduledStartAt || null,
  scheduled_stop_at: scheduledStopAt || null,
  auto_start: autoStart || false,
  auto_stop: autoStop || false,
  timezone: timezone || 'UTC',
};

// Knex automatically handles JSONB, nulls, and column existence
const [test] = await db('tests').insert(insertData).returning('*');
```

### Migration Path

**Option 1: Keep Raw SQL (Current)**

- ✅ No changes needed
- ✅ Works fine for small projects
- ❌ Gets messy as project grows

**Option 2: Migrate to Knex.js (Recommended)**

- ✅ Better long-term maintainability
- ✅ Cleaner code
- ✅ Built-in migrations
- ⚠️ Requires refactoring (~2-3 hours)

### Quick Start with Knex

```bash
npm install knex
```

```javascript
// backend/src/utils/database.js
const knex = require('knex')({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 10 },
});

module.exports = knex;
```

```javascript
// backend/src/models/test.js
const db = require('../utils/database');

async createTest(testData) {
  const insertData = {
    shop_domain: testData.shop_domain,
    name: testData.name,
    type: testData.type,
    target_type: testData.target_type || null,
    target_id: testData.target_id || null,
    status: testData.status || 'draft',
    goal: testData.goal || {},
    variants: testData.variants || [],
    scheduled_start_at: testData.scheduled_start_at || null,
    scheduled_stop_at: testData.scheduled_stop_at || null,
    auto_start: testData.auto_start || false,
    auto_stop: testData.auto_stop || false,
    timezone: testData.timezone || 'UTC'
  };

  const [test] = await db('tests')
    .insert(insertData)
    .returning('*');

  return test;
}
```

## My Recommendation

**For this project**: **Keep raw SQL for now**, but consider migrating to Knex.js when:

- You add more complex queries
- You need better type safety
- The codebase grows significantly
- You want easier testing

**Why?**

- Your current approach is secure (parameterized queries)
- It works fine for the current scope
- Migration can be done incrementally
- No urgent need to change

**However**, if you're planning to scale or add more features, **migrate to Knex.js now** - it will save time in the long run.

## Alternative: Prisma ORM

For even better type safety and developer experience:

- Prisma (TypeScript-first ORM)
- Sequelize (Mature, feature-rich)
- TypeORM (TypeScript ORM)

But Knex.js is the sweet spot: query builder (not full ORM), flexible, and easy to learn.
