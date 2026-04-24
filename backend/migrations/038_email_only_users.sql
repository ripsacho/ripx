-- Email-only identity: remove auth_type and shop_domain; all users identified by email.
-- Domain type and verification live on tenants. Requires 037 to have run.
-- Migration: 038_email_only_users.sql

-- 1) Backfill email where null (from profile for legacy Shopify rows)
UPDATE users
SET email = LOWER(TRIM(profile->>'email'))
WHERE email IS NULL
  AND profile IS NOT NULL
  AND profile->>'email' IS NOT NULL
  AND TRIM(profile->>'email') != '';

-- Placeholder for rows without email: clearly not a real address (avoids collision with real emails)
UPDATE users
SET email = 'migrated-' || id::text || '@legacy.local'
WHERE email IS NULL;

-- 2) Link legacy Shopify users (have shop_domain, no account_id) to an account and tenant.
--    Only runs if shop_domain column still exists (idempotent: skip on re-run after columns dropped).
DO $$
DECLARE
  r RECORD;
  acc_id UUID;
  col_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'shop_domain'
  ) INTO col_exists;
  IF NOT col_exists THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, shop_domain FROM users
    WHERE shop_domain IS NOT NULL AND account_id IS NULL
  LOOP
    INSERT INTO accounts (name, api_key_hash, api_key_prefix, created_at, updated_at)
    VALUES ('Migrated', NULL, NULL, NOW(), NOW())
    RETURNING id INTO acc_id;

    UPDATE users SET account_id = acc_id, updated_at = NOW() WHERE id = r.id;

    UPDATE tenants
    SET account_id = acc_id, updated_at = NOW()
    WHERE LOWER(TRIM(domain)) = LOWER(TRIM(r.shop_domain));
  END LOOP;
END $$;

-- 3) Merge duplicate users by email: keep one row per LOWER(TRIM(email)), point FKs to it
DO $$
DECLARE
  dup RECORD;
  keep_id UUID;
  other_ids UUID[];
BEGIN
  FOR dup IN
    SELECT LOWER(TRIM(email)) AS norm_email, array_agg(id ORDER BY (account_id IS NOT NULL) DESC, created_at ASC) AS ids
    FROM users
    WHERE email IS NOT NULL
    GROUP BY LOWER(TRIM(email))
    HAVING COUNT(*) > 1
  LOOP
    keep_id := dup.ids[1];
    other_ids := dup.ids[2:array_length(dup.ids, 1)];

    -- Move domain access from duplicate users to kept user safely.
    -- Use UPSERT to avoid UNIQUE(user_id, tenant_id) violations when both users already
    -- have access to the same tenant. Preserve the strongest role.
    WITH merged_access AS (
      SELECT
        tenant_id,
        CASE MAX(
          CASE role
            WHEN 'owner' THEN 3
            WHEN 'member' THEN 2
            ELSE 1
          END
        )
          WHEN 3 THEN 'owner'
          WHEN 2 THEN 'member'
          ELSE 'viewer'
        END AS merged_role
      FROM user_domain_access
      WHERE user_id = ANY(other_ids)
      GROUP BY tenant_id
    )
    INSERT INTO user_domain_access (user_id, tenant_id, role, created_at, updated_at)
    SELECT keep_id, tenant_id, merged_role, NOW(), NOW()
    FROM merged_access
    ON CONFLICT (user_id, tenant_id)
    DO UPDATE SET
      role = CASE
        WHEN user_domain_access.role = 'owner' OR EXCLUDED.role = 'owner' THEN 'owner'
        WHEN user_domain_access.role = 'member' OR EXCLUDED.role = 'member' THEN 'member'
        ELSE 'viewer'
      END,
      updated_at = NOW();

    DELETE FROM users WHERE id = ANY(other_ids);
  END LOOP;
END $$;

-- 4) Normalize stored email to lowercase for consistency
UPDATE users SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL;

-- 5) Drop CHECK constraints that reference auth_type
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_type_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_identifier_check;

-- 6) Make email NOT NULL and enforce uniqueness on normalized email.
--    Since email is NOT NULL at this point, the unique index should be non-partial.
DROP INDEX IF EXISTS idx_users_email_lookup;
DROP INDEX IF EXISTS idx_users_email_unique;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users(LOWER(TRIM(email)));
-- Keep status constraint (valid for email-only: pending|accepted|rejected|active|locked|suspended)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (
  status IS NULL OR status IN ('pending', 'accepted', 'rejected', 'active', 'locked', 'suspended')
);

-- 7) Drop auth_type and shop_domain columns
ALTER TABLE users DROP COLUMN IF EXISTS auth_type;
ALTER TABLE users DROP COLUMN IF EXISTS shop_domain;

-- 8) Index for "user by account" lookups (already exists from 037, keep)
CREATE INDEX IF NOT EXISTS idx_users_account_id ON users(account_id) WHERE account_id IS NOT NULL;

-- 9) Drop index that referenced auth_type (no longer needed)
DROP INDEX IF EXISTS idx_users_auth_type;
DROP INDEX IF EXISTS idx_users_standalone_created;

COMMENT ON COLUMN users.email IS 'Single identity; unique, stored lowercase.';
