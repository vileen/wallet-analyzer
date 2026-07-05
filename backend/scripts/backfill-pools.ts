import { query } from '../src/db';
import { resolveToken } from '../src/tokenResolver';

async function backfill() {
  const rows = await query("SELECT mint FROM tokens WHERE pool_address IS NULL AND symbol != 'UNKNOWN'");
  console.log('Backfilling', rows.rows.length, 'tokens...');
  for (const row of rows.rows) {
    try {
      await resolveToken(row.mint);
      process.stdout.write('.');
    } catch (e) {
      process.stdout.write('x');
    }
  }
  console.log('\nDone');
  process.exit(0);
}
backfill();
