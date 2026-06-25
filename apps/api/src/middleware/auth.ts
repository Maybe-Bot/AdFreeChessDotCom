import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthRequest extends Request {
  userId?: number;
  username?: string;
  isGuest?: boolean;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { userId: number; username: string; isGuest?: boolean };
    req.userId = payload.userId;
    req.username = payload.username;
    req.isGuest = !!payload.isGuest;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRealUser(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.isGuest) {
      res.status(403).json({ error: 'Guest accounts cannot perform this action' });
      return;
    }
    next();
  });
}

export function signToken(userId: number, username: string, isGuest = false): string {
  return jwt.sign({ userId, username, isGuest }, config.jwtSecret, { expiresIn: '30d' });
}
