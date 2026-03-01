-- Super admin bootstrap: first admin can be created/accepted directly from the database.
-- Run after server setup so the first super admin can log in and accept others.
--
-- Option 1 (recommended): set RIPX_SUPERADMIN_EMAIL or RIPX_ADMIN_EMAIL in .env and run:
--   npm run ensure-superadmin
--
-- Option 2 (manual): to verify and accept an existing user as super admin, run:
--
--   UPDATE users
--   SET status = 'accepted',
--       email_verified_at = COALESCE(email_verified_at, NOW()),
--       accepted_at = COALESCE(accepted_at, NOW()),
--       accepted_by = 'database',
--       role = 'superadmin',
--       updated_at = NOW()
--   WHERE LOWER(TRIM(email)) = LOWER('your-admin@example.com');
--
-- To create a new super admin user directly in the database (e.g. no sign-up yet):
--
--   INSERT INTO users (email, status, email_verified_at, accepted_at, accepted_by, role, created_at, updated_at)
--   VALUES (
--     LOWER(TRIM('admin@example.com')),
--     'accepted',
--     NOW(),
--     NOW(),
--     'system',
--     'superadmin',
--     NOW(),
--     NOW()
--   );
-- Then ensure they have an account (link account_id); or run npm run ensure-superadmin with that email in .env.
--
-- Ensure role column exists (idempotent; 029 may have already added it)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role') THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(50);
  END IF;
END $$;

COMMENT ON COLUMN users.role IS 'Platform role: admin, superadmin. Super admin can accept users and manage roles.';
