import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET!;
const APP_PASSWORD = process.env.APP_PASSWORD!;

if (!JWT_SECRET || !APP_PASSWORD) {
  throw new Error('JWT_SECRET and APP_PASSWORD must be set');
}

export function generateToken(): string {
  return jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyPassword(password: string): boolean {
  return password === APP_PASSWORD;
}

export interface AuthRequest extends Request {
  user?: { authenticated: boolean };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { authenticated: boolean };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Cookie-based auth helper
export function setAuthCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProduction, // Must be true for SameSite=None
    sameSite: isProduction ? 'none' : 'lax', // None for cross-origin (GitHub Pages → your domain)
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}
