import { query } from '../src/db';

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

interface TokenMetadata {
  name: string;
  symbol: string;
}

async function getTokenMetadata(mint: string): Promise<TokenMetadata | null> {
  try {
    // Get the metadata account PDA using Metaplex program
    const METAPLEX_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

    // Compute PDA via RPC call
    const pdaResponse = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getProgramAccounts',
        params: [
          METAPLEX_PROGRAM,
          {
            filters: [
              { dataSize: 679 }, // Metadata account size
              { memcmp: { offset: 33, bytes: mint } }, // mint address in metadata
            ],
            encoding: 'base64',
          },
        ],
      }),
    });

    const pdaData = await pdaResponse.json();
    if (!pdaData.result || pdaData.result.length === 0) return null;

    const accountData = pdaData.result[0].account.data[0];
    const buffer = Buffer.from(accountData, 'base64');

    // Parse Metaplex metadata structure
    // Skip: key (1) + update authority (32) + mint (32) = 65 bytes
    let offset = 65;

    // Name string (4 bytes length + data)
    const nameLen = buffer.readUInt32LE(offset);
    offset += 4;
    const name = buffer.slice(offset, offset + nameLen).toString('utf8').replace(/\x00/g, '').trim();
    offset += nameLen;

    // Symbol string
    const symbolLen = buffer.readUInt32LE(offset);
    offset += 4;
    const symbol = buffer.slice(offset, offset + symbolLen).toString('utf8').replace(/\x00/g, '').trim();
    offset += symbolLen;

    // URI string (skip)
    const uriLen = buffer.readUInt32LE(offset);
    offset += 4 + uriLen;

    // Skip: seller fee basis points (2), creators (1 + N*34), primary sale (1), mutable (1)
    // Skip: token standard (1 + optional 1), collection (1 + 33), uses (1 + 17)
    // We have enough data

    if (name && symbol) {
      return { name, symbol };
    }
    return null;
  } catch (e: any) {
    console.error(`Metadata fetch failed for ${mint}:`, e.message);
    return null;
  }
}

async function resolveOnChainTokens() {
  const unknowns = await query(
    "SELECT DISTINCT token_mint FROM transactions WHERE token_symbol = 'Unknown'"
  );

  console.log(`Found ${unknowns.rows.length} unknown tokens`);
  let resolved = 0;

  for (const row of unknowns.rows) {
    const mint = row.token_mint;
    const metadata = await getTokenMetadata(mint);

    if (metadata) {
      await query(
        'UPDATE transactions SET token_symbol = $1, token_name = $2 WHERE token_mint = $3',
        [metadata.symbol, metadata.name, mint]
      );

      await query(
        `INSERT INTO tokens (mint, symbol, name, decimals, last_updated)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (mint) DO UPDATE SET
           symbol = EXCLUDED.symbol,
           name = EXCLUDED.name,
           last_updated = NOW()`,
        [mint, metadata.symbol, metadata.name, 0]
      );

      resolved++;
      console.log(`Resolved: ${metadata.symbol} - ${metadata.name}`);
    } else {
      // Cache as unresolvable so we don't try again
      await query(
        `INSERT INTO tokens (mint, symbol, name, last_updated)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (mint) DO NOTHING`,
        [mint, 'UNKNOWN', 'Unknown']
      );
    }

    // Rate limit: 100ms between requests to avoid RPC rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`Resolved ${resolved} / ${unknowns.rows.length} unknown tokens`);
  process.exit(0);
}

resolveOnChainTokens().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
