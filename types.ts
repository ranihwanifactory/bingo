
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
  photoURL?: string;
  h2hRecord?: {
    myWins: number;
    opponentWins: number;
  };
}

export interface UserRanking {
  uid: string;
  nickname: string;
  wins: number;
  photoURL?: string;
}

export interface H2HRecord {
  [uid: string]: number | string[]; // UID별 승리 횟수 및 playerIds 배열
  playerIds: string[];
}
