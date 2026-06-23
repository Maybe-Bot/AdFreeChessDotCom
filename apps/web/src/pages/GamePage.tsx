import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import type { ServerMessage, GameState, Color } from '@chess/shared';
import { useAuth } from '../context/AuthContext';
import { useBoardTheme, BOARD_THEMES } from '../hooks/useBoardTheme';
import styles from './GamePage.module.css';

export default function GamePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { theme, themeKey, setTheme } = useBoardTheme();

  const wsRef = useRef<WebSocket | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [chess] = useState(() => new Chess());
  const [drawOffered, setDrawOffered] = useState(false);
  const [drawOfferFrom, setDrawOfferFrom] = useState<Color | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const myColor: Color | null = game
    ? game.whitePlayer?.id === user?.id ? 'white'
    : game.blackPlayer?.id === user?.id ? 'black'
    : null
    : null;

  const isMyTurn = game?.status === 'active' && myColor
    ? (chess.turn() === 'w' ? 'white' : 'black') === myColor
    : false;

  function wsSend(msg: object) {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !id) return;

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'game:auth', token }));
      ws.send(JSON.stringify({ type: 'game:join', gameId: id }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as ServerMessage;
      switch (msg.type) {
        case 'game:state':
        case 'game:move_made':
        case 'game:ended':
          handleGameUpdate(msg.state);
          break;
        case 'game:draw_offered':
          setDrawOfferFrom(msg.by);
          setDrawOffered(true);
          break;
        case 'game:draw_declined':
          setDrawOffered(false);
          setDrawOfferFrom(null);
          break;
        case 'game:error':
          setError(msg.message);
          break;
      }
    };

    ws.onerror = () => setError('Connection error');

    return () => ws.close();
  }, [id]);

  function handleGameUpdate(state: GameState) {
    setGame(state);
    if (state.pgn) {
      chess.loadPgn(state.pgn);
    } else {
      chess.reset();
    }
    if (state.status === 'active') {
      setDrawOffered(false);
      setDrawOfferFrom(null);
    }
  }

  function onDrop(sourceSquare: string, targetSquare: string, piece: string) {
    if (!isMyTurn) return false;

    const promotion = piece[1]?.toLowerCase() === 'p' && (targetSquare[1] === '8' || targetSquare[1] === '1')
      ? 'q'
      : undefined;

    try {
      const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: promotion ?? 'q' });
      if (!move) return false;
    } catch {
      return false;
    }

    wsSend({ type: 'game:move', from: sourceSquare, to: targetSquare, ...(promotion ? { promotion } : {}) });
    return true;
  }

  function copyInviteLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const statusText = () => {
    if (!game) return 'Loading…';
    if (game.status === 'waiting') return 'Waiting for opponent — share the link below';
    if (game.status === 'completed') {
      if (game.result === 'draw') return `Draw by ${game.endReason?.replace('_', ' ')}`;
      const winner = game.result === 'white' ? game.whitePlayer?.username : game.blackPlayer?.username;
      return `${winner} wins by ${game.endReason?.replace('_', ' ')}`;
    }
    if (!isMyTurn) return `${game.whitePlayer?.username ?? '?'}'s turn (${chess.turn() === 'w' ? 'White' : 'Black'})`;
    return 'Your turn';
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.backLink}>← Lobby</Link>
        <span className={styles.gameId}>Game {id?.slice(0, 8)}</span>
        <div className={styles.themePicker}>
          {Object.entries(BOARD_THEMES).map(([key, t]) => (
            <button
              key={key}
              className={`${styles.themeSwatch} ${themeKey === key ? styles.themeSwatchActive : ''}`}
              style={{ background: `linear-gradient(135deg, ${t.light} 50%, ${t.dark} 50%)` }}
              title={t.name}
              onClick={() => setTheme(key)}
            />
          ))}
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.playerBar}>
          <PlayerBadge
            player={myColor === 'black' ? game?.whitePlayer : game?.blackPlayer}
            color={myColor === 'black' ? 'white' : 'black'}
            active={chess.turn() === (myColor === 'black' ? 'w' : 'b') && game?.status === 'active'}
          />
        </div>

        <div className={styles.boardWrap}>
          <Chessboard
            id="main-board"
            position={chess.fen()}
            onPieceDrop={onDrop}
            boardOrientation={myColor ?? 'white'}
            arePiecesDraggable={isMyTurn}
            customDarkSquareStyle={{ backgroundColor: theme.dark }}
            customLightSquareStyle={{ backgroundColor: theme.light }}
          />
        </div>

        <div className={styles.playerBar}>
          <PlayerBadge
            player={myColor === 'black' ? game?.blackPlayer : game?.whitePlayer}
            color={myColor ?? 'white'}
            active={chess.turn() === (myColor === 'black' ? 'b' : 'w') && game?.status === 'active'}
          />
        </div>

        <p className={`${styles.status} ${game?.status === 'completed' ? styles.completed : ''}`}>
          {statusText()}
        </p>

        {error && <p className={styles.error}>{error}</p>}

        {game?.status === 'waiting' && (
          <button className={styles.btnOutline} onClick={copyInviteLink}>
            {copied ? 'Copied!' : 'Copy invite link'}
          </button>
        )}

        {game?.status === 'active' && myColor && (
          <div className={styles.actions}>
            {!drawOffered && (
              <>
                <button className={styles.btnOutline} onClick={() => wsSend({ type: 'game:offer_draw' })}>
                  Offer draw
                </button>
                <button className={styles.btnDanger} onClick={() => {
                  if (confirm('Resign this game?')) wsSend({ type: 'game:resign' });
                }}>
                  Resign
                </button>
              </>
            )}
            {drawOffered && drawOfferFrom !== myColor && (
              <div className={styles.drawOffer}>
                <span>Opponent offers a draw</span>
                <button className={styles.btnPrimary} onClick={() => wsSend({ type: 'game:accept_draw' })}>Accept</button>
                <button className={styles.btnOutline} onClick={() => wsSend({ type: 'game:decline_draw' })}>Decline</button>
              </div>
            )}
            {drawOffered && drawOfferFrom === myColor && (
              <p className={styles.drawPending}>Draw offer sent — waiting for response…</p>
            )}
          </div>
        )}

        {game?.status === 'completed' && (
          <button className={styles.btnPrimary} onClick={() => navigate('/')}>
            Back to lobby
          </button>
        )}
      </main>
    </div>
  );
}

function PlayerBadge({
  player,
  color,
  active,
}: {
  player: { username: string; eloRating: number; isBot: boolean } | null | undefined;
  color: Color;
  active: boolean;
}) {
  return (
    <div className={`${styles.playerBadge} ${active ? styles.activeTurn : ''}`}>
      <span className={`${styles.colorDot} ${color === 'white' ? styles.dotWhite : styles.dotBlack}`} />
      <span className={styles.playerName}>
        {player?.username ?? 'Waiting…'}
        {player?.isBot && <span className={styles.botBadge}>BOT</span>}
      </span>
      {player && <span className={styles.playerElo}>{player.eloRating}</span>}
    </div>
  );
}
