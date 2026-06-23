import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { BotSummary, CreateBotResponse } from '@chess/shared';
import styles from './BotsPage.module.css';

export default function BotsPage() {
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreateBotResponse | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    api.get<BotSummary[]>('/bots').then(setBots).catch(() => {});
  }, []);

  async function createBot(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    setCreated(null);
    try {
      const result = await api.post<CreateBotResponse>('/bots', { username: newName.trim() });
      setCreated(result);
      setBots(prev => [...prev, { id: result.id, username: result.username, eloRating: 1200, createdAt: new Date().toISOString() }]);
      setNewName('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteBot(id: number) {
    if (!confirm('Delete this bot? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await api.delete(`/bots/${id}`);
      setBots(prev => prev.filter(b => b.id !== id));
      if (created?.id === id) setCreated(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key).then(() => {
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backLink}>← Lobby</Link>
        <h1 className={styles.title}>Bot accounts</h1>
      </header>

      <main className={styles.main}>
        {/* Create bot */}
        <section className={styles.section}>
          <h2>Create a bot</h2>
          <p className={styles.hint}>
            Bot accounts authenticate with an API key instead of a password. Use the key to get a JWT via{' '}
            <code>POST /api/bots/auth {'{ apiKey }'}</code>, then use that JWT as a Bearer token for all game APIs.
          </p>
          <form onSubmit={createBot} className={styles.createForm}>
            <input
              className={styles.input}
              placeholder="Bot username…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              pattern="[a-zA-Z0-9_\-]+"
              minLength={2}
              maxLength={32}
            />
            <button className={styles.btnPrimary} type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
          {error && <p className={styles.error}>{error}</p>}

          {created && (
            <div className={styles.apiKeyBox}>
              <p className={styles.apiKeyLabel}>
                API key for <strong>{created.username}</strong> — copy it now, it won't be shown again.
              </p>
              <div className={styles.apiKeyRow}>
                <code className={styles.apiKey}>{created.apiKey}</code>
                <button className={styles.btnOutline} onClick={() => copyKey(created.apiKey)}>
                  {keyCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Bot list */}
        {bots.length > 0 && (
          <section className={styles.section}>
            <h2>Your bots</h2>
            <ul className={styles.botList}>
              {bots.map(b => (
                <li key={b.id} className={styles.botItem}>
                  <div className={styles.botInfo}>
                    <Link to={`/profile/${b.username}`} className={styles.botName}>{b.username}</Link>
                    <span className={styles.botElo}>{b.eloRating} ELO</span>
                  </div>
                  <button
                    className={styles.btnDanger}
                    onClick={() => deleteBot(b.id)}
                    disabled={deleting === b.id}
                  >
                    {deleting === b.id ? 'Deleting…' : 'Delete'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Usage docs */}
        <section className={styles.section}>
          <h2>How to use</h2>
          <ol className={styles.docs}>
            <li>Create a bot account above and save the API key.</li>
            <li>
              Get a JWT: <code>POST /api/bots/auth {'{ "apiKey": "..." }'}</code> → <code>{'{ "token": "..." }'}</code>
            </li>
            <li>
              Create or join a game:<br />
              <code>POST /api/games {'{ "color": "black" }'}</code> — creates a game as black and returns the game ID.<br />
              <code>POST /api/games/:id/join</code> — joins a waiting game as the other player.
            </li>
            <li>
              Poll game state: <code>GET /api/games/:id</code>
            </li>
            <li>
              Make a move: <code>POST /api/games/:id/moves {'{ "from": "e2", "to": "e4" }'}</code>
            </li>
            <li>
              Resign: <code>POST /api/games/:id/resign</code>
            </li>
          </ol>
          <p className={styles.hint}>All requests need <code>Authorization: Bearer {'<token>'}</code>.</p>
        </section>
      </main>
    </div>
  );
}
