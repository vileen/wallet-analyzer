import { Router } from 'express';
import {
  fetchWalletHoldings,
  saveHoldingsSnapshot,
  getLatestSnapshot,
  getPreviousSnapshot,
  computeHoldingChanges,
  HoldingChange,
} from '../holdings';
import { query } from '../db';
import { AuthRequest } from '../auth';

const router = Router();

// GET /api/holdings/:id — returns latest snapshot with changes
router.get('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { refresh } = req.query;

  const wallet = await query('SELECT id, address FROM wallets WHERE id = $1', [id]);
  if (wallet.rows.length === 0) {
    res.status(404).json({ error: 'Wallet not found' });
    return;
  }

  const walletId = wallet.rows[0].id;
  const walletAddress = wallet.rows[0].address;

  try {
    let snapshot = await getLatestSnapshot(walletId);

    // Force refresh if requested or no snapshot exists
    if (refresh === 'true' || !snapshot) {
      snapshot = await saveHoldingsSnapshot(walletId, walletAddress);
    }

    if (!snapshot) {
      res.status(500).json({ error: 'Failed to fetch holdings' });
      return;
    }

    // Get previous snapshot for comparison
    const previous = await getPreviousSnapshot(walletId, snapshot.id);
    let changes: HoldingChange[] = [];
    if (previous) {
      changes = computeHoldingChanges(snapshot.items, previous.items);
    }

    res.json({
      ...snapshot,
      changes,
      previous_snapshot_at: previous?.snapshot_at || null,
    });
  } catch (error) {
    console.error('[Holdings] Error:', error);
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
});

// POST /api/holdings/:id/refresh — force refresh and save new snapshot
router.post('/:id/refresh', async (req: AuthRequest, res) => {
  const { id } = req.params;

  const wallet = await query('SELECT id, address FROM wallets WHERE id = $1', [id]);
  if (wallet.rows.length === 0) {
    res.status(404).json({ error: 'Wallet not found' });
    return;
  }

  try {
    const snapshot = await saveHoldingsSnapshot(wallet.rows[0].id, wallet.rows[0].address);
    const previous = await getPreviousSnapshot(wallet.rows[0].id, snapshot.id);
    let changes: HoldingChange[] = [];
    if (previous) {
      changes = computeHoldingChanges(snapshot.items, previous.items);
    }

    res.json({
      ...snapshot,
      changes,
      previous_snapshot_at: previous?.snapshot_at || null,
    });
  } catch (error) {
    console.error('[Holdings] Refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh holdings' });
  }
});

export default router;
