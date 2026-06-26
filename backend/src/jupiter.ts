import { query } from './db';

interface JupiterTokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  tags: string[];
  extensions?: {
    coingeckoId?: string;
  };
}

export async function getTokenInfo(mint: string): Promise<{
  symbol: string;
  name: string;
  decimals: number;
  isVerified: boolean;
  jupiterScore: number;
  isSpam: boolean;
} | null> {
  // Check cache first
  const cached = await query('SELECT * FROM tokens WHERE mint = $1', [mint]);
  if (cached.rows.length > 0) {
    const row = cached.rows[0];
    // Refresh if older than 1 hour
    const age = Date.now() - new Date(row.last_updated).getTime();
    if (age < 3600000) {
      return {
        symbol: row.symbol,
        name: row.name,
        decimals: row.decimals,
        isVerified: row.is_verified,
        jupiterScore: row.jupiter_score,
        isSpam: row.is_spam,
      };
    }
  }

  try {
    const response = await fetch(`https://tokens.jup.ag/tokens/v1/token/${mint}`);
    if (!response.ok) {
      if (response.status === 404) {
        // Token not in Jupiter = likely unverified/shitcoin
        await cacheToken(mint, '', 'Unknown', 0, false, 0, true);
        return { symbol: '', name: 'Unknown', decimals: 0, isVerified: false, jupiterScore: 0, isSpam: true };
      }
      throw new Error(`Jupiter API error: ${response.status}`);
    }

    const data = await response.json() as JupiterTokenInfo;
    
    const isVerified = data.tags?.includes('verified') || data.tags?.includes('community') || false;
    const hasCoingecko = !!data.extensions?.coingeckoId;
    
    // Simple scoring: verified = 50, coingecko = +30, has name/symbol = +20
    let score = 0;
    if (isVerified) score += 50;
    if (hasCoingecko) score += 30;
    if (data.name && data.symbol) score += 20;
    
    const isSpam = score < 20;

    await cacheToken(mint, data.symbol, data.name, data.decimals, isVerified, score, isSpam);

    return {
      symbol: data.symbol,
      name: data.name,
      decimals: data.decimals,
      isVerified,
      jupiterScore: score,
      isSpam,
    };
  } catch (error) {
    console.error(`Failed to fetch Jupiter info for ${mint}:`, error);
    return null;
  }
}

async function cacheToken(
  mint: string, 
  symbol: string, 
  name: string, 
  decimals: number,
  isVerified: boolean,
  jupiterScore: number,
  isSpam: boolean
): Promise<void> {
  await query(
    `INSERT INTO tokens (mint, symbol, name, decimals, is_verified, jupiter_score, is_spam, last_updated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (mint) DO UPDATE SET
       symbol = EXCLUDED.symbol,
       name = EXCLUDED.name,
       decimals = EXCLUDED.decimals,
       is_verified = EXCLUDED.is_verified,
       jupiter_score = EXCLUDED.jupiter_score,
       is_spam = EXCLUDED.is_spam,
       last_updated = NOW()`,
    [mint, symbol, name, decimals, isVerified, jupiterScore, isSpam]
  );
}

export async function getTokenPrice(mint: string): Promise<number | null> {
  try {
    const response = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
    if (!response.ok) return null;
    const data = await response.json() as { data?: Record<string, { price?: string | number }> };
    return Number(data.data?.[mint]?.price) || null;
  } catch {
    return null;
  }
}
