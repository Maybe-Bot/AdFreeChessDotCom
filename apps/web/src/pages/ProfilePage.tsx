import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { GameSummary } from '@chess/shared';
import styles from './ProfilePage.module.css';

interface ProfileData {
  id: number;
  username: string;
  eloRating: number;
  bio: string;
  isBot: boolean;
  createdAt: string;
  wins: number;
  losses: number;
  draws: number;
  recentGames: GameSummary[];
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [savingBio, setSavingBio] = useState(false);

  const isOwnProfile = !!user && profile?.id === user.id;

  useEffect(() => {
    if (!username) return;
    api.get<ProfileData>(`/users/${username}`)
      .then(p => { setProfile(p); setBioDraft(p.bio); })
      .catch(err => setError(err.message));
  }, [username]);

  function resultLabel(g: GameSummary, viewerId: number) {
    if (g.result === 'draw') return { text: 'Draw', cls: styles.draw };
    if (!g.result) return { text: 'Ongoing', cls: '' };
    const winnerId = g.result === 'white' ? g.whitePlayer?.id : g.blackPlayer?.id;
    return winnerId === viewerId
      ? { text: 'Win', cls: styles.win }
      : { text: 'Loss', cls: styles.loss };
  }

  async function saveBio() {
    if (!profile) return;
    setSavingBio(true);
    try {
      await api.put<{ bio: string }>(`/users/${profile.username}`, { bio: bioDraft });
      setProfile(p => p ? { ...p, bio: bioDraft } : p);
      setEditingBio(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingBio(false);
    }
  }

  if (error) return (
    <div className={styles.page}>
      <p className={styles.error}>{error}</p>
      <Link to="/">← Back</Link>
    </div>
  );

  if (!profile) return <div className={styles.page}><p className={styles.loading}>Loading…</p></div>;

  const label = (g: GameSummary) => resultLabel(g, profile.id);
  const total = profile.wins + profile.losses + profile.draws;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backLink}>← Lobby</Link>
      </header>

      <main className={styles.main}>
        <div className={styles.profileCard}>
          <div className={styles.profileTop}>
            <h1 className={styles.username}>
              {profile.username}
              {profile.isBot && <span className={styles.botBadge}>BOT</span>}
            </h1>
            <p className={styles.elo}>{profile.eloRating} ELO</p>
            <p className={styles.joined}>Member since {new Date(profile.createdAt).toLocaleDateString()}</p>
          </div>

          {/* W/L/D stats */}
          {total > 0 && (
            <div className={styles.stats}>
              <div className={styles.statItem}>
                <span className={styles.statValue + ' ' + styles.statWin}>{profile.wins}</span>
                <span className={styles.statLabel}>Wins</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statItem}>
                <span className={styles.statValue + ' ' + styles.statLoss}>{profile.losses}</span>
                <span className={styles.statLabel}>Losses</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statItem}>
                <span className={styles.statValue + ' ' + styles.statDraw}>{profile.draws}</span>
                <span className={styles.statLabel}>Draws</span>
              </div>
            </div>
          )}
          {total > 0 && (
            <div className={styles.statBar}>
              {profile.wins > 0 && (
                <div className={styles.statBarWin} style={{ width: `${(profile.wins / total) * 100}%` }} />
              )}
              {profile.draws > 0 && (
                <div className={styles.statBarDraw} style={{ width: `${(profile.draws / total) * 100}%` }} />
              )}
              {profile.losses > 0 && (
                <div className={styles.statBarLoss} style={{ width: `${(profile.losses / total) * 100}%` }} />
              )}
            </div>
          )}

          {/* Bio */}
          <div className={styles.bioSection}>
            {editingBio ? (
              <>
                <textarea
                  className={styles.bioInput}
                  value={bioDraft}
                  onChange={e => setBioDraft(e.target.value.slice(0, 200))}
                  placeholder="Tell people about yourself…"
                  rows={3}
                />
                <div className={styles.bioCounter}>{bioDraft.length}/200</div>
                <div className={styles.bioActions}>
                  <button className={styles.btnPrimary} onClick={saveBio} disabled={savingBio}>
                    {savingBio ? 'Saving…' : 'Save'}
                  </button>
                  <button className={styles.btnOutline} onClick={() => { setEditingBio(false); setBioDraft(profile.bio); }}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                {profile.bio
                  ? <p className={styles.bio}>{profile.bio}</p>
                  : isOwnProfile && <p className={styles.bioEmpty}>Add a bio to introduce yourself.</p>
                }
                {isOwnProfile && (
                  <button className={styles.btnOutline} onClick={() => setEditingBio(true)}>
                    {profile.bio ? 'Edit bio' : '+ Add bio'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {profile.recentGames.length > 0 && (
          <section className={styles.section}>
            <h2>Recent games</h2>
            <ul className={styles.gameList}>
              {profile.recentGames.map(g => {
                const { text, cls } = label(g);
                const opponent = g.whitePlayer?.id === profile.id ? g.blackPlayer : g.whitePlayer;
                return (
                  <li key={g.id} className={styles.gameItem} onClick={() => navigate(`/game/${g.id}`)}>
                    <span className={`${styles.result} ${cls}`}>{text}</span>
                    <span className={styles.opponent}>
                      vs {opponent?.username ?? '?'}
                      {opponent?.isBot && <span className={styles.opponentBot}>BOT</span>}
                    </span>
                    <span className={styles.opponentElo}>{opponent?.eloRating}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
