import { Router } from 'express';
import { query } from '../db';

const router = Router();

// Get pending notifications for a wallet
router.get('/:wallet_id', async (req, res) => {
  const walletId = parseInt(req.params.wallet_id);
  const { read = 'false' } = req.query;

  try {
    const result = await query(
      `SELECT id, type, title, body, data, created_at, read
       FROM notifications
       WHERE wallet_id = $1 AND read = $2
       ORDER BY created_at DESC
       LIMIT 50`,
      [walletId, read === 'true']
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    console.error('Failed to fetch notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notifications as read
router.post('/:wallet_id/read', async (req, res) => {
  const walletId = parseInt(req.params.wallet_id);
  const { ids } = req.body; // optional: specific IDs, or all unread

  try {
    if (ids && Array.isArray(ids)) {
      await query(
        `UPDATE notifications SET read = true WHERE id = ANY($1) AND wallet_id = $2`,
        [ids, walletId]
      );
    } else {
      await query(
        `UPDATE notifications SET read = true WHERE wallet_id = $1 AND read = false`,
        [walletId]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to mark notifications read:', err);
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});

export default router;
