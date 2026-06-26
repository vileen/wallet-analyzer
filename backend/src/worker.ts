import cron from 'node-cron';
import { query } from './db';
import { fetchTransactions, classifyTransaction, ParsedTransaction } from './solana';
import { getTokenInfo, getTokenPrice } from './jupiter';

let isRunning = false;

export function startWorker(): void {
  // Run every minute
  cron.schedule('* * * * *', async () => {
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

  console.log('[Worker] Started - polling every minute');
}

async function processWallets(): Promise<void> {
  const wallets = await query('SELECT * FROM wallets WHERE is_active = true');
  if (wallets.rows.length === 0) return;

  const trackedAddresses = new Set(wallets.rows.map(w => w.address.toLowerCase()));

  for (const wallet of wallets.rows) {
    try {
      await processWallet(wallet, trackedAddresses);
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
  // Skip if already exists
  const existing = await query('SELECT 1 FROM transactions WHERE signature = $1', [tx.signature]);
  if (existing.rows.length > 0) return;

  const classification = classifyTransaction(tx, walletAddress, trackedAddresses);
  if (!classification) return;

  const { type, primaryTransfer, counterpartyTransfer } = classification;
  if (!primaryTransfer) return;

  // Get token info
  const tokenInfo = await getTokenInfo(primaryTransfer.mint);
  
  // Spam filtering
  let usdValue: number | null = null;
  const price = await getTokenPrice(primaryTransfer.mint);
  if (price && tokenInfo) {
    const realAmount = primaryTransfer.amount / Math.pow(10, tokenInfo.decimals);
    usdValue = realAmount * price;
  }

  const isSpam = shouldFilterAsSpam(tokenInfo, usdValue);
  if (isSpam) {
    console.log(`[Worker] Skipping spam tx: ${tx.signature}`);
  }

  // Get counterparty info
  let counterpartySymbol = null;
  if (counterpartyTransfer) {
    const cpInfo = await getTokenInfo(counterpartyTransfer.mint);
    counterpartySymbol = cpInfo?.symbol || null;
  }

  await query(
    `INSERT INTO transactions 
     (signature, wallet_id, type, token_mint, token_symbol, token_name, amount, usd_value, 
      counterparty_mint, counterparty_symbol, counterparty_amount, from_address, to_address, 
      timestamp, slot, is_spam, raw_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
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
}

function shouldFilterAsSpam(tokenInfo: any, usdValue: number | null): boolean {
  // Skip if no Jupiter entry and tiny value
  if (!tokenInfo) return true;
  
  // Skip if Jupiter score < 20
  if (tokenInfo.jupiterScore < 20) return true;
  
  // Skip if USD value < $0.01
  if (usdValue !== null && usdValue < 0.01) return true;
  
  return false;
}
