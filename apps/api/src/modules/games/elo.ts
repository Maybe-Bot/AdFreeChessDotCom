import type Database from 'better-sqlite3';
import type { GameState } from '@chess/shared';

export function updateElo(db: Database.Database, game: GameState) {
  if (!game.whitePlayer || !game.blackPlayer || !game.result) return;

  const ra = game.whitePlayer.eloRating;
  const rb = game.blackPlayer.eloRating;
  const K = 32;

  const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  const eb = 1 - ea;

  const sa = game.result === 'white' ? 1 : game.result === 'draw' ? 0.5 : 0;
  const sb = 1 - sa;

  const newRa = Math.round(ra + K * (sa - ea));
  const newRb = Math.round(rb + K * (sb - eb));

  db.transaction(() => {
    db.prepare('UPDATE users SET elo_rating = ? WHERE id = ?').run(newRa, game.whitePlayer!.id);
    db.prepare('UPDATE users SET elo_rating = ? WHERE id = ?').run(newRb, game.blackPlayer!.id);
  })();
}
