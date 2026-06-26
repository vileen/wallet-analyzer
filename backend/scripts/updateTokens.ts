import { query } from '../src/db';
import { resolveToken, bulkUpdateTransactionTokens } from '../src/tokenResolver';

async function main() {
  console.log('Updating all transaction tokens...');
  const updated = await bulkUpdateTransactionTokens();
  console.log(`Updated ${updated} transactions with proper token info`);
  process.exit(0);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
