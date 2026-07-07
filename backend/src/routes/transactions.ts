import { Router } from 'express';
import { query } from '../db';
import { resolveToken } from '../tokenResolver';
import { AuthRequest } from '../auth';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const { wallet_id, type, show_spam, limit = '100', offset = '0' } = req.query;
  
  let sql = `
    SELECT t.*, w.address as wallet_address, w.label as wallet_label, tk.pool_address as token_pool_address
    FROM transactions t
    JOIN wallets w ON t.wallet_id = w.id
    LEFT JOIN tokens tk ON t.token_mint = tk.mint
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramIdx = 1;

  if (wallet_id) {
    sql += ` AND t.wallet_id = $${paramIdx++}`;
    params.push(wallet_id);
  }

  if (type) {
    sql += ` AND t.type = $${paramIdx++}`;
    params.push(type);
  }

  if (show_spam !== 'true') {
    sql += ` AND t.is_spam = false AND (t.usd_value IS NULL OR t.usd_value >= 1)`;
  }

  sql += ` ORDER BY t.timestamp DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(parseInt(limit as string), parseInt(offset as string));

  const result = await query(sql, params);

  // Resolve missing pool addresses on the fly so Axiom links are correct
  const rows = result.rows;
  const missingMints = new Set<string>();
  for (const row of rows) {
    if (row.token_mint && !row.token_pool_address) {
      missingMints.add(row.token_mint);
    }
  }

  if (missingMints.size > 0) {
    const resolved = new Map<string, string>();
    await Promise.all(
      Array.from(missingMints).map(async (mint) => {
        const info = await resolveToken(mint);
        if (info?.pool_address) {
          resolved.set(mint, info.pool_address);
        }
      })
    );

    for (const row of rows) {
      if (row.token_mint && resolved.has(row.token_mint)) {
        row.token_pool_address = resolved.get(row.token_mint);
      }
    }
  }

  res.json(rows);
});

router.get('/stats', async (req: AuthRequest, res) => {
  const { wallet_id } = req.query;
  
  let sql = `
    SELECT 
      type,
      COUNT(*) as count,
      COALESCE(SUM(usd_value), 0) as total_usd
    FROM transactions
    WHERE is_spam = false AND (usd_value IS NULL OR usd_value >= 1)
  `;
  const params: any[] = [];
  
  if (wallet_id) {
    sql += ` AND wallet_id = $1`;
    params.push(wallet_id);
  }
  
  sql += ` GROUP BY type`;
  
  const result = await query(sql, params);
  res.json(result.rows);
});

router.get('/daily-summary', async (req: AuthRequest, res) => {
  const { wallet_id, days = '7' } = req.query;
  
  if (!wallet_id) {
    return res.status(400).json({ error: 'wallet_id required' });
  }

  const daysInt = parseInt(days as string) || 7;
  const since = new Date();
  since.setDate(since.getDate() - daysInt);

  // Daily aggregated stats
  const summarySql = `
    SELECT 
      DATE(timestamp AT TIME ZONE 'UTC') as date,
      type,
      COUNT(*) as count,
      COALESCE(SUM(usd_value), 0) as total_usd,
      COALESCE(SUM(amount), 0) as total_amount
    FROM transactions
    WHERE wallet_id = $1
      AND timestamp >= $2
      AND is_spam = false
      AND (usd_value IS NULL OR usd_value >= 0.01)
      AND type IN ('buy', 'sell', 'transfer_in', 'transfer_out')
    GROUP BY DATE(timestamp AT TIME ZONE 'UTC'), type
    ORDER BY date DESC, type
  `;

  // Per-token daily breakdown
  const tokenSql = `
    SELECT 
      DATE(timestamp AT TIME ZONE 'UTC') as date,
      token_mint,
      token_symbol,
      type,
      COUNT(*) as count,
      COALESCE(SUM(usd_value), 0) as total_usd,
      COALESCE(SUM(amount), 0) as total_amount
    FROM transactions
    WHERE wallet_id = $1
      AND timestamp >= $2
      AND is_spam = false
      AND (usd_value IS NULL OR usd_value >= 0.01)
      AND type IN ('buy', 'sell', 'transfer_in', 'transfer_out')
    GROUP BY DATE(timestamp AT TIME ZONE 'UTC'), token_mint, token_symbol, type
    ORDER BY date DESC, total_usd DESC
  `;

  const [summaryResult, tokenResult] = await Promise.all([
    query(summarySql, [wallet_id, since]),
    query(tokenSql, [wallet_id, since]),
  ]);

  // Build daily summary structure
  const dailyMap = new Map<string, any>();

  for (const row of summaryResult.rows) {
    const date = row.date;
    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        date,
        sell: { count: 0, usd: 0, amount: 0 },
        buy: { count: 0, usd: 0, amount: 0 },
        transfer_in: { count: 0, usd: 0, amount: 0 },
        transfer_out: { count: 0, usd: 0, amount: 0 },
        net_usd: 0,
        tokens: [],
      });
    }
    const day = dailyMap.get(date);
    if (day[row.type]) {
      day[row.type].count = parseInt(row.count);
      day[row.type].usd = parseFloat(row.total_usd);
      day[row.type].amount = parseFloat(row.total_amount);
    }
    // Net = money in (sell + transfer_in) - money out (buy + transfer_out)
    if (row.type === 'sell' || row.type === 'transfer_in') {
      day.net_usd += parseFloat(row.total_usd);
    } else if (row.type === 'buy' || row.type === 'transfer_out') {
      day.net_usd -= parseFloat(row.total_usd);
    }
  }

  // Add token breakdowns
  for (const row of tokenResult.rows) {
    const date = row.date;
    const day = dailyMap.get(date);
    if (day) {
      day.tokens.push({
        mint: row.token_mint,
        symbol: row.token_symbol || 'Unknown',
        type: row.type,
        count: parseInt(row.count),
        usd: parseFloat(row.total_usd),
        amount: parseFloat(row.total_amount),
      });
    }
  }

  // Sort tokens within each day by USD value
  for (const day of dailyMap.values()) {
    day.tokens.sort((a: any, b: any) => b.usd - a.usd);
  }

  res.json({
    days: daysInt,
    daily: Array.from(dailyMap.values()),
  });
});

export default router;
