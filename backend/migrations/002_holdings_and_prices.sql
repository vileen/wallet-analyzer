-- Add price cache table
CREATE TABLE IF NOT EXISTS price_cache (
  mint TEXT PRIMARY KEY,
  price_usd NUMERIC,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add holdings snapshots table
CREATE TABLE IF NOT EXISTS holdings_snapshots (
  id SERIAL PRIMARY KEY,
  wallet_id INTEGER REFERENCES wallets(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMP DEFAULT NOW(),
  total_value_usd NUMERIC,
  sol_balance NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_holdings_snapshots_wallet_id ON holdings_snapshots(wallet_id);
CREATE INDEX IF NOT EXISTS idx_holdings_snapshots_snapshot_at ON holdings_snapshots(snapshot_at);

-- Add holdings items table (individual tokens in a snapshot)
CREATE TABLE IF NOT EXISTS holdings_items (
  id SERIAL PRIMARY KEY,
  snapshot_id INTEGER REFERENCES holdings_snapshots(id) ON DELETE CASCADE,
  mint TEXT NOT NULL,
  symbol TEXT,
  name TEXT,
  decimals INTEGER DEFAULT 0,
  amount NUMERIC NOT NULL,
  price_usd NUMERIC,
  value_usd NUMERIC,
  pool_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_holdings_items_snapshot_id ON holdings_items(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_holdings_items_mint ON holdings_items(mint);
