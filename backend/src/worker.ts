import cron from 'node-cron';
import { query } from './db';
import { fetchTransactions, classifyTransaction, ParsedTransaction } from './solana';
import { resolveToken } from './tokenResolver';
import { getTokenPrice, calculateUsdValue } from './priceResolver';
import { saveHoldingsSnapshot } from './holdings';
import { notifyNewTransaction } from './notifications';

let isRunning = false;

export function startWorker(): void {
  // Run every 15 minutes (reduced from 5 min to avoid Helius rate limits)
  cron.schedule('*/15 * * * *', async () => {
    if (isRunning) {
      console.log('[Worker] Previous run still in progress, skipping...');
      return;
    }
    isRunning = true;
    try {
      await processWallets();
    } catch (error) {
      console.error('[Worker] Error:', error);
    } finally {
      isRunning = false;
    }
  });

  console.log('[Worker] Started - polling every 15 minutes');
}

async function processWallets(): Promise<void> {
  const wallets = await query('SELECT * FROM wallets WHERE is_active = true');
  if (wallets.rows.length === 0) return;

  const trackedAddresses = new Set(wallets.rows.map(w => w.address.toLowerCase()));

  for (const wallet of wallets.rows) {
    try {
      await processWallet(wallet, trackedAddresses);
      await saveHoldingsSnapshot(wallet.id, wallet.address);
      console.log(`[Worker] Snapshotted holdings for ${wallet.label || wallet.address}`);
    } catch (error) {
      console.error(`[Worker] Failed to process wallet ${wallet.address}:`, error);
    }
  }
}

async function processWallet(wallet: any, trackedAddresses: Set<string>): Promise<void> {
  console.log(`[Worker] Processing wallet: ${wallet.label || wallet.address}`);

  // Always fetch recent transactions and deduplicate
  const txs = await fetchTransactions(wallet.address, undefined, 50);
  if (txs.length === 0) return;

  // Process oldest first for correct ordering
  const sorted = txs.sort((a, b) => a.timestamp - b.timestamp);
  let processed = 0;

  for (const tx of sorted) {
    // Skip if already exists (idempotent)
    const existing = await query('SELECT 1 FROM transactions WHERE signature = $1', [tx.signature]);
    if (existing.rows.length > 0) continue;

    await processTransaction(tx, wallet.id, wallet.address, trackedAddresses);
    processed++;
  }

  // Update last processed signature to newest
  const newest = sorted[sorted.length - 1];
  await query('UPDATE wallets SET last_signature = $1 WHERE id = $2', [newest.signature, wallet.id]);

  console.log(`[Worker] Processed ${processed} new transactions for ${wallet.label || wallet.address}`);
}

async function processTransaction(
  tx: ParsedTransaction,
  walletId: number,
  walletAddress: string,
  trackedAddresses: Set<string>
): Promise<void> {
  const classification = classifyTransaction(tx, walletAddress, trackedAddresses);
  if (!classification) return;

  const { type, primaryTransfer, counterpartyTransfer } = classification;
  if (!primaryTransfer) return;

  // Resolve token info using our resolver (Helius + hardcoded + cache)
  const tokenInfo = await resolveToken(primaryTransfer.mint);

  // Calculate USD value
  let usdValue: number | null = null;
  const price = await getTokenPrice(primaryTransfer.mint);
  if (price !== null) {
    const decimals = tokenInfo?.decimals || 0;
    usdValue = calculateUsdValue(primaryTransfer.amount, decimals, price);
  }

  // Get counterparty info
  let counterpartySymbol = null;
  let counterpartyName = null;
  if (counterpartyTransfer) {
    const cpInfo = await resolveToken(counterpartyTransfer.mint);
    counterpartySymbol = cpInfo?.symbol || null;
    counterpartyName = cpInfo?.name || null;
  }

  // Mark as spam if USD value is below $1
  const isSpam = usdValue !== null && usdValue < 1;

  await query(
    `INSERT INTO transactions 
     (signature, wallet_id, type, token_mint, token_symbol, token_name, amount, usd_value, 
      counterparty_mint, counterparty_symbol, counterparty_amount, from_address, to_address, 
      timestamp, slot, is_spam, raw_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (signature) DO NOTHING`,
    [
      tx.signature,
      walletId,
      type,
      primaryTransfer.mint,
      tokenInfo?.symbol || 'Unknown',
      tokenInfo?.name || 'Unknown',
      primaryTransfer.amount,
      usdValue,
      counterpartyTransfer?.mint || null,
      counterpartySymbol,
      counterpartyTransfer?.amount || null,
      primaryTransfer.from,
      primaryTransfer.to,
      new Date(tx.timestamp),
      tx.slot,
      isSpam,
      JSON.stringify(tx.raw),
    ]
  );

  // Send notification for significant transactions (non-spam, or spam but large)
  if (!isSpam && usdValue !== null && usdValue >= 1) {
    await notifyNewTransaction(
      walletId,
      type,
      tokenInfo?.symbol || 'Unknown',
      primaryTransfer.amount,
      usdValue,
      tx.signature
    );
  }
}
