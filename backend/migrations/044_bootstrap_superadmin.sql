-- Super admin bootstrap: do not hardcode emails in migrations.
-- Create the first super admin by setting RIPX_SUPERADMIN_EMAIL (or RIPX_ADMIN_EMAIL)
-- in .env and running: npm run ensure-superadmin
-- This keeps personal identifiers out of production code and preserves admin approval workflows.

COMMENT ON COLUMN users.role IS 'Platform role: admin, superadmin. First super admin: run ensure-superadmin script with RIPX_SUPERADMIN_EMAIL set.';
