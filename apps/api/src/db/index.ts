import Database from 'better-sqlite3';
import { config } from '../config.js';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(config.databasePath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      elo_rating INTEGER NOT NULL DEFAULT 1200,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      white_player_id INTEGER REFERENCES users(id),
      black_player_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'waiting',
      result TEXT,
      end_reason TEXT,
      pgn TEXT NOT NULL DEFAULT '',
      fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      draw_offered_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map(r => r.name)
  );

  function runMigration(name: string, stmts: string[]) {
    if (applied.has(name)) return;
    db.transaction(() => {
      for (const stmt of stmts) db.exec(stmt);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
    })();
  }

  runMigration('001_user_extensions', [
    `ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN bot_api_key TEXT`,
    `ALTER TABLE users ADD COLUMN bot_owner_id INTEGER REFERENCES users(id)`,
  ]);
}
