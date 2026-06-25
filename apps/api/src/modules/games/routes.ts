import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Chess } from 'chess.js';
import { getDb } from '../../db/index.js';
import { requireAuth, type AuthRequest } from '../../middleware/auth.js';
import { broadcast } from '../../ws/rooms.js';
import { updateElo } from './elo.js';
import type { GameSummary, GameState, TimeControl } from '@chess/shared';

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

// Must come before /:id to avoid Express matching 'open' as an id
gamesRouter.get('/open', (req: AuthRequest, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT g.*,
      w.username AS white_username, w.elo_rating AS white_elo, w.is_bot AS white_is_bot,
      b.username AS black_username, b.elo_rating AS black_elo, b.is_bot AS black_is_bot
    FROM games g
    LEFT JOIN users w ON g.white_player_id = w.id
    LEFT JOIN users b ON g.black_player_id = b.id
    WHERE g.status = 'waiting'
      AND (g.white_player_id != ? OR g.white_player_id IS NULL)
      AND (g.black_player_id != ? OR g.black_player_id IS NULL)
      AND (
        g.time_control_type = 'correspondence'
        OR g.created_at > datetime('now', '-15 minutes')
      )
    ORDER BY g.created_at DESC
    LIMIT 30
  `).all(req.userId, req.userId) as any[];

  res.json(rows.map(rowToSummary));
});

gamesRouter.post('/', (req: AuthRequest, res) => {
  const db = getDb();
  const id = uuidv4();
  const color = (req.body.color === 'black') ? 'black' : 'white';
  const tc: TimeControl = req.body.timeControl ?? { type: 'unlimited' };

  const initialTimeMs = tc.type === 'clock' ? (tc.initialTimeMs ?? 300000) : null;
  const incrementMs   = tc.type === 'clock' ? (tc.incrementMs ?? 0) : 0;
  const daysPerMove   = tc.type === 'correspondence' ? (tc.daysPerMove ?? 3) : null;
  const startingTime  = tc.type === 'clock' ? initialTimeMs : null;

  if (color === 'white') {
    db.prepare(`
      INSERT INTO games (id, white_player_id, time_control_type, initial_time_ms, increment_ms, days_per_move, white_time_ms, black_time_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.userId, tc.type, initialTimeMs, incrementMs, daysPerMove, startingTime, startingTime);
  } else {
    db.prepare(`
      INSERT INTO games (id, black_player_id, time_control_type, initial_time_ms, increment_ms, days_per_move, white_time_ms, black_time_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.userId, tc.type, initialTimeMs, incrementMs, daysPerMove, startingTime, startingTime);
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

  // Check for timeout on load
  if (row.status === 'active') {
    const timedOut = checkAndApplyTimeout(db, row);
    if (timedOut) {
      const updated = rowToState(getFullGameRow(db, req.params.id));
      res.json(updated);
      return;
    }
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
    db.prepare(`UPDATE games SET white_player_id = ?, status = 'active', last_move_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(req.userId, req.params.id);
  } else {
    db.prepare(`UPDATE games SET black_player_id = ?, status = 'active', last_move_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(req.userId, req.params.id);
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

  // Check if mover's clock has run out
  const clockResult = applyClock(row, turn);
  if (clockResult.timedOut) {
    db.prepare(`UPDATE games SET status = 'completed', result = ?, end_reason = 'timeout', updated_at = datetime('now') WHERE id = ?`)
      .run(clockResult.winner, req.params.id);
    const timedOutState = rowToState(getFullGameRow(db, req.params.id));
    updateElo(db, timedOutState);
    broadcast(req.params.id, { type: 'game:ended', state: timedOutState });
    res.status(409).json({ error: 'Time expired' });
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
    UPDATE games SET fen = ?, pgn = ?, status = ?, result = ?, end_reason = ?,
      draw_offered_by = NULL,
      white_time_ms = ?, black_time_ms = ?,
      last_move_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(chess.fen(), chess.pgn(), status, result, endReason,
    clockResult.newWhiteTimeMs ?? row.white_time_ms,
    clockResult.newBlackTimeMs ?? row.black_time_ms,
    req.params.id);

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

/**
 * Checks if the mover has run out of time, and if not, returns updated clock values.
 * Returns { timedOut, winner?, newWhiteTimeMs?, newBlackTimeMs? }
 */
export function applyClock(row: any, turn: 'w' | 'b'): {
  timedOut: boolean;
  winner?: 'white' | 'black';
  newWhiteTimeMs?: number | null;
  newBlackTimeMs?: number | null;
} {
  const tcType = row.time_control_type ?? 'unlimited';

  if (tcType === 'unlimited') {
    return { timedOut: false, newWhiteTimeMs: null, newBlackTimeMs: null };
  }

  const now = Date.now();
  const lastMoveAt = row.last_move_at ? new Date(row.last_move_at + 'Z').getTime() : now;
  const elapsed = now - lastMoveAt;

  if (tcType === 'correspondence') {
    const limitMs = (row.days_per_move ?? 3) * 24 * 60 * 60 * 1000;
    if (elapsed > limitMs) {
      return { timedOut: true, winner: turn === 'w' ? 'black' : 'white' };
    }
    return { timedOut: false };
  }

  // clock
  const whiteTimeMs: number = row.white_time_ms ?? 0;
  const blackTimeMs: number = row.black_time_ms ?? 0;
  const incrementMs: number = row.increment_ms ?? 0;

  if (turn === 'w') {
    const remaining = whiteTimeMs - elapsed;
    if (remaining <= 0) return { timedOut: true, winner: 'black' };
    return { timedOut: false, newWhiteTimeMs: remaining + incrementMs, newBlackTimeMs: blackTimeMs };
  } else {
    const remaining = blackTimeMs - elapsed;
    if (remaining <= 0) return { timedOut: true, winner: 'white' };
    return { timedOut: false, newWhiteTimeMs: whiteTimeMs, newBlackTimeMs: remaining + incrementMs };
  }
}

/** Checks timeout on page load / join; ends game if expired. Returns true if game was ended. */
export function checkAndApplyTimeout(db: ReturnType<typeof getDb>, row: any): boolean {
  if (!row.last_move_at) return false;
  const chess = new Chess();
  if (row.pgn) chess.loadPgn(row.pgn);
  const turn = chess.turn();
  const result = applyClock(row, turn);
  if (!result.timedOut) return false;

  db.prepare(`UPDATE games SET status = 'completed', result = ?, end_reason = 'timeout', updated_at = datetime('now') WHERE id = ?`)
    .run(result.winner, row.id);
  const updated = rowToState(getFullGameRow(db, row.id));
  updateElo(db, updated);
  broadcast(row.id, { type: 'game:ended', state: updated });
  return true;
}

export function rowToSummary(row: any): GameSummary {
  const tcType = row.time_control_type ?? 'unlimited';
  const timeControl: TimeControl = { type: tcType };
  if (tcType === 'clock') {
    timeControl.initialTimeMs = row.initial_time_ms ?? undefined;
    timeControl.incrementMs = row.increment_ms ?? 0;
  } else if (tcType === 'correspondence') {
    timeControl.daysPerMove = row.days_per_move ?? undefined;
  }

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
    timeControl,
    whiteTimeMs: row.white_time_ms ?? null,
    blackTimeMs: row.black_time_ms ?? null,
    lastMoveAt: row.last_move_at ?? null,
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
