CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'new_transaction', 'price_alert', 'large_transfer', 'holdings_change', 'error'
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_wallet_unread ON notifications(wallet_id, read, created_at DESC);
