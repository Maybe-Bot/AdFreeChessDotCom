import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import type { GameState, GameSummary } from '@chess/shared';
import styles from './LobbyPage.module.css';

export default function LobbyPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [joinId, setJoinId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<GameSummary[]>('/games').then(setGames).catch(() => {});
  }, []);

  async function createGame(color: 'white' | 'black') {
    setCreating(true);
    setError('');
    try {
      const game = await api.post<GameState>('/games', { color });
      navigate(`/game/${game.id}`);
    } catch (err: any) {
      setError(err.message);
      setCreating(false);
    }
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (joinId.trim()) navigate(`/game/${joinId.trim()}`);
  }

  function gameResultLabel(g: GameSummary) {
    if (g.status === 'waiting') return 'Waiting for opponent';
    if (g.status === 'active') return 'In progress';
    if (!g.result) return 'Ended';
    if (g.result === 'draw') return 'Draw';
    const winnerId = g.result === 'white' ? g.whitePlayer?.id : g.blackPlayer?.id;
    return winnerId === user?.id ? 'You won' : 'You lost';
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.logo}>♟ AdFreeChess</h1>
        <div className={styles.userInfo}>
          <Link to={`/profile/${user?.username}`} className={styles.profileLink}>
            {user?.username} · {user?.eloRating} ELO
          </Link>
          <Link to="/bots" className={styles.botsLink}>Bots</Link>
          <button className={styles.logoutBtn} onClick={logout}>Log out</button>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2>New game</h2>
          <div className={styles.newGameButtons}>
            <button className={styles.btnPrimary} onClick={() => createGame('white')} disabled={creating}>
              Play as White
            </button>
            <button className={styles.btnSecondary} onClick={() => createGame('black')} disabled={creating}>
              Play as Black
            </button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </section>

        <section className={styles.section}>
          <h2>Join by game ID</h2>
          <form onSubmit={handleJoin} className={styles.joinForm}>
            <input
              className={styles.input}
              placeholder="Paste game ID…"
              value={joinId}
              onChange={e => setJoinId(e.target.value)}
            />
            <button className={styles.btnPrimary} type="submit">Join</button>
          </form>
        </section>

        {games.length > 0 && (
          <section className={styles.section}>
            <h2>Your games</h2>
            <ul className={styles.gameList}>
              {games.map(g => (
                <li key={g.id} className={styles.gameItem} onClick={() => navigate(`/game/${g.id}`)}>
                  <span className={styles.gamePlayers}>
                    {g.whitePlayer?.username ?? '?'} vs {g.blackPlayer?.username ?? '?'}
                  </span>
                  <span className={`${styles.gameStatus} ${g.status === 'active' ? styles.active : ''}`}>
                    {gameResultLabel(g)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
