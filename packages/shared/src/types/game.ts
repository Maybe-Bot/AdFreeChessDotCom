export type Color = 'white' | 'black';
export type GameStatus = 'waiting' | 'active' | 'completed' | 'abandoned';
export type GameResult = 'white' | 'black' | 'draw' | null;
export type GameEndReason = 'checkmate' | 'resignation' | 'draw_agreement' | 'stalemate' | 'timeout' | null;

export interface GameSummary {
  id: string;
  whitePlayer: { id: number; username: string; eloRating: number; isBot: boolean } | null;
  blackPlayer: { id: number; username: string; eloRating: number; isBot: boolean } | null;
  status: GameStatus;
  result: GameResult;
  endReason: GameEndReason;
  createdAt: string;
  updatedAt: string;
}

export interface GameState extends GameSummary {
  pgn: string;
  fen: string;
  drawOfferedBy: Color | null;
}

export interface MovePayload {
  from: string;
  to: string;
  promotion?: string;
}
