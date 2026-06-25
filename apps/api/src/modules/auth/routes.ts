import { Router } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { getDb } from '../../db/index.js';
import { requireAuth, signToken, type AuthRequest } from '../../middleware/auth.js';
import type { RegisterBody, LoginBody, User } from '@chess/shared';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const guestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

authRouter.post('/guest', guestLimiter, (req, res) => {
  const db = getDb();
  let username: string;
  let attempts = 0;
  do {
    username = `Guest_${Math.random().toString(36).slice(2, 8)}`;
    if (++attempts > 10) {
      res.status(500).json({ error: 'Could not generate unique guest username' });
      return;
    }
  } while (db.prepare('SELECT id FROM users WHERE username = ?').get(username));

  const result = db.prepare('INSERT INTO users (username, password_hash, is_guest) VALUES (?, ?, 1)').run(username, '');
  const user = db.prepare('SELECT id, username, email, elo_rating, bio, is_bot, is_guest, created_at FROM users WHERE id = ?').get(result.lastInsertRowid) as any;
  const token = signToken(user.id, user.username, true);
  res.status(201).json({ token, user: rowToUser(user) });
});

authRouter.post('/register', authLimiter, async (req, res) => {
  const { username, password } = req.body as RegisterBody;
  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_-]{2,30}$/.test(username)) {
    res.status(400).json({ error: 'Username must be 2–30 characters and may only contain letters, numbers, underscores, and hyphens' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  if (password.length > 72) {
    res.status(400).json({ error: 'Password must be 72 characters or fewer' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ? AND is_guest = 0').get(username);
  if (existing) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, passwordHash);

  const user = db.prepare('SELECT id, username, email, elo_rating, bio, is_bot, is_guest, created_at FROM users WHERE id = ?').get(result.lastInsertRowid) as any;
  const token = signToken(user.id, user.username, false);

  res.status(201).json({ token, user: rowToUser(user) });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body as LoginBody;
  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  const db = getDb();
  const row = db.prepare('SELECT id, username, email, password_hash, elo_rating, bio, is_bot, is_guest, created_at FROM users WHERE username = ? AND is_bot = 0 AND is_guest = 0').get(username) as any;
  if (!row) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = signToken(row.id, row.username, false);
  res.json({ token, user: rowToUser(row) });
});

authRouter.get('/me', requireAuth, (req: AuthRequest, res) => {
  const db = getDb();
  const row = db.prepare('SELECT id, username, email, elo_rating, bio, is_bot, is_guest, created_at FROM users WHERE id = ?').get(req.userId) as any;
  if (!row) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(rowToUser(row));
});

export function rowToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    eloRating: row.elo_rating,
    bio: row.bio ?? '',
    isBot: !!row.is_bot,
    isGuest: !!row.is_guest,
    createdAt: row.created_at,
  };
}
