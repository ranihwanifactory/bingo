
export interface BingoCell {
  value: number;
  isMarked: boolean;
  isWinningCell: boolean;
  markedBy?: string;
}

export type GameStatus = 'idle' | 'playing' | 'won';

export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
}

export interface UserRanking {
  uid: string;
  nickname: string;
  wins: number;
}
