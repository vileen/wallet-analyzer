import { query } from './db';
import { resolveToken } from './tokenResolver';
import { getCachedPrice, setCachedPrice } from './priceCache';

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

interface TokenBalance {
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number;
}

export interface HoldingItem {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: number;
  price_usd: number | null;
  value_usd: number | null;
  pool_address?: string;
}

export interface HoldingSnapshot {
  id: number;
  wallet_id: number;
  snapshot_at: string;
  total_value_usd: number | null;
  sol_balance: number | null;
  items: HoldingItem[];
}

export interface HoldingChange {
  mint: string;
  symbol: string;
  change_amount: number;
  change_value_usd: number | null;
  direction: 'inflow' | 'outflow' | 'unchanged' | 'new' | 'removed';
  previous_amount: number | null;
  current_amount: number;
}

// ── Core: fetch from RPC ───────────────────────────────────────────

export async function fetchWalletHoldings(walletAddress: string): Promise<HoldingItem[]> {
  const solBalance = await fetchSolBalance(walletAddress);
  const tokenBalances = await fetchTokenAccounts(walletAddress);

  const allBalances: TokenBalance[] = [
    { mint: 'So11111111111111111111111111111111111111112', amount: String(solBalance * 1e9), decimals: 9, uiAmount: solBalance },
    ...tokenBalances.filter(t => t.uiAmount > 0),
  ];

  // Batch fetch cached prices first
  const mints = allBalances.map(b => b.mint);
  const cachedPrices: Record<string, number | null> = {};
  for (const mint of mints) {
    cachedPrices[mint] = await getCachedPrice(mint);
  }

  const holdings: HoldingItem[] = await Promise.all(
    allBalances.map(async (bal) => {
      const tokenInfo = await resolveToken(bal.mint);
      let price = cachedPrices[bal.mint];

      // Fetch fresh price if cache miss or expired
      if (price === null) {
        price = await fetchTokenPrice(bal.mint);
        await setCachedPrice(bal.mint, price);
      }

      const valueUsd = price !== null ? bal.uiAmount * price : null;

      return {
        mint: bal.mint,
        symbol: tokenInfo?.symbol || 'Unknown',
        name: tokenInfo?.name || 'Unknown Token',
        decimals: tokenInfo?.decimals || bal.decimals,
        amount: bal.uiAmount,
        price_usd: price,
        value_usd: valueUsd,
        pool_address: (tokenInfo as any)?.pool_address,
      };
    })
  );

  return holdings
    .filter(h => (h.value_usd ?? 0) >= 0.01 || h.amount > 0)
    .sort((a, b) => (b.value_usd ?? 0) - (a.value_usd ?? 0));
}

// ── DB: save snapshot ─────────────────────────────────────────────

export async function saveHoldingsSnapshot(
  walletId: number,
  walletAddress: string
): Promise<HoldingSnapshot> {
  const holdings = await fetchWalletHoldings(walletAddress);
  const solItem = holdings.find(h => h.mint === 'So11111111111111111111111111111111111111112');
  const totalValue = holdings.reduce((sum, h) => sum + (h.value_usd ?? 0), 0);

  const snapshotResult = await query<{ id: number }>(
    `INSERT INTO holdings_snapshots (wallet_id, snapshot_at, total_value_usd, sol_balance)
     VALUES ($1, NOW(), $2, $3)
     RETURNING id`,
    [walletId, totalValue, solItem?.amount ?? 0]
  );
  const snapshotId = snapshotResult.rows[0].id;

  for (const h of holdings) {
    await query(
      `INSERT INTO holdings_items (snapshot_id, mint, symbol, name, decimals, amount, price_usd, value_usd, pool_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [snapshotId, h.mint, h.symbol, h.name, h.decimals, h.amount, h.price_usd, h.value_usd, h.pool_address || null]
    );
  }

  return {
    id: snapshotId,
    wallet_id: walletId,
    snapshot_at: new Date().toISOString(),
    total_value_usd: totalValue,
    sol_balance: solItem?.amount ?? 0,
    items: holdings,
  };
}

// ── DB: get latest snapshot ───────────────────────────────────────

export async function getLatestSnapshot(walletId: number): Promise<HoldingSnapshot | null> {
  const snapshotResult = await query(
    `SELECT id, wallet_id, snapshot_at, total_value_usd, sol_balance
     FROM holdings_snapshots
     WHERE wallet_id = $1
     ORDER BY snapshot_at DESC
     LIMIT 1`,
    [walletId]
  );
  if (snapshotResult.rows.length === 0) return null;

  const snapshot = snapshotResult.rows[0];
  const itemsResult = await query(
    `SELECT mint, symbol, name, decimals, amount, price_usd, value_usd, pool_address
     FROM holdings_items
     WHERE snapshot_id = $1
     ORDER BY value_usd DESC NULLS LAST`,
    [snapshot.id]
  );

  return {
    ...snapshot,
    items: itemsResult.rows,
  };
}

// ── DB: get previous snapshot (for comparison) ─────────────────────

export async function getPreviousSnapshot(walletId: number, currentId: number): Promise<HoldingSnapshot | null> {
  const snapshotResult = await query(
    `SELECT id, wallet_id, snapshot_at, total_value_usd, sol_balance
     FROM holdings_snapshots
     WHERE wallet_id = $1 AND id < $2
     ORDER BY snapshot_at DESC
     LIMIT 1`,
    [walletId, currentId]
  );
  if (snapshotResult.rows.length === 0) return null;

  const snapshot = snapshotResult.rows[0];
  const itemsResult = await query(
    `SELECT mint, symbol, name, decimals, amount, price_usd, value_usd, pool_address
     FROM holdings_items
     WHERE snapshot_id = $1
     ORDER BY value_usd DESC NULLS LAST`,
    [snapshot.id]
  );

  return {
    ...snapshot,
    items: itemsResult.rows,
  };
}

// ── Compute changes between two snapshots ───────────────────────────

export function computeHoldingChanges(
  current: HoldingItem[],
  previous: HoldingItem[]
): HoldingChange[] {
  const prevMap = new Map(previous.map(p => [p.mint, p]));
  const currMap = new Map(current.map(c => [c.mint, c]));

  const allMints = new Set([...prevMap.keys(), ...currMap.keys()]);
  const changes: HoldingChange[] = [];

  for (const mint of allMints) {
    const prev = prevMap.get(mint);
    const curr = currMap.get(mint);

    if (!prev && curr) {
      changes.push({
        mint,
        symbol: curr.symbol,
        change_amount: curr.amount,
        change_value_usd: curr.value_usd,
        direction: 'new',
        previous_amount: null,
        current_amount: curr.amount,
      });
    } else if (prev && !curr) {
      changes.push({
        mint,
        symbol: prev.symbol,
        change_amount: -prev.amount,
        change_value_usd: prev.value_usd !== null ? -prev.value_usd : null,
        direction: 'removed',
        previous_amount: prev.amount,
        current_amount: 0,
      });
    } else if (prev && curr) {
      const diff = curr.amount - prev.amount;
      const valueDiff = curr.value_usd !== null && prev.value_usd !== null
        ? curr.value_usd - prev.value_usd
        : null;

      let direction: HoldingChange['direction'];
      if (Math.abs(diff) < 1e-9) direction = 'unchanged';
      else if (diff > 0) direction = 'inflow';
      else direction = 'outflow';

      changes.push({
        mint,
        symbol: curr.symbol,
        change_amount: diff,
        change_value_usd: valueDiff,
        direction,
        previous_amount: prev.amount,
        current_amount: curr.amount,
      });
    }
  }

  return changes
    .filter(c => c.direction !== 'unchanged')
    .sort((a, b) => {
      const aVal = Math.abs(a.change_value_usd ?? 0);
      const bVal = Math.abs(b.change_value_usd ?? 0);
      return bVal - aVal;
    });
}

// ── Price fetching (with cache) ───────────────────────────────────

async function fetchTokenPrice(mint: string): Promise<number | null> {
  const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '';

  // 1. Try DexScreener
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (response.ok) {
      const data = await response.json() as any;
      const pairs = data.pairs || [];
      const basePairs = pairs.filter((p: any) =>
        p.baseToken?.address?.toLowerCase() === mint.toLowerCase()
      );
      if (basePairs.length > 0) {
        const best = basePairs.sort((a: any, b: any) =>
          (b.volume?.h24 || 0) - (a.volume?.h24 || 0)
        )[0];
        const price = parseFloat(best.priceUsd);
        if (!isNaN(price) && price > 0) return price;
      }
    }
  } catch { /* ignore */ }

  // 2. Fallback to Jupiter
  if (JUPITER_API_KEY) {
    try {
      const response = await fetch(`https://api.jup.ag/price/v3?ids=${mint}`, {
        headers: { 'x-api-key': JUPITER_API_KEY },
      });
      if (response.ok) {
        const data = await response.json() as any;
        const tokenData = data[mint];
        if (tokenData?.usdPrice) {
          return parseFloat(tokenData.usdPrice);
        }
      }
    } catch { /* ignore */ }
  }

  return null;
}

// ── Solana RPC helpers ────────────────────────────────────────────

async function fetchSolBalance(address: string): Promise<number> {
  const response = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address],
    }),
  });

  const data = await response.json() as any;
  return (data.result?.value ?? 0) / 1e9;
}

async function fetchTokenAccounts(address: string): Promise<TokenBalance[]> {
  const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

  const fetchForProgram = async (programId: string): Promise<TokenBalance[]> => {
    const response = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [address, { programId }, { encoding: 'jsonParsed' }],
      }),
    });

    const data = await response.json() as any;
    if (!data.result?.value) return [];

    return data.result.value.map((item: any) => {
      const info = item.account.data.parsed.info;
      return {
        mint: info.mint,
        amount: info.tokenAmount.amount,
        decimals: info.tokenAmount.decimals,
        uiAmount: info.tokenAmount.uiAmount ?? 0,
      };
    });
  };

  const [splTokens, token2022Tokens] = await Promise.all([
    fetchForProgram(SPL_TOKEN_PROGRAM),
    fetchForProgram(TOKEN_2022_PROGRAM),
  ]);

  return [...splTokens, ...token2022Tokens];
}
