import { Router } from 'express';
import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcrypt';
import { getDb } from '../../db/index.js';
import { requireAuth, requireRealUser, signToken, type AuthRequest } from '../../middleware/auth.js';
import { containsSlur } from '../../utils/username-filter.js';
import type { CreateBotBody, BotSummary } from '@chess/shared';

export const botsRouter = Router();

// Create a bot account owned by the calling user
botsRouter.post('/', requireRealUser, async (req: AuthRequest, res) => {
  const { username } = req.body as CreateBotBody;
  if (!username || typeof username !== 'string' || username.trim().length < 2) {
    res.status(400).json({ error: 'username must be at least 2 characters' });
    return;
  }

  const cleanName = username.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
    res.status(400).json({ error: 'username may only contain letters, numbers, underscores, and hyphens' });
    return;
  }

  const db = getDb();

  const botCount = (db.prepare('SELECT COUNT(*) AS n FROM users WHERE bot_owner_id = ? AND is_bot = 1').get(req.userId) as { n: number }).n;
  if (botCount >= 10) {
    res.status(409).json({ error: 'Maximum of 10 bots per account' });
    return;
  }

  if (containsSlur(cleanName)) {
    res.status(400).json({ error: 'That username is not allowed' });
    return;
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanName);
  if (existing) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const apiKey = randomBytes(32).toString('hex');
  const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
  const fakeEmail = `bot_${randomBytes(8).toString('hex')}@bots.internal`;
  const fakeHash = await bcrypt.hash(randomBytes(16).toString('hex'), 12);

  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash, is_bot, bot_api_key, bot_owner_id) VALUES (?, ?, ?, 1, ?, ?)'
  ).run(cleanName, fakeEmail, fakeHash, apiKeyHash, req.userId);

  // apiKey is only returned here — we store only the hash
  res.status(201).json({
    id: result.lastInsertRowid,
    username: cleanName,
    apiKey,
  });
});

// Exchange an api key for a JWT (no user auth required — this is how bots authenticate)
botsRouter.post('/auth', (req, res) => {
  const { apiKey } = req.body as { apiKey: string };
  if (!apiKey) {
    res.status(400).json({ error: 'apiKey is required' });
    return;
  }

  const db = getDb();
  const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
  const bot = db.prepare('SELECT id, username FROM users WHERE bot_api_key = ? AND is_bot = 1').get(apiKeyHash) as any;
  if (!bot) {
    res.status(401).json({ error: 'Invalid api key' });
    return;
  }

  const token = signToken(bot.id, bot.username);
  res.json({ token });
});

// List bots owned by the calling user
botsRouter.get('/', requireRealUser, (req: AuthRequest, res) => {
  const db = getDb();
  const bots = db.prepare(
    'SELECT id, username, elo_rating, created_at FROM users WHERE bot_owner_id = ? AND is_bot = 1 ORDER BY created_at DESC'
  ).all(req.userId) as any[];

  const result: BotSummary[] = bots.map(b => ({
    id: b.id,
    username: b.username,
    eloRating: b.elo_rating,
    createdAt: b.created_at,
  }));

  res.json(result);
});

// Delete a bot owned by the calling user
botsRouter.delete('/:id', requireRealUser, (req: AuthRequest, res) => {
  const db = getDb();
  const bot = db.prepare('SELECT id, bot_owner_id FROM users WHERE id = ? AND is_bot = 1').get(req.params.id) as any;
  if (!bot) {
    res.status(404).json({ error: 'Bot not found' });
    return;
  }
  if (bot.bot_owner_id !== req.userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  db.transaction(() => {
    // End any active game the bot is playing — leave completed/waiting as-is, just nullify the slot
    db.prepare(`
      UPDATE games SET status = 'completed', result = CASE
        WHEN white_player_id = ? THEN 'black'
        ELSE 'white'
      END, end_reason = 'resignation', updated_at = datetime('now')
      WHERE (white_player_id = ? OR black_player_id = ?) AND status = 'active'
    `).run(bot.id, bot.id, bot.id);
    // Nullify remaining references to preserve game history
    db.prepare('UPDATE games SET white_player_id = NULL WHERE white_player_id = ?').run(bot.id);
    db.prepare('UPDATE games SET black_player_id = NULL WHERE black_player_id = ?').run(bot.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(bot.id);
  })();

  res.json({ ok: true });
});
