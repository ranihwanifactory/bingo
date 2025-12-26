
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  wins: number;
  losses: number;
  gamesPlayed: number;
}

export enum RoomStatus {
  WAITING = 'WAITING',
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED'
}

export interface PlayerInfo {
  uid: string;
  displayName: string;
  photoURL?: string;
  ready: boolean;
  isHost: boolean;
  bingoCount: number;
}

export interface Room {
  id: string;
  hostId: string;
  status: RoomStatus;
  players: PlayerInfo[];
  selectedNumbers: number[];
  turnIndex: number;
  winner?: string | null;
  createdAt: number;
}

export interface PlayerBoard {
  uid: string;
  grid: number[][]; // 5x5
}
