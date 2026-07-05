import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Known liquidity program IDs (DLMM, AMM, Whirlpool, PumpSwap)
const LIQUIDITY_PROGRAMS = [
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', // Meteora DLMM
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca Whirlpool
  'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', // Meteora DLMM v2
];

async function main() {
  // 1. Update check constraint to allow new types
  console.log('Updating check constraint...');
  await pool.query(`
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
    ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
      CHECK (type::text = ANY (ARRAY[
        'buy'::character varying,
        'sell'::character varying,
        'transfer_in'::character varying,
        'transfer_out'::character varying,
        'internal_transfer'::character varying,
        'liquidity_add'::character varying,
        'liquidity_remove'::character varying
      ]::text[]));
  `);
  console.log('✅ Constraint updated');

  // 2. Find all transactions that involve liquidity programs
  const { rows } = await pool.query(`
    SELECT id, signature, type, from_address, to_address, wallet_id, raw_json
    FROM transactions
    WHERE raw_json->'instructions' @> ANY(
      SELECT jsonb_build_array(jsonb_build_object('programId', p))
      FROM unnest($1::text[]) AS p
    )
    ORDER BY id
  `, [LIQUIDITY_PROGRAMS]);

  console.log(`Found ${rows.length} transactions with liquidity program interactions`);

  let updated = 0;
  const updates: { id: number; oldType: string; newType: string; signature: string }[] = [];

  for (const row of rows) {
    const { id, signature, type, from_address, to_address, wallet_id, raw_json } = row;

    // Get wallet address
    const walletRes = await pool.query('SELECT address FROM wallets WHERE id = $1', [wallet_id]);
    const walletAddress = walletRes.rows[0]?.address?.toLowerCase() || '';

    const fromLower = (from_address || '').toLowerCase();
    const toLower = (to_address || '').toLowerCase();

    let newType: string | null = null;

    // Heuristic: if wallet is sender (transfer_out) → liquidity_add
    // if wallet is receiver (buy/transfer_in) → liquidity_remove
    if (fromLower === walletAddress) {
      newType = 'liquidity_add';
    } else if (toLower === walletAddress) {
      newType = 'liquidity_remove';
    }

    if (newType && newType !== type) {
      await pool.query('UPDATE transactions SET type = $1 WHERE id = $2', [newType, id]);
      updates.push({ id, oldType: type, newType, signature });
      updated++;
    }
  }

  console.log(`\n✅ Updated ${updated} transactions:`);
  for (const u of updates) {
    console.log(`  ${u.signature.slice(0, 20)}... ${u.oldType} → ${u.newType}`);
  }

  // 3. Show summary of all liquidity transactions now
  const { rows: summary } = await pool.query(`
    SELECT type, COUNT(*) FROM transactions
    WHERE type IN ('liquidity_add', 'liquidity_remove')
    GROUP BY type
  `);
  console.log('\nSummary:');
  for (const s of summary) {
    console.log(`  ${s.type}: ${s.count}`);
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
