# Database Migrations

## Running Migrations

To create the database tables, run:

```bash
npm run migrate
```

Or from the project root:

```bash
cd backend && node migrations/run.js
```

## Quick Fix: Create Users Table Only

If you just need to create the users table (for profile/account/preferences):

```bash
cd backend && node migrations/create-users-table.js
```

## Manual SQL Execution

If migrations fail, you can run the SQL directly in your PostgreSQL database:

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_domain VARCHAR(255) NOT NULL UNIQUE,
    profile JSONB DEFAULT '{}',
    account JSONB DEFAULT '{}',
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_shop_domain ON users(shop_domain);

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Note

The app will work with localStorage fallback if the database table doesn't exist, but for production use, you should run the migrations to store data in the database.
