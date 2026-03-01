-- Bootstrap super admin: ensure njrips@gmail.com is always accepted and has role superadmin so they can log in with codes.
-- Runs as part of setup (npm run migrate). Idempotent.

DO $$
DECLARE
  v_email TEXT := 'njrips@gmail.com';
  v_user_id UUID;
  v_account_id UUID;
BEGIN
  -- 1) Update existing user to accepted + superadmin
  UPDATE users
  SET status = 'accepted',
      email_verified_at = COALESCE(email_verified_at, NOW()),
      accepted_at = COALESCE(accepted_at, NOW()),
      accepted_by = COALESCE(accepted_by, 'system'),
      role = 'superadmin',
      updated_at = NOW()
  WHERE LOWER(TRIM(email)) = v_email;

  -- 2) If no row exists, insert the super admin user
  IF NOT FOUND THEN
    INSERT INTO users (email, status, email_verified_at, accepted_at, accepted_by, role, created_at, updated_at)
    VALUES (v_email, 'accepted', NOW(), NOW(), 'system', 'superadmin', NOW(), NOW());
  END IF;

  -- 3) Get user id
  SELECT id INTO v_user_id FROM users WHERE LOWER(TRIM(email)) = v_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- 4) Ensure user has an account (for app access)
  SELECT account_id INTO v_account_id FROM users WHERE id = v_user_id;
  IF v_account_id IS NULL THEN
    INSERT INTO accounts (name, created_at, updated_at)
    VALUES ('RipX Super Admin', NOW(), NOW())
    RETURNING id INTO v_account_id;
    UPDATE users SET account_id = v_account_id, updated_at = NOW() WHERE id = v_user_id;
  END IF;
END $$;

COMMENT ON COLUMN users.role IS 'Platform role: admin, superadmin. Bootstrap: njrips@gmail.com is always superadmin (migration 044).';
