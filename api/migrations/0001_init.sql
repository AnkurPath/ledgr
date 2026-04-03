-- Ledgr schema (PostgreSQL)
--
-- Notes:
-- - Uses `pgcrypto` for `gen_random_uuid()`.
-- - `transactions.transfer_id` is a self-reference used to link two rows for transfers.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name varchar,
  email varchar UNIQUE
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar,
  account_type varchar,
  current_balance numeric
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar,
  direction varchar,
  CONSTRAINT categories_direction_check
    CHECK (direction IN ('inflow', 'outflow', 'transfer'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount numeric,
  actual_amount numeric,
  transfer_id uuid,
  transaction_date date
);

ALTER TABLE transactions
  ADD CONSTRAINT transactions_transfer_id_fkey
  FOREIGN KEY (transfer_id)
  REFERENCES transactions(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_symbol varchar UNIQUE,
  asset_class varchar,
  current_price numeric
);

CREATE TABLE IF NOT EXISTS user_investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  quantity numeric,
  avg_buy_price numeric
);

-- Helpful indexes for common joins
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_user_investments_user_id ON user_investments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_investments_asset_id ON user_investments(asset_id);

COMMIT;

