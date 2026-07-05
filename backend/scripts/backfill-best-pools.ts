import { query } from '../src/db';
import { findBestPool } from '../src/tokenResolver';

async function main() {
  const rows = await query('SELECT mint, symbol, pool_address FROM tokens WHERE pool_address IS NOT NULL');
  console.log(`Checking ${rows.rows.length} tokens with pool addresses...\n`);

  let updated = 0;
  for (const row of rows.rows) {
    const best = await findBestPool(row.mint);
    if (best && best !== row.pool_address) {
      console.log(`${row.symbol || row.mint.slice(0, 8)}: ${row.pool_address} → ${best}`);
      await query('UPDATE tokens SET pool_address = $1 WHERE mint = $2', [best, row.mint]);
      updated++;
    }
  }

  console.log(`\nUpdated ${updated} tokens.`);
}

main().catch(console.error);
