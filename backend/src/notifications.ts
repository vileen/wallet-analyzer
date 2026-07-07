import { query } from './db';

export async function createNotification(
  walletId: number,
  type: string,
  title: string,
  body: string,
  data: Record<string, any> = {}
) {
  try {
    await query(
      `INSERT INTO notifications (wallet_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [walletId, type, title, body, JSON.stringify(data)]
    );
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

export async function notifyNewTransaction(
  walletId: number,
  txType: string,
  symbol: string,
  amount: number,
  usdValue: number | null,
  signature: string
) {
  const valueStr = usdValue ? `$${usdValue.toFixed(2)}` : 'unknown value';
  const title = `${txType.toUpperCase()}: ${symbol}`;
  const body = `${amount.toLocaleString()} ${symbol} (${valueStr})`;
  
  await createNotification(walletId, 'new_transaction', title, body, {
    tx_type: txType,
    symbol,
    amount,
    usd_value: usdValue,
    signature,
  });
}

export async function notifyHoldingsChange(
  walletId: number,
  symbol: string,
  direction: 'increased' | 'decreased' | 'new' | 'removed',
  changeValue: number,
  currentValue: number
) {
  const title = `${symbol}: ${direction}`;
  const body = `Position ${direction} by ${changeValue >= 0 ? '+' : ''}$${changeValue.toFixed(2)}. Current: $${currentValue.toFixed(2)}`;
  
  await createNotification(walletId, 'holdings_change', title, body, {
    symbol,
    direction,
    change_value: changeValue,
    current_value: currentValue,
  });
}
