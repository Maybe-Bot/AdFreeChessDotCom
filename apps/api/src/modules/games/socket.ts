import { WebSocketServer, WebSocket } from 'ws';
import { Chess } from 'chess.js';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { getDb } from '../../db/index.js';
import { getFullGameRow, rowToState, applyClock, checkAndApplyTimeout } from './routes.js';
import { updateElo } from './elo.js';
import { joinRoom, leaveRoom, broadcast, send } from '../../ws/rooms.js';
import type { ClientMessage } from '@chess/shared';

export function registerGameSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket) => {
    let userId: number | undefined;
    let gameId: string | undefined;

    ws.on('message', (raw) => {
      // Enforce message size limit (16 KB)
      if (raw.toString().length > 16384) {
        ws.close(1009, 'Message too large');
        return;
      }

      let msg: ClientMessage;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      // First message must be game:auth
      if (!userId) {
        if (msg.type !== 'game:auth') {
          ws.close(4001, 'Unauthorized');
          return;
        }
        try {
          const payload = jwt.verify(msg.token, config.jwtSecret) as { userId: number };
          userId = payload.userId;
        } catch {
          ws.close(4001, 'Unauthorized');
        }
        return;
      }

      switch (msg.type) {
        case 'game:join':      handleJoin(msg.gameId); break;
        case 'game:move':      handleMove(msg.from, msg.to, msg.promotion); break;
        case 'game:resign':    handleResign(); break;
        case 'game:offer_draw':  handleOfferDraw(); break;
        case 'game:accept_draw': handleAcceptDraw(); break;
        case 'game:decline_draw': handleDeclineDraw(); break;
      }
    });

    ws.on('close', () => {
      if (gameId) leaveRoom(gameId, ws);
    });

    function handleJoin(id: string) {
      const db = getDb();
      let row = getFullGameRow(db, id);
      if (!row) { send(ws, { type: 'game:error', message: 'Game not found' }); return; }

      // Fill empty player slot
      if (row.status === 'waiting' && row.white_player_id !== userId && row.black_player_id !== userId) {
        if (!row.white_player_id) {
          db.prepare(`UPDATE games SET white_player_id = ?, status = 'active', last_move_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(userId, id);
        } else if (!row.black_player_id) {
          db.prepare(`UPDATE games SET black_player_id = ?, status = 'active', last_move_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(userId, id);
        }
        row = getFullGameRow(db, id);
      }

      // Check for timeout when joining an active game
      if (row.status === 'active') {
        checkAndApplyTimeout(db, row);
        row = getFullGameRow(db, id);
      }

      if (gameId && gameId !== id) leaveRoom(gameId, ws);
      gameId = id;
      joinRoom(id, ws);

      const state = rowToState(row);
      send(ws, { type: 'game:state', state });
      if (row.status === 'active') broadcast(id, { type: 'game:state', state });
    }

    function handleMove(from: string, to: string, promotion?: string) {
      if (!gameId) return;
      const db = getDb();
      const row = getFullGameRow(db, gameId);
      if (!row || row.status !== 'active') { send(ws, { type: 'game:error', message: 'Game is not active' }); return; }

      const isWhite = row.white_player_id === userId;
      const isBlack = row.black_player_id === userId;
      if (!isWhite && !isBlack) { send(ws, { type: 'game:error', message: 'You are not a player in this game' }); return; }

      const chess = new Chess();
      if (row.pgn) chess.loadPgn(row.pgn);

      const turn = chess.turn();
      if ((turn === 'w' && !isWhite) || (turn === 'b' && !isBlack)) {
        send(ws, { type: 'game:error', message: 'Not your turn' });
        return;
      }

      // Check if the moving player's clock has run out
      const clockResult = applyClock(row, turn);
      if (clockResult.timedOut) {
        db.prepare(`UPDATE games SET status = 'completed', result = ?, end_reason = 'timeout', updated_at = datetime('now') WHERE id = ?`)
          .run(clockResult.winner, gameId);
        const timedOutState = rowToState(getFullGameRow(db, gameId));
        updateElo(db, timedOutState);
        broadcast(gameId, { type: 'game:ended', state: timedOutState });
        return;
      }

      let move;
      try { move = chess.move({ from, to, promotion: promotion ?? 'q' }); } catch {}
      if (!move) { send(ws, { type: 'game:error', message: 'Illegal move' }); return; }

      let status = 'active';
      let result: string | null = null;
      let endReason: string | null = null;

      if (chess.isCheckmate()) {
        status = 'completed'; result = turn === 'w' ? 'white' : 'black'; endReason = 'checkmate';
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
        gameId);

      const updated = rowToState(getFullGameRow(db, gameId));

      if (status === 'completed') {
        updateElo(db, updated);
        broadcast(gameId, { type: 'game:ended', state: updated });
      } else {
        broadcast(gameId, { type: 'game:move_made', state: updated });
      }
    }

    function handleResign() {
      if (!gameId) return;
      const db = getDb();
      const row = getFullGameRow(db, gameId);
      if (!row || row.status !== 'active') return;

      const isWhite = row.white_player_id === userId;
      const isBlack = row.black_player_id === userId;
      if (!isWhite && !isBlack) { send(ws, { type: 'game:error', message: 'You are not a player in this game' }); return; }

      const result = isWhite ? 'black' : 'white';
      db.prepare(`UPDATE games SET status = 'completed', result = ?, end_reason = 'resignation', updated_at = datetime('now') WHERE id = ?`).run(result, gameId);

      const updated = rowToState(getFullGameRow(db, gameId));
      updateElo(db, updated);
      broadcast(gameId, { type: 'game:ended', state: updated });
    }

    function handleOfferDraw() {
      if (!gameId) return;
      const db = getDb();
      const row = getFullGameRow(db, gameId);
      if (!row || row.status !== 'active') return;

      const isWhite = row.white_player_id === userId;
      const isBlack = row.black_player_id === userId;
      if (!isWhite && !isBlack) { send(ws, { type: 'game:error', message: 'You are not a player in this game' }); return; }

      const color = isWhite ? 'white' : 'black';
      db.prepare("UPDATE games SET draw_offered_by = ?, updated_at = datetime('now') WHERE id = ?").run(color, gameId);
      broadcast(gameId, { type: 'game:draw_offered', by: color });
    }

    function handleAcceptDraw() {
      if (!gameId) return;
      const db = getDb();
      const row = getFullGameRow(db, gameId);
      if (!row || row.status !== 'active' || !row.draw_offered_by) return;

      const isWhite = row.white_player_id === userId;
      const isBlack = row.black_player_id === userId;
      if (!isWhite && !isBlack) { send(ws, { type: 'game:error', message: 'You are not a player in this game' }); return; }

      const acceptorColor = isWhite ? 'white' : 'black';
      if (acceptorColor === row.draw_offered_by) return;

      db.prepare(`UPDATE games SET status = 'completed', result = 'draw', end_reason = 'draw_agreement', draw_offered_by = NULL, updated_at = datetime('now') WHERE id = ?`).run(gameId);

      const updated = rowToState(getFullGameRow(db, gameId));
      updateElo(db, updated);
      broadcast(gameId, { type: 'game:ended', state: updated });
    }

    function handleDeclineDraw() {
      if (!gameId) return;
      const db = getDb();
      const row = getFullGameRow(db, gameId);
      if (!row || row.status !== 'active') return;

      const isWhite = row.white_player_id === userId;
      const isBlack = row.black_player_id === userId;
      if (!isWhite && !isBlack) { send(ws, { type: 'game:error', message: 'You are not a player in this game' }); return; }

      db.prepare("UPDATE games SET draw_offered_by = NULL, updated_at = datetime('now') WHERE id = ?").run(gameId);
      broadcast(gameId, { type: 'game:draw_declined' });
    }
  });
}
