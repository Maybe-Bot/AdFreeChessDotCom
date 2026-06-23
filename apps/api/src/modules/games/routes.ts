import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Chess } from 'chess.js';
import { getDb } from '../../db/index.js';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { broadcast } from '../../ws/rooms.js';
import { updateElo } from './elo.js';
import type { GameSummary, GameState } from '@chess/shared';

export const gamesRouter = Router();

gamesRouter.use(requireAuth);

gamesRouter.get('/', (req: AuthRequest, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT g.*,
      w.username AS white_username, w.elo_rating AS white_elo, w.is_bot AS white_is_bot,
      b.username AS black_username, b.elo_rating AS black_elo, b.is_bot AS black_is_bot
    FROM games g
    LEFT JOIN users w ON g.white_player_id = w.id
    LEFT JOIN users b ON g.black_player_id = b.id
    WHERE g.white_player_id = ? OR g.black_player_id = ?
    ORDER BY g.created_at DESC
    LIMIT 50
  `).all(req.userId, req.userId) as any[];

  res.json(rows.map(rowToSummary));
});

gamesRouter.post('/', (req: AuthRequest, res) => {
  const db = getDb();
  const id = uuidv4();
  const color = (req.body.color === 'black') ? 'black' : 'white';

  if (color === 'white') {
    db.prepare('INSERT INTO games (id, white_player_id) VALUES (?, ?)').run(id, req.userId);
  } else {
    db.prepare('INSERT INTO games (id, black_player_id) VALUES (?, ?)').run(id, req.userId);
  }

  const row = getFullGameRow(db, id);
  res.status(201).json(rowToState(row));
});

gamesRouter.get('/:id', (req: AuthRequest, res) => {
  const db = getDb();
  const row = getFullGameRow(db, req.params.id);
  if (!row) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }
  res.json(rowToState(row));
});

// REST join — useful for bots
gamesRouter.post('/:id/join', (req: AuthRequest, res) => {
  const db = getDb();
  let row = getFullGameRow(db, req.params.id);
  if (!row) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }
  if (row.status !== 'waiting') {
    res.status(409).json({ error: 'Game is not waiting for a player' });
    return;
  }
  if (row.white_player_id === req.userId || row.black_player_id === req.userId) {
    res.json(rowToState(row));
    return;
  }

  if (!row.white_player_id) {
    db.prepare("UPDATE games SET white_player_id = ?, status = 'active', updated_at = datetime('now') WHERE id = ?").run(req.userId, req.params.id);
  } else {
    db.prepare("UPDATE games SET black_player_id = ?, status = 'active', updated_at = datetime('now') WHERE id = ?").run(req.userId, req.params.id);
  }

  row = getFullGameRow(db, req.params.id);
  const state = rowToState(row);

  broadcast(req.params.id, { type: 'game:state', state });

  res.json(state);
});

// REST move — useful for bots
gamesRouter.post('/:id/moves', (req: AuthRequest, res) => {
  const { from, to, promotion } = req.body as { from: string; to: string; promotion?: string };
  if (!from || !to) {
    res.status(400).json({ error: 'from and to are required' });
    return;
  }

  const db = getDb();
  const row = getFullGameRow(db, req.params.id);
  if (!row) { res.status(404).json({ error: 'Game not found' }); return; }
  if (row.status !== 'active') { res.status(409).json({ error: 'Game is not active' }); return; }

  const isWhite = row.white_player_id === req.userId;
  const isBlack = row.black_player_id === req.userId;
  if (!isWhite && !isBlack) {
    res.status(403).json({ error: 'You are not a player in this game' });
    return;
  }

  const chess = new Chess();
  if (row.pgn) chess.loadPgn(row.pgn);

  const turn = chess.turn();
  if ((turn === 'w' && !isWhite) || (turn === 'b' && !isBlack)) {
    res.status(409).json({ error: 'Not your turn' });
    return;
  }

  let move;
  try {
    move = chess.move({ from, to, promotion: promotion ?? 'q' });
  } catch {
    res.status(422).json({ error: 'Illegal move' });
    return;
  }
  if (!move) { res.status(422).json({ error: 'Illegal move' }); return; }

  let status = 'active';
  let result: string | null = null;
  let endReason: string | null = null;

  if (chess.isCheckmate()) {
    status = 'completed';
    result = turn === 'w' ? 'white' : 'black';
    endReason = 'checkmate';
  } else if (chess.isStalemate()) {
    status = 'completed'; result = 'draw'; endReason = 'stalemate';
  } else if (chess.isInsufficientMaterial()) {
    status = 'completed'; result = 'draw'; endReason = 'insufficient_material';
  } else if (chess.isThreefoldRepetition()) {
    status = 'completed'; result = 'draw'; endReason = 'threefold_repetition';
  } else if (chess.isDraw()) {
    status = 'completed'; result = 'draw'; endReason = '50_move_rule';
  }

  db.prepare(`
    UPDATE games SET fen = ?, pgn = ?, status = ?, result = ?, end_reason = ?, draw_offered_by = NULL, updated_at = datetime('now') WHERE id = ?
  `).run(chess.fen(), chess.pgn(), status, result, endReason, req.params.id);

  const updated = rowToState(getFullGameRow(db, req.params.id));

  if (status === 'completed') {
    updateElo(db, updated);
    broadcast(req.params.id, { type: 'game:ended', state: updated });
  } else {
    broadcast(req.params.id, { type: 'game:move_made', state: updated });
  }

  res.json(updated);
});

// REST resign — useful for bots
gamesRouter.post('/:id/resign', (req: AuthRequest, res) => {
  const db = getDb();
  const row = getFullGameRow(db, req.params.id);
  if (!row) { res.status(404).json({ error: 'Game not found' }); return; }
  if (row.status !== 'active') { res.status(409).json({ error: 'Game is not active' }); return; }

  const isWhite = row.white_player_id === req.userId;
  const isBlack = row.black_player_id === req.userId;
  if (!isWhite && !isBlack) {
    res.status(403).json({ error: 'You are not a player in this game' });
    return;
  }

  const result = isWhite ? 'black' : 'white';
  db.prepare(`
    UPDATE games SET status = 'completed', result = ?, end_reason = 'resignation', updated_at = datetime('now') WHERE id = ?
  `).run(result, req.params.id);

  const updated = rowToState(getFullGameRow(db, req.params.id));
  updateElo(db, updated);

  broadcast(req.params.id, { type: 'game:ended', state: updated });

  res.json(updated);
});

export function getFullGameRow(db: ReturnType<typeof getDb>, id: string) {
  return db.prepare(`
    SELECT g.*,
      w.username AS white_username, w.elo_rating AS white_elo, w.is_bot AS white_is_bot,
      b.username AS black_username, b.elo_rating AS black_elo, b.is_bot AS black_is_bot
    FROM games g
    LEFT JOIN users w ON g.white_player_id = w.id
    LEFT JOIN users b ON g.black_player_id = b.id
    WHERE g.id = ?
  `).get(id) as any;
}

export function rowToSummary(row: any): GameSummary {
  return {
    id: row.id,
    whitePlayer: row.white_player_id
      ? { id: row.white_player_id, username: row.white_username, eloRating: row.white_elo, isBot: !!row.white_is_bot }
      : null,
    blackPlayer: row.black_player_id
      ? { id: row.black_player_id, username: row.black_username, eloRating: row.black_elo, isBot: !!row.black_is_bot }
      : null,
    status: row.status,
    result: row.result ?? null,
    endReason: row.end_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToState(row: any): GameState {
  return {
    ...rowToSummary(row),
    pgn: row.pgn,
    fen: row.fen,
    drawOfferedBy: row.draw_offered_by ?? null,
  };
}
