import { query } from './db';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_BASE = 'https://api.helius.xyz/v0';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

export interface ParsedTransfer {
  mint: string;
  from: string;
  to: string;
  amount: number;
  decimals: number;
}

export interface ParsedTransaction {
  signature: string;
  slot: number;
  timestamp: number;
  transfers: ParsedTransfer[];
  raw: any;
}

export async function fetchTransactions(address: string, beforeSignature?: string, limit: number = 50): Promise<ParsedTransaction[]> {
  // Try Helius first (richer data)
  try {
    const txs = await fetchHeliusTransactions(address, beforeSignature, limit);
    return txs;
  } catch (err: any) {
    // If rate limited, fall back to public RPC
    if (err.message?.includes('429')) {
      console.log(`[Solana] Helius rate limited, falling back to public RPC for ${address}`);
      return fetchRpcTransactions(address, beforeSignature, limit);
    }
    throw err;
  }
}

async function fetchHeliusTransactions(address: string, beforeSignature?: string, limit: number = 50): Promise<ParsedTransaction[]> {
  if (!HELIUS_API_KEY) {
    throw new Error('HELIUS_API_KEY not configured');
  }

  const url = new URL(`${HELIUS_BASE}/addresses/${address}/transactions`);
  url.searchParams.set('api-key', HELIUS_API_KEY);
  url.searchParams.set('limit', limit.toString());
  if (beforeSignature) {
    url.searchParams.set('before', beforeSignature);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Helius API error: ${response.status} ${await response.text()}`);
  }

  const txs = await response.json() as any[];
  return txs.map((tx: any) => parseHeliusTransaction(tx));
}

// Fallback: Use public Solana RPC when Helius is rate limited
async function fetchRpcTransactions(address: string, beforeSignature?: string, limit: number = 50): Promise<ParsedTransaction[]> {
  // Step 1: Get signatures for address
  const sigResponse = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [address, { limit, before: beforeSignature }],
    }),
  });

  const sigData = await sigResponse.json() as any;
  if (!sigData.result || sigData.result.length === 0) return [];

  const signatures = sigData.result.map((r: any) => r.signature);

  // Step 2: Fetch parsed transactions in batches of 5
  const txs: ParsedTransaction[] = [];
  for (let i = 0; i < signatures.length; i += 5) {
    const batch = signatures.slice(i, i + 5);
    const batchTxs = await Promise.all(
      batch.map(async (sig: string) => {
        try {
          return await fetchParsedRpcTransaction(sig);
        } catch (e) {
          console.error(`[Solana] Failed to fetch tx ${sig}:`, e);
          return null;
        }
      })
    );
    txs.push(...batchTxs.filter((t): t is ParsedTransaction => t !== null));
  }

  return txs;
}

async function fetchParsedRpcTransaction(signature: string): Promise<ParsedTransaction | null> {
  const response = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
    }),
  });

  const data = await response.json() as any;
  if (!data.result) return null;

  return parseRpcTransaction(signature, data.result);
}

function parseRpcTransaction(signature: string, tx: any): ParsedTransaction {
  const transfers: ParsedTransfer[] = [];
  const meta = tx.meta || {};
  const message = tx.transaction?.message || {};

  // Parse token balances changes
  const preBalances = meta.preTokenBalances || [];
  const postBalances = meta.postTokenBalances || [];

  // Build a map of owner -> mint -> balance
  const preMap = new Map<string, Map<string, number>>();
  const postMap = new Map<string, Map<string, number>>();

  for (const bal of preBalances) {
    const owner = bal.owner;
    const mint = bal.mint;
    const amount = parseFloat(bal.uiTokenAmount?.uiAmountString || '0');
    if (!preMap.has(owner)) preMap.set(owner, new Map());
    preMap.get(owner)!.set(mint, amount);
  }

  for (const bal of postBalances) {
    const owner = bal.owner;
    const mint = bal.mint;
    const amount = parseFloat(bal.uiTokenAmount?.uiAmountString || '0');
    if (!postMap.has(owner)) postMap.set(owner, new Map());
    postMap.get(owner)!.set(mint, amount);
  }

  // Detect transfers by comparing pre/post balances
  const allOwners = new Set([...preMap.keys(), ...postMap.keys()]);
  for (const owner of allOwners) {
    const preMints = preMap.get(owner) || new Map();
    const postMints = postMap.get(owner) || new Map();
    const allMints = new Set([...preMints.keys(), ...postMints.keys()]);

    for (const mint of allMints) {
      const pre = preMints.get(mint) || 0;
      const post = postMints.get(mint) || 0;
      const diff = post - pre;

      if (Math.abs(diff) > 1e-9) {
        // Find the actual counterparty by looking at who had the opposite change
        let counterparty = '';
        for (const [otherOwner, otherMints] of postMap) {
          if (otherOwner === owner) continue;
          const otherPre = (preMap.get(otherOwner) || new Map()).get(mint) || 0;
          const otherPost = otherMints.get(mint) || 0;
          const otherDiff = otherPost - otherPre;
          if (Math.abs(otherDiff + diff) < 1e-9) {
            counterparty = otherOwner;
            break;
          }
        }

        // If we couldn't find counterparty, use a placeholder
        if (!counterparty) {
          counterparty = diff > 0 ? 'unknown_sender' : 'unknown_receiver';
        }

        transfers.push({
          mint,
          from: diff < 0 ? owner : counterparty,
          to: diff > 0 ? owner : counterparty,
          amount: Math.abs(diff),
          decimals: balDecimals(preBalances, postBalances, mint),
        });
      }
    }
  }

  // Parse native SOL transfers
  const preSol = meta.preBalances || [];
  const postSol = meta.postBalances || [];
  const accountKeys = message.accountKeys || [];

  for (let i = 0; i < Math.min(preSol.length, postSol.length, accountKeys.length); i++) {
    const pre = preSol[i] / 1e9;
    const post = postSol[i] / 1e9;
    const diff = post - pre;

    if (Math.abs(diff) > 1e-9) {
      // Find counterparty
      let counterparty = '';
      for (let j = 0; j < Math.min(preSol.length, postSol.length); j++) {
        if (i === j) continue;
        const otherDiff = (postSol[j] - preSol[j]) / 1e9;
        if (Math.abs(otherDiff + diff) < 1e-9) {
          counterparty = typeof accountKeys[j] === 'string' ? accountKeys[j] : accountKeys[j].pubkey;
          break;
        }
      }

      const owner = typeof accountKeys[i] === 'string' ? accountKeys[i] : accountKeys[i].pubkey;

      transfers.push({
        mint: 'So11111111111111111111111111111111111111112',
        from: diff < 0 ? owner : (counterparty || 'unknown_sender'),
        to: diff > 0 ? owner : (counterparty || 'unknown_receiver'),
        amount: Math.abs(diff),
        decimals: 9,
      });
    }
  }

  return {
    signature,
    slot: tx.slot,
    timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
    transfers,
    raw: tx,
  };
}

function balDecimals(preBalances: any[], postBalances: any[], mint: string): number {
  for (const bal of [...preBalances, ...postBalances]) {
    if (bal.mint === mint) {
      return bal.uiTokenAmount?.decimals || 0;
    }
  }
  return 0;
}

function parseHeliusTransaction(tx: any): ParsedTransaction {
  const transfers: ParsedTransfer[] = [];

  // Helius returns parsed token transfers
  if (tx.tokenTransfers) {
    for (const t of tx.tokenTransfers) {
      transfers.push({
        mint: t.mint,
        from: t.fromUserAccount,
        to: t.toUserAccount,
        amount: t.tokenAmount,
        decimals: t.decimals || 0,
      });
    }
  }

  // Also check native SOL transfers
  if (tx.nativeTransfers) {
    for (const t of tx.nativeTransfers) {
      transfers.push({
        mint: 'So11111111111111111111111111111111111111112', // Wrapped SOL
        from: t.fromUserAccount,
        to: t.toUserAccount,
        amount: t.amount / 1e9,
        decimals: 9,
      });
    }
  }

  return {
    signature: tx.signature,
    slot: tx.slot,
    timestamp: tx.timestamp ? tx.timestamp * 1000 : Date.now(),
    transfers,
    raw: tx,
  };
}

export function classifyTransaction(
  tx: ParsedTransaction,
  walletAddress: string,
  trackedAddresses: Set<string>
): { type: string; primaryTransfer: ParsedTransfer | null; counterpartyTransfer: ParsedTransfer | null } | null {
  const walletLower = walletAddress.toLowerCase();
  const ourTransfers = tx.transfers.filter(t =>
    t.from.toLowerCase() === walletLower || t.to.toLowerCase() === walletLower
  );

  if (ourTransfers.length === 0) return null;

  // Check for liquidity operations by looking at raw instruction logs
  const rawInstructions = tx.raw?.instructions || [];
  const innerInstructions = tx.raw?.innerInstructions || [];
  const allIxs = [...rawInstructions, ...innerInstructions.flatMap((g: any) => g.instructions || [])];

  const instructionNames = allIxs
    .map((ix: any) => ix.parsed?.type || ix.name || '')
    .filter(Boolean);

  const programLogs: string[] = tx.raw?.logMessages || [];

  // Detect liquidity add/remove from program logs
  const hasLiquidityRemove = programLogs.some((log: string) =>
    log.includes('RemoveLiquidity') || log.includes('ClosePosition')
  );
  const hasLiquidityAdd = programLogs.some((log: string) =>
    log.includes('AddLiquidity') || log.includes('OpenPosition')
  );
  const hasClaimFee = programLogs.some((log: string) =>
    log.includes('ClaimFee')
  );

  if (hasLiquidityRemove || hasClaimFee) {
    // Liquidity removal: find the non-stable token being received back
    const receives = ourTransfers.filter(t => t.to.toLowerCase() === walletLower);
    const nonStable = receives.find(t => !isStableCoin(t.mint));
    return {
      type: 'liquidity_remove',
      primaryTransfer: nonStable || receives[0] || ourTransfers[0],
      counterpartyTransfer: null
    };
  }

  if (hasLiquidityAdd) {
    // Liquidity add: find the non-stable token being sent
    const sends = ourTransfers.filter(t => t.from.toLowerCase() === walletLower);
    const nonStable = sends.find(t => !isStableCoin(t.mint));
    return {
      type: 'liquidity_add',
      primaryTransfer: nonStable || sends[0] || ourTransfers[0],
      counterpartyTransfer: null
    };
  }

  // Check for internal transfer (between tracked wallets)
  if (ourTransfers.length === 1) {
    const t = ourTransfers[0];
    const otherParty = t.from.toLowerCase() === walletLower ? t.to.toLowerCase() : t.from.toLowerCase();
    if (trackedAddresses.has(otherParty)) {
      return {
        type: 'internal_transfer',
        primaryTransfer: t,
        counterpartyTransfer: null
      };
    }
  }

  // Single transfer = simple transfer in/out
  if (ourTransfers.length === 1) {
    const t = ourTransfers[0];
    const type = t.to.toLowerCase() === walletLower ? 'transfer_in' : 'transfer_out';
    return { type, primaryTransfer: t, counterpartyTransfer: null };
  }

  // Multiple transfers = likely a swap
  // Find transfers where wallet is sender and receiver
  const sends = ourTransfers.filter(t => t.from.toLowerCase() === walletLower);
  const receives = ourTransfers.filter(t => t.to.toLowerCase() === walletLower);

  if (sends.length > 0 && receives.length > 0) {
    // It's a swap. Determine if buy or sell based on which token is "more desirable"
    // Heuristic: if receiving a token and sending SOL/USDC → buy
    // If sending a token and receiving SOL/USDC → sell
    const nonStableReceived = receives.find(r => !isStableCoin(r.mint));
    const nonStableSent = sends.find(s => !isStableCoin(s.mint));

    if (nonStableReceived && isStableCoin(sends[0].mint)) {
      // Buying shitcoin with stable/SOL
      return {
        type: 'buy',
        primaryTransfer: nonStableReceived,
        counterpartyTransfer: sends[0]
      };
    }

    if (nonStableSent && isStableCoin(receives[0].mint)) {
      // Selling shitcoin for stable/SOL
      return {
        type: 'sell',
        primaryTransfer: nonStableSent,
        counterpartyTransfer: receives[0]
      };
    }

    // Both are non-stable: treat as buy for the received token
    return {
      type: 'buy',
      primaryTransfer: receives[0],
      counterpartyTransfer: sends[0]
    };
  }

  // Fallback: if only sending
  if (sends.length > 0) {
    return { type: 'transfer_out', primaryTransfer: sends[0], counterpartyTransfer: null };
  }

  // Fallback: if only receiving
  if (receives.length > 0) {
    return { type: 'transfer_in', primaryTransfer: receives[0], counterpartyTransfer: null };
  }

  return null;
}

function isStableCoin(mint: string): boolean {
  const stableCoins = new Set([
    'So11111111111111111111111111111111111111112', // SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  ]);
  return stableCoins.has(mint);
}
