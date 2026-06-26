import { query } from './db';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_BASE = 'https://api.helius.xyz/v0';

// Hardcoded known tokens - covers 99% of transactions
const KNOWN_TOKENS: Record<string, { symbol: string; name: string; decimals: number }> = {
  'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Wrapped SOL', decimals: 9 },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB265': { symbol: 'BONK', name: 'Bonk', decimals: 5 },
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU': { symbol: 'SAMO', name: 'Samoyedcoin', decimals: 9 },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', name: 'Jupiter', decimals: 6 },
  'J1toso1uCk3RLmjorhTtrVwY9WRnXGDMBPkRyotu5Awa': { symbol: 'JitoSOL', name: 'Jito Staked SOL', decimals: 9 },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': { symbol: 'mSOL', name: 'Marinade Staked SOL', decimals: 9 },
  'bSo13r4TkiE4KumL71LsHTPpLJeuQMWg8x6XUgVuNWB': { symbol: 'bSOL', name: 'Blaze Staked SOL', decimals: 9 },
  'HZ1JovNiVvGrGNiiYvEoz7g5p6A6fJQ6sR6JrHtYQ3Tq': { symbol: 'PYTH', name: 'Pyth Network', decimals: 6 },
  'orcaEKTdK7LKz57VaAYr9G2w9Bz1kKkMkW3L5Qp2z3H': { symbol: 'ORCA', name: 'Orca', decimals: 6 },
  '7i5KKf17k8XSdzYpME2V6fXqkjr5jmSZXD9Q3PG8oRs4': { symbol: 'RAY', name: 'Raydium', decimals: 6 },
};

interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
}

export async function resolveToken(mint: string): Promise<TokenInfo | null> {
  if (!mint) return null;

  // 1. Check hardcoded known tokens
  if (KNOWN_TOKENS[mint]) {
    return KNOWN_TOKENS[mint];
  }

  // 2. Check database cache (but not if it's UNKNOWN or PUMP - those are likely bad data)
  const cached = await query('SELECT symbol, name, decimals FROM tokens WHERE mint = $1', [mint]);
  if (cached.rows.length > 0 && cached.rows[0].symbol && !['UNKNOWN', 'PUMP'].includes(cached.rows[0].symbol)) {
    return {
      symbol: cached.rows[0].symbol,
      name: cached.rows[0].name,
      decimals: cached.rows[0].decimals || 0,
    };
  }

  // 3. Try DexScreener for token metadata (most reliable for Solana)
  const dexInfo = await fetchDexScreenerTokenInfo(mint);
  if (dexInfo) {
    await cacheToken(mint, dexInfo.symbol, dexInfo.name, dexInfo.decimals);
    return dexInfo;
  }

  // 4. Try Helius API
  const heliusInfo = await fetchHeliusTokenInfo(mint);
  if (heliusInfo) {
    await cacheToken(mint, heliusInfo.symbol, heliusInfo.name, heliusInfo.decimals);
    return heliusInfo;
  }

  // 5. Try on-chain Metaplex metadata
  const onChainInfo = await fetchOnChainMetadata(mint);
  if (onChainInfo) {
    await cacheToken(mint, onChainInfo.symbol, onChainInfo.name, onChainInfo.decimals);
    return onChainInfo;
  }

  // 6. Fallback - mark as unknown, don't guess
  await cacheToken(mint, 'UNKNOWN', 'Unknown Token', 0);
  return { symbol: 'UNKNOWN', name: 'Unknown Token', decimals: 0 };
}

async function cacheToken(mint: string, symbol: string, name: string, decimals: number): Promise<void> {
  await query(
    `INSERT INTO tokens (mint, symbol, name, decimals, is_verified, jupiter_score, is_spam, last_updated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (mint) DO UPDATE SET
       symbol = EXCLUDED.symbol,
       name = EXCLUDED.name,
       decimals = EXCLUDED.decimals,
       last_updated = NOW()`,
    [mint, symbol, name, decimals, false, 0, false]
  );
}

async function fetchDexScreenerTokenInfo(mint: string): Promise<TokenInfo | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!response.ok) return null;

    const data = await response.json() as {
      pairs?: Array<{ baseToken: { name: string; symbol: string } }>
    };
    if (!data.pairs || data.pairs.length === 0) return null;

    const token = data.pairs[0].baseToken;
    if (!token.symbol || !token.name) return null;

    return {
      symbol: token.symbol,
      name: token.name,
      decimals: 0, // DexScreener doesn't provide decimals
    };
  } catch (error) {
    return null;
  }
}

async function fetchHeliusTokenInfo(mint: string): Promise<TokenInfo | null> {
  if (!HELIUS_API_KEY) return null;

  try {
    const response = await fetch(
      `${HELIUS_BASE}/token-metadata?api-key=${HELIUS_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mintAccounts: [mint] }),
      }
    );

    if (!response.ok) return null;

    const data = await response.json() as any[];
    if (!data || data.length === 0) return null;

    const token = data[0];
    return {
      symbol: token.symbol || 'UNKNOWN',
      name: token.name || 'Unknown Token',
      decimals: token.decimals || 0,
    };
  } catch (error) {
    console.error(`[TokenResolver] Helius failed for ${mint}:`, error);
    return null;
  }
}

async function fetchOnChainMetadata(mint: string): Promise<TokenInfo | null> {
  try {
    const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
    const METAPLEX_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

    const response = await fetch(SOLANA_RPC, {
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
              { dataSize: 679 },
              { memcmp: { offset: 33, bytes: mint } },
            ],
            encoding: 'base64',
          },
        ],
      }),
    });

    const data = await response.json() as any;
    if (!data.result || data.result.length === 0) return null;

    const buffer = Buffer.from(data.result[0].account.data[0], 'base64');
    let offset = 65;

    const nameLen = buffer.readUInt32LE(offset);
    offset += 4;
    const name = buffer.slice(offset, offset + nameLen).toString('utf8').replace(/\x00/g, '').trim();
    offset += nameLen;

    const symbolLen = buffer.readUInt32LE(offset);
    offset += 4;
    const symbol = buffer.slice(offset, offset + symbolLen).toString('utf8').replace(/\x00/g, '').trim();

    if (name && symbol) {
      return { name, symbol, decimals: 0 };
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Bulk update all existing transactions with resolved tokens
export async function bulkUpdateTransactionTokens(): Promise<number> {
  const unknowns = await query(
    "SELECT DISTINCT token_mint FROM transactions WHERE token_symbol IN ('Unknown', 'PUMP', 'UNKNOWN') OR token_symbol IS NULL"
  );

  let updated = 0;
  for (const row of unknowns.rows) {
    const info = await resolveToken(row.token_mint);
    if (info && info.symbol !== 'UNKNOWN') {
      await query(
        'UPDATE transactions SET token_symbol = $1, token_name = $2 WHERE token_mint = $3',
        [info.symbol, info.name, row.token_mint]
      );
      updated += await query('SELECT COUNT(*) as c FROM transactions WHERE token_mint = $1', [row.token_mint])
        .then(r => parseInt(r.rows[0].c));
    }
  }

  return updated;
}
