import { query } from './db';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_BASE = 'https://api.helius.xyz/v0';

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

  const txs = await response.json();
  return txs.map((tx: any) => parseTransaction(tx));
}

function parseTransaction(tx: any): ParsedTransaction {
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
    const stableCoins = new Set([
      'So11111111111111111111111111111111111111112', // SOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    ]);

    // Find the "non-stable" token being received
    const nonStableReceived = receives.find(r => !stableCoins.has(r.mint));
    const nonStableSent = sends.find(s => !stableCoins.has(s.mint));

    if (nonStableReceived && stableCoins.has(sends[0].mint)) {
      // Buying shitcoin with stable/SOL
      return { 
        type: 'buy', 
        primaryTransfer: nonStableReceived, 
        counterpartyTransfer: sends[0] 
      };
    }

    if (nonStableSent && stableCoins.has(receives[0].mint)) {
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
