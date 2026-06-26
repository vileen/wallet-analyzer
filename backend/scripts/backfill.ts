import { query } from '../src/db';
import { fetchTransactions, classifyTransaction } from '../src/solana';
import { resolveToken } from '../src/tokenResolver';

const JUNE_1_2026 = new Date('2026-06-01T00:00:00Z').getTime();

async function backfillWallet(walletId: number) {
  const wallet = await query('SELECT * FROM wallets WHERE id = $1', [walletId]);
  if (wallet.rows.length === 0) {
    console.error('Wallet not found');
    process.exit(1);
  }

  const w = wallet.rows[0];
  console.log(`Backfilling wallet: ${w.label || w.address}`);

  const trackedWallets = await query('SELECT address FROM wallets');
  const trackedAddresses = new Set(trackedWallets.rows.map((r: any) => r.address.toLowerCase()));

  let beforeSignature: string | undefined;
  let totalProcessed = 0;
  let done = false;

  while (!done) {
    console.log(`Fetching batch${beforeSignature ? ' before ' + beforeSignature.slice(0, 8) + '...' : ''}`);
    const txs = await fetchTransactions(w.address, beforeSignature, 100);
    
    if (txs.length === 0) {
      console.log('No more transactions');
      break;
    }

    // Process oldest first
    const sorted = txs.sort((a, b) => a.timestamp - b.timestamp);

    for (const tx of sorted) {
      // Stop if we've reached June 1st
      if (tx.timestamp < JUNE_1_2026) {
        console.log('Reached June 1st, stopping');
        done = true;
        break;
      }

      // Skip if exists
      const existing = await query('SELECT 1 FROM transactions WHERE signature = $1', [tx.signature]);
      if (existing.rows.length > 0) continue;

      const classification = classifyTransaction(tx, w.address, trackedAddresses);
      if (!classification || !classification.primaryTransfer) continue;

      const { type, primaryTransfer, counterpartyTransfer } = classification;
      const tokenInfo = await resolveToken(primaryTransfer.mint);
      const isSpam = false;

      let counterpartySymbol = null;
      let counterpartyName = null;
      if (counterpartyTransfer) {
        const cpInfo = await resolveToken(counterpartyTransfer.mint);
        counterpartySymbol = cpInfo?.symbol || null;
        counterpartyName = cpInfo?.name || null;
      }

      await query(
        `INSERT INTO transactions 
         (signature, wallet_id, type, token_mint, token_symbol, token_name, amount, usd_value, 
          counterparty_mint, counterparty_symbol, counterparty_amount, from_address, to_address, 
          timestamp, slot, is_spam, raw_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (signature) DO NOTHING`,
        [
          tx.signature, walletId, type,
          primaryTransfer.mint, tokenInfo?.symbol || 'Unknown', tokenInfo?.name || 'Unknown',
          primaryTransfer.amount, null,
          counterpartyTransfer?.mint || null, counterpartySymbol, counterpartyTransfer?.amount || null,
          primaryTransfer.from, primaryTransfer.to,
          new Date(tx.timestamp), tx.slot, isSpam, JSON.stringify(tx.raw),
        ]
      );

      totalProcessed++;
    }

    // Update cursor to oldest signature for next batch
    beforeSignature = sorted[0].signature;
    console.log(`Processed ${totalProcessed} transactions so far`);
    
    // Rate limit - Helius free is 10 req/sec, so we can go fast but let's be nice
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`Backfill complete! Total processed: ${totalProcessed}`);
  process.exit(0);
}

const walletId = parseInt(process.argv[2]);
if (!walletId) {
  console.error('Usage: npx tsx scripts/backfill.ts <wallet_id>');
  process.exit(1);
}

backfillWallet(walletId).catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
