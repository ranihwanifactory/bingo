
export interface BingoCell {
  value: number;
  isMarked: boolean;
  isWinningCell: boolean;
  markedBy?: string; // 누가 이 숫자를 눌렀는지 (플레이어 ID)
}

export type GameStatus = 'idle' | 'playing' | 'won';

export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
}
