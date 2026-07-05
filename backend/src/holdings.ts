import { query } from './db';
import { resolveToken } from './tokenResolver';

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

interface TokenBalance {
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number;
}

interface Holding {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: number;
  price_usd: number | null;
  value_usd: number | null;
  pool_address?: string;
}

export async function fetchWalletHoldings(walletAddress: string): Promise<Holding[]> {
  // 1. Get SOL balance
  const solBalance = await fetchSolBalance(walletAddress);

  // 2. Get token accounts
  const tokenBalances = await fetchTokenAccounts(walletAddress);

  // 3. Combine SOL + tokens, filter dust
  const allBalances: TokenBalance[] = [
    { mint: 'So11111111111111111111111111111111111111112', amount: String(solBalance * 1e9), decimals: 9, uiAmount: solBalance },
    ...tokenBalances.filter(t => t.uiAmount > 0),
  ];

  // 4. Resolve token metadata and prices in parallel
  const holdings: Holding[] = await Promise.all(
    allBalances.map(async (bal) => {
      const tokenInfo = await resolveToken(bal.mint);
      const price = await fetchTokenPrice(bal.mint);
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

  // 5. Filter out very small dust (< $0.01) and sort by value
  return holdings
    .filter(h => (h.value_usd ?? 0) >= 0.01 || h.amount > 0)
    .sort((a, b) => (b.value_usd ?? 0) - (a.value_usd ?? 0));
}

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
        params: [
          address,
          { programId },
          { encoding: 'jsonParsed' },
        ],
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

async function fetchTokenPrice(mint: string): Promise<number | null> {
  const JUPITER_API_KEY = 'jup_e8eaae5f2845c5e6ad1182dc8dc9dd24d07403ebb821199cd0156fe157599d85';

  // 1. Try DexScreener - filter for pairs where mint is the BASE token
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (response.ok) {
      const data = await response.json() as any;
      const pairs = data.pairs || [];
      // Only use pairs where the requested mint is the base token
      const basePairs = pairs.filter((p: any) => 
        p.baseToken?.address?.toLowerCase() === mint.toLowerCase()
      );
      if (basePairs.length > 0) {
        // Sort by 24h volume descending, pick best
        const best = basePairs.sort((a: any, b: any) => 
          (b.volume?.h24 || 0) - (a.volume?.h24 || 0)
        )[0];
        const price = parseFloat(best.priceUsd);
        if (!isNaN(price) && price > 0) return price;
      }
    }
  } catch {
    // ignore
  }

  // 2. Fallback to Jupiter Price API v3 (with API key for higher rate limits)
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
  } catch {
    // ignore
  }

  return null;
}
