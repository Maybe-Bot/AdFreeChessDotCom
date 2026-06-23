import type { GameState, Color } from './game.js';

// Messages sent client → server
export type ClientMessage =
  | { type: 'game:auth'; token: string }
  | { type: 'game:join'; gameId: string }
  | { type: 'game:move'; from: string; to: string; promotion?: string }
  | { type: 'game:resign' }
  | { type: 'game:offer_draw' }
  | { type: 'game:accept_draw' }
  | { type: 'game:decline_draw' };

// Messages sent server → client
export type ServerMessage =
  | { type: 'game:state'; state: GameState }
  | { type: 'game:move_made'; state: GameState }
  | { type: 'game:ended'; state: GameState }
  | { type: 'game:draw_offered'; by: Color }
  | { type: 'game:draw_declined' }
  | { type: 'game:error'; message: string };
