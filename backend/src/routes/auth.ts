import { Router } from 'express';
import { generateToken, verifyPassword, setAuthCookie, authMiddleware } from '../auth';

const router = Router();

router.post('/login', (req, res) => {
  const { password } = req.body;
  
  if (!password || !verifyPassword(password)) {
    res.status(401).json({ error: 'Invalid password' });
    return;
  }

  const token = generateToken();
  setAuthCookie(res, token);
  res.json({ success: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

router.get('/check', authMiddleware, (req, res) => {
  res.json({ authenticated: true });
});

export default router;
