import { query } from '../src/db';
import { getTokenPrice, calculateUsdValue } from '../src/priceResolver';

async function backfillUsdValues() {
  console.log('Fetching transactions without USD values...');

  // Get transactions without USD values, with token decimals
  const result = await query(`
    SELECT t.id, t.token_mint, t.amount,
           COALESCE(tok.decimals, 0) as decimals
    FROM transactions t
    LEFT JOIN tokens tok ON t.token_mint = tok.mint
    WHERE t.usd_value IS NULL
    ORDER BY t.timestamp DESC
  `);

  console.log(`Found ${result.rows.length} transactions to update`);

  let updated = 0;
  let skipped = 0;
  const priceCache: Map<string, number | null> = new Map();

  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows[i];
    const mint = row.token_mint;

    // Progress every 50
    if (i % 50 === 0) {
      console.log(`Progress: ${i}/${result.rows.length} (updated: ${updated}, skipped: ${skipped})`);
    }

    // Get cached price or fetch new one
    let price = priceCache.get(mint);
    if (price === undefined) {
      price = await getTokenPrice(mint);
      priceCache.set(mint, price);
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 150));
    }

    if (price !== null) {
      const decimals = parseInt(row.decimals) || 0;
      const amount = parseFloat(row.amount);
      const usdValue = calculateUsdValue(amount, decimals, price);

      await query('UPDATE transactions SET usd_value = $1 WHERE id = $2', [usdValue, row.id]);
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`\nDone! Updated: ${updated}, Skipped (no price): ${skipped}`);
  process.exit(0);
}

backfillUsdValues().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
