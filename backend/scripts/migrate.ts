import { query } from '../src/db';

async function migrate() {
  console.log('Running migrations...');

  await query(`
    CREATE TABLE IF NOT EXISTS wallets (
      id SERIAL PRIMARY KEY,
      address VARCHAR(44) UNIQUE NOT NULL,
      label VARCHAR(255),
      last_signature VARCHAR(100),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      signature VARCHAR(100) UNIQUE NOT NULL,
      wallet_id INTEGER REFERENCES wallets(id) ON DELETE CASCADE,
      type VARCHAR(20) CHECK (type IN ('buy', 'sell', 'transfer_in', 'transfer_out', 'internal_transfer', 'liquidity_add', 'liquidity_remove')),
      token_mint VARCHAR(44),
      token_symbol VARCHAR(50),
      token_name VARCHAR(255),
      amount NUMERIC,
      usd_value NUMERIC,
      counterparty_mint VARCHAR(44),
      counterparty_symbol VARCHAR(50),
      counterparty_amount NUMERIC,
      from_address VARCHAR(44),
      to_address VARCHAR(44),
      timestamp TIMESTAMP,
      slot BIGINT,
      is_spam BOOLEAN DEFAULT false,
      raw_json JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_signature ON transactions(signature);
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS tokens (
      mint VARCHAR(44) PRIMARY KEY,
      symbol VARCHAR(50),
      name VARCHAR(255),
      decimals INTEGER,
      is_verified BOOLEAN DEFAULT false,
      jupiter_score INTEGER,
      is_spam BOOLEAN DEFAULT false,
      last_updated TIMESTAMP DEFAULT NOW()
    )
  `);

  console.log('Migrations complete!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
