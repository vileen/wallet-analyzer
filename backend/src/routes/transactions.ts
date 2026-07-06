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

export default router;
