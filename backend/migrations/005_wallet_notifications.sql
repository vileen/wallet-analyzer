ALTER TABLE wallets ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT true;
