
export interface BingoCell {
  value: number;
  isMarked: boolean;
  isWinningCell: boolean;
}

export type GameStatus = 'idle' | 'playing' | 'won';

export interface GameState {
  board: BingoCell[];
  linesCount: number;
  matchId: string;
}
