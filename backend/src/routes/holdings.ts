import { Router } from 'express';
import { fetchWalletHoldings } from '../holdings';
import { query } from '../db';
import { AuthRequest } from '../auth';

const router = Router();

router.get('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;

  const wallet = await query('SELECT address FROM wallets WHERE id = $1', [id]);
  if (wallet.rows.length === 0) {
    res.status(404).json({ error: 'Wallet not found' });
    return;
  }

  try {
    const holdings = await fetchWalletHoldings(wallet.rows[0].address);
    res.json(holdings);
  } catch (error) {
    console.error('[Holdings] Error fetching holdings:', error);
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
});

export default router;
