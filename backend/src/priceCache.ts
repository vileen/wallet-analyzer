import { query } from './db';

const PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface PriceCacheEntry {
  mint: string;
  price_usd: number | null;
  updated_at: Date;
}

export async function getCachedPrice(mint: string): Promise<number | null> {
  const result = await query<PriceCacheEntry>(
    'SELECT price_usd, updated_at FROM price_cache WHERE mint = $1',
    [mint]
  );
  if (result.rows.length === 0) return null;

  const entry = result.rows[0];
  const age = Date.now() - new Date(entry.updated_at).getTime();
  if (age > PRICE_CACHE_TTL_MS) return null;

  return entry.price_usd;
}

export async function setCachedPrice(mint: string, price_usd: number | null): Promise<void> {
  await query(
    `INSERT INTO price_cache (mint, price_usd, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (mint) DO UPDATE SET
       price_usd = EXCLUDED.price_usd,
       updated_at = NOW()`,
    [mint, price_usd]
  );
}

export async function getCachedPrices(mints: string[]): Promise<Record<string, number | null>> {
  if (mints.length === 0) return {};

  const result = await query<PriceCacheEntry>(
    `SELECT mint, price_usd, updated_at FROM price_cache 
     WHERE mint = ANY($1::text[])`,
    [mints]
  );

  const now = Date.now();
  const prices: Record<string, number | null> = {};

  for (const row of result.rows) {
    const age = now - new Date(row.updated_at).getTime();
    prices[row.mint] = age > PRICE_CACHE_TTL_MS ? null : row.price_usd;
  }

  // Mark missing mints as needing refresh
  for (const mint of mints) {
    if (!(mint in prices)) prices[mint] = null;
  }

  return prices;
}

export async function setCachedPrices(prices: Record<string, number | null>): Promise<void> {
  for (const [mint, price] of Object.entries(prices)) {
    await setCachedPrice(mint, price);
  }
}

export async function invalidatePriceCache(mint?: string): Promise<void> {
  if (mint) {
    await query('DELETE FROM price_cache WHERE mint = $1', [mint]);
  } else {
    await query('DELETE FROM price_cache');
  }
}
