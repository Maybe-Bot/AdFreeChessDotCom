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
      email TEXT UNIQUE,
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

  // FK pragma cannot be set inside a transaction, so handle this migration manually
  if (!applied.has('003_email_optional')) {
    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        elo_rating INTEGER NOT NULL DEFAULT 1200,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        bio TEXT NOT NULL DEFAULT '',
        is_bot INTEGER NOT NULL DEFAULT 0,
        bot_api_key TEXT,
        bot_owner_id INTEGER REFERENCES users_new(id)
      )`);
      db.exec(`INSERT INTO users_new SELECT id, username, email, password_hash, elo_rating, created_at, bio, is_bot, bot_api_key, bot_owner_id FROM users`);
      db.exec(`DROP TABLE users`);
      db.exec(`ALTER TABLE users_new RENAME TO users`);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run('003_email_optional');
    })();
    db.pragma('foreign_keys = ON');
  }

  runMigration('004_guest_users', [
    `ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0`,
  ]);

  runMigration('002_time_controls', [
    `ALTER TABLE games ADD COLUMN time_control_type TEXT NOT NULL DEFAULT 'unlimited'`,
    `ALTER TABLE games ADD COLUMN initial_time_ms INTEGER`,
    `ALTER TABLE games ADD COLUMN increment_ms INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE games ADD COLUMN days_per_move INTEGER`,
    `ALTER TABLE games ADD COLUMN white_time_ms INTEGER`,
    `ALTER TABLE games ADD COLUMN black_time_ms INTEGER`,
    `ALTER TABLE games ADD COLUMN last_move_at TEXT`,
  ]);
}
