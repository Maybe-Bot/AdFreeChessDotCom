import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import type { GameSummary } from '@chess/shared';
import { rowToSummary } from '../games/routes.js';

export const usersRouter = Router();

usersRouter.get('/:username', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, elo_rating, bio, is_bot, created_at FROM users WHERE username = ?').get(req.params.username) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const games = db.prepare(`
    SELECT g.*,
      w.username AS white_username, w.elo_rating AS white_elo, w.is_bot AS white_is_bot,
      b.username AS black_username, b.elo_rating AS black_elo, b.is_bot AS black_is_bot
    FROM games g
    LEFT JOIN users w ON g.white_player_id = w.id
    LEFT JOIN users b ON g.black_player_id = b.id
    WHERE (g.white_player_id = ? OR g.black_player_id = ?) AND g.status = 'completed'
    ORDER BY g.updated_at DESC
    LIMIT 20
  `).all(user.id, user.id) as any[];

  const stats = db.prepare(`
    SELECT
      COUNT(CASE WHEN (white_player_id = ? AND result = 'white') OR (black_player_id = ? AND result = 'black') THEN 1 END) AS wins,
      COUNT(CASE WHEN (white_player_id = ? AND result = 'black') OR (black_player_id = ? AND result = 'white') THEN 1 END) AS losses,
      COUNT(CASE WHEN result = 'draw' THEN 1 END) AS draws
    FROM games
    WHERE (white_player_id = ? OR black_player_id = ?) AND status = 'completed'
  `).get(user.id, user.id, user.id, user.id, user.id, user.id) as any;

  res.json({
    id: user.id,
    username: user.username,
    eloRating: user.elo_rating,
    bio: user.bio ?? '',
    isBot: !!user.is_bot,
    createdAt: user.created_at,
    wins: stats.wins,
    losses: stats.losses,
    draws: stats.draws,
    recentGames: games.map(rowToSummary) as GameSummary[],
  });
});

usersRouter.put('/:username', requireAuth, (req: AuthRequest, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username FROM users WHERE username = ?').get(req.params.username) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (user.id !== req.userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const bio = (req.body.bio ?? '').toString().slice(0, 200);
  db.prepare("UPDATE users SET bio = ? WHERE id = ?").run(bio, user.id);

  res.json({ bio });
});
