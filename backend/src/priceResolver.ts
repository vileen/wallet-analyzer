import { query } from './db';

interface PriceCache {
  price: number;
  timestamp: number;
}

const priceCache: Map<string, PriceCache> = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Hardcoded prices for stablecoins
const STABLECOINS: Record<string, number> = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 1.0, // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 1.0, // USDT
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB': 1.0, // USD1
};

async function fetchDexScreenerPrice(mint: string): Promise<number | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!response.ok) return null;

    const data = await response.json() as {
      pairs?: Array<{ priceUsd: string; liquidity?: { usd: number }; volume?: { h24: number } }>
    };
    if (!data.pairs || data.pairs.length === 0) return null;

    // Filter for pairs with meaningful liquidity (> $5k) and volume (> $1k)
    const validPairs = data.pairs.filter(
      p => (p.liquidity?.usd || 0) > 5000 && (p.volume?.h24 || 0) > 1000
    );

    if (validPairs.length === 0) {
      // Fallback: use highest liquidity pair even if below threshold
      const sorted = [...data.pairs].sort((a, b) =>
        (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
      );
      const price = parseFloat(sorted[0].priceUsd);
      return isNaN(price) ? null : price;
    }

    // Use median price from valid pairs to avoid outliers
    const prices = validPairs.map(p => parseFloat(p.priceUsd)).filter(p => !isNaN(p) && p > 0);
    if (prices.length === 0) return null;

    prices.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0
      ? (prices[mid - 1] + prices[mid]) / 2
      : prices[mid];

    return median;
  } catch (error) {
    console.error(`[PriceResolver] DexScreener failed for ${mint}:`, error);
    return null;
  }
}

async function fetchCoinGeckoPrice(mint: string): Promise<number | null> {
  try {
    // CoinGecko uses Solana platform with contract addresses
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${mint}&vs_currencies=usd`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!response.ok) return null;

    const data = await response.json() as Record<string, { usd: number }>;
    const tokenData = data[mint.toLowerCase()];
    return tokenData?.usd || null;
  } catch (error) {
    console.error(`[PriceResolver] CoinGecko failed for ${mint}:`, error);
    return null;
  }
}

export async function getTokenPrice(mint: string): Promise<number | null> {
  if (!mint) return null;

  // Check stablecoins first
  if (STABLECOINS[mint]) {
    return STABLECOINS[mint];
  }

  // Check cache
  const cached = priceCache.get(mint);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }

  // Try DexScreener first (more reliable for Solana)
  let price = await fetchDexScreenerPrice(mint);

  // Fallback to CoinGecko
  if (price === null) {
    price = await fetchCoinGeckoPrice(mint);
  }

  // Cache the result (even if null, to avoid hammering APIs)
  if (price !== null) {
    priceCache.set(mint, { price, timestamp: Date.now() });
  }

  return price;
}

// Calculate USD value for a transaction amount
// Note: amount is already in human-readable form from Helius
export function calculateUsdValue(amount: number, _decimals: number, price: number): number {
  return amount * price;
}

// Bulk update USD values for all transactions
export async function backfillUsdValues(): Promise<number> {
  // Get all transactions that need USD values
  const result = await query(`
    SELECT t.id, t.token_mint, t.amount, COALESCE(tok.decimals, 0) as decimals
    FROM transactions t
    LEFT JOIN tokens tok ON t.token_mint = tok.mint
    WHERE t.usd_value IS NULL AND t.token_mint IS NOT NULL
    LIMIT 500
  `);

  let updated = 0;
  for (const row of result.rows) {
    const price = await getTokenPrice(row.token_mint);
    if (price !== null) {
      const usdValue = calculateUsdValue(parseFloat(row.amount), row.decimals || 0, price);
      await query('UPDATE transactions SET usd_value = $1 WHERE id = $2', [usdValue, row.id]);
      updated++;
    }
  }

  return updated;
}
