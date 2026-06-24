import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import type { GameState, GameSummary, TimeControl } from '@chess/shared';
import styles from './LobbyPage.module.css';

// ─── Time control presets ─────────────────────────────────────────────────────

interface Preset {
  label: string;
  tc: TimeControl;
}

const PRESETS: { group: string; items: Preset[] }[] = [
  {
    group: 'Unlimited',
    items: [{ label: '∞', tc: { type: 'unlimited' } }],
  },
  {
    group: 'Bullet',
    items: [
      { label: '1+0', tc: { type: 'clock', initialTimeMs: 60_000, incrementMs: 0 } },
      { label: '2+1', tc: { type: 'clock', initialTimeMs: 120_000, incrementMs: 1_000 } },
    ],
  },
  {
    group: 'Blitz',
    items: [
      { label: '3+0', tc: { type: 'clock', initialTimeMs: 180_000, incrementMs: 0 } },
      { label: '3+2', tc: { type: 'clock', initialTimeMs: 180_000, incrementMs: 2_000 } },
      { label: '5+0', tc: { type: 'clock', initialTimeMs: 300_000, incrementMs: 0 } },
      { label: '5+3', tc: { type: 'clock', initialTimeMs: 300_000, incrementMs: 3_000 } },
    ],
  },
  {
    group: 'Rapid',
    items: [
      { label: '10+0', tc: { type: 'clock', initialTimeMs: 600_000, incrementMs: 0 } },
      { label: '15+10', tc: { type: 'clock', initialTimeMs: 900_000, incrementMs: 10_000 } },
      { label: '30+0', tc: { type: 'clock', initialTimeMs: 1_800_000, incrementMs: 0 } },
    ],
  },
  {
    group: 'Classical',
    items: [
      { label: '60+0', tc: { type: 'clock', initialTimeMs: 3_600_000, incrementMs: 0 } },
    ],
  },
  {
    group: 'Correspondence',
    items: [
      { label: '1d/move', tc: { type: 'correspondence', daysPerMove: 1 } },
      { label: '3d/move', tc: { type: 'correspondence', daysPerMove: 3 } },
      { label: '7d/move', tc: { type: 'correspondence', daysPerMove: 7 } },
      { label: '14d/move', tc: { type: 'correspondence', daysPerMove: 14 } },
      { label: '30d/move', tc: { type: 'correspondence', daysPerMove: 30 } },
    ],
  },
];

const DEFAULT_TC = PRESETS[2].items[2]; // 5+0 blitz

export function tcLabel(tc: TimeControl): string {
  if (tc.type === 'unlimited') return 'Unlimited';
  if (tc.type === 'correspondence') return `${tc.daysPerMove}d/move`;
  const mins = Math.floor((tc.initialTimeMs ?? 0) / 60_000);
  const inc = (tc.incrementMs ?? 0) / 1_000;
  return inc > 0 ? `${mins}+${inc}` : `${mins} min`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LobbyPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [myGames, setMyGames] = useState<GameSummary[]>([]);
  const [openChallenges, setOpenChallenges] = useState<GameSummary[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<Preset>(DEFAULT_TC);
  const [creating, setCreating] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [error, setError] = useState('');

  const fetchOpenChallenges = useCallback(() => {
    api.get<GameSummary[]>('/games/open').then(setOpenChallenges).catch(() => {});
  }, []);

  useEffect(() => {
    api.get<GameSummary[]>('/games').then(setMyGames).catch(() => {});
    fetchOpenChallenges();
    const id = setInterval(fetchOpenChallenges, 5_000);
    return () => clearInterval(id);
  }, [fetchOpenChallenges]);

  async function createGame(color: 'white' | 'black') {
    setCreating(true);
    setError('');
    try {
      const game = await api.post<GameState>('/games', { color, timeControl: selectedPreset.tc });
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
        {/* New game */}
        <section className={styles.section}>
          <h2>New game</h2>

          <div className={styles.presetGrid}>
            {PRESETS.map(group => (
              <div key={group.group} className={styles.presetGroup}>
                <span className={styles.presetGroupLabel}>{group.group}</span>
                {group.items.map(p => (
                  <button
                    key={p.label}
                    className={`${styles.presetBtn} ${selectedPreset === p ? styles.presetBtnActive : ''}`}
                    onClick={() => setSelectedPreset(p)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className={styles.newGameButtons}>
            <button className={styles.btnPrimary} onClick={() => createGame('white')} disabled={creating}>
              ♔ Play as White
            </button>
            <button className={styles.btnSecondary} onClick={() => createGame('black')} disabled={creating}>
              ♚ Play as Black
            </button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </section>

        {/* Open challenges */}
        <section className={styles.section}>
          <h2>Open challenges</h2>
          {openChallenges.length === 0 ? (
            <p className={styles.empty}>No open challenges right now — create one above!</p>
          ) : (
            <ul className={styles.gameList}>
              {openChallenges.map(g => {
                const creator = g.whitePlayer ?? g.blackPlayer;
                const creatorColor = g.whitePlayer ? 'White' : 'Black';
                return (
                  <li key={g.id} className={styles.gameItem} onClick={() => navigate(`/game/${g.id}`)}>
                    <div className={styles.challengeInfo}>
                      <span className={styles.gamePlayers}>{creator?.username ?? '?'}</span>
                      <span className={styles.challengeColor}>{creatorColor}</span>
                    </div>
                    <div className={styles.challengeMeta}>
                      <span className={styles.tcBadge}>{tcLabel(g.timeControl)}</span>
                      <span className={styles.eloTag}>{creator?.eloRating} ELO</span>
                      <button className={styles.joinBtn}>Join</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Join by ID */}
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

        {/* My games */}
        {myGames.length > 0 && (
          <section className={styles.section}>
            <h2>Your games</h2>
            <ul className={styles.gameList}>
              {myGames.map(g => (
                <li key={g.id} className={styles.gameItem} onClick={() => navigate(`/game/${g.id}`)}>
                  <span className={styles.gamePlayers}>
                    {g.whitePlayer?.username ?? '?'} vs {g.blackPlayer?.username ?? '?'}
                  </span>
                  <div className={styles.gameItemRight}>
                    <span className={styles.tcBadge}>{tcLabel(g.timeControl)}</span>
                    <span className={`${styles.gameStatus} ${g.status === 'active' ? styles.active : ''}`}>
                      {gameResultLabel(g)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
