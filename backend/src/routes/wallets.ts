import { Router } from 'express';
import { query } from '../db';
import { AuthRequest } from '../auth';

const router = Router();

router.get('/', async (req: AuthRequest, res) => {
  const result = await query('SELECT id, address, label, is_active, notifications_enabled, created_at FROM wallets ORDER BY created_at DESC');
  res.json(result.rows);
});

router.post('/', async (req: AuthRequest, res) => {
  const { address, label } = req.body;
  
  if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    res.status(400).json({ error: 'Invalid Solana address' });
    return;
  }

  try {
    const result = await query(
      'INSERT INTO wallets (address, label) VALUES ($1, $2) RETURNING *',
      [address, label || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'Wallet already exists' });
      return;
    }
    throw error;
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  await query('DELETE FROM wallets WHERE id = $1', [id]);
  res.json({ success: true });
});

router.patch('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { label, is_active, notifications_enabled } = req.body;
  
  const result = await query(
    'UPDATE wallets SET label = COALESCE($1, label), is_active = COALESCE($2, is_active), notifications_enabled = COALESCE($3, notifications_enabled) WHERE id = $4 RETURNING *',
    [label, is_active, notifications_enabled, id]
  );
  
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Wallet not found' });
    return;
  }
  
  res.json(result.rows[0]);
});

export default router;
