import { query } from '../src/db';
import { findLBUZPool } from '../src/tokenResolver';

async function backfillPools() {
  console.log('Fetching tokens with missing or bonding-curve pool addresses...');

  // Get tokens that have no pool_address or might have a bonding curve
  const result = await query(
    `SELECT mint, pool_address FROM tokens 
     WHERE pool_address IS NULL 
        OR pool_address LIKE '%pump' 
        OR pool_address IN (SELECT mint FROM tokens WHERE symbol LIKE '%PUMP%' OR name LIKE '%Pump%')
     LIMIT 100`
  );

  console.log(`Found ${result.rows.length} tokens to check`);

  let updated = 0;
  for (const row of result.rows) {
    const mint = row.mint;
    console.log(`Checking ${mint}...`);

    const pool = await findLBUZPool(mint);
    if (pool) {
      await query('UPDATE tokens SET pool_address = $1 WHERE mint = $2', [pool, mint]);
      console.log(`  -> Updated to ${pool}`);
      updated++;
    } else {
      console.log(`  -> No LBUZ pool found`);
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nUpdated ${updated} tokens`);
  process.exit(0);
}

backfillPools().catch(err => {
  console.error(err);
  process.exit(1);
});
