
import { UserRanking } from "../types";

// API가 필요 없는 게임을 위해 Firebase 기능을 비활성화합니다.
export const getUserProfile = async (uid: string): Promise<UserRanking | null> => {
  return null;
};

export const updateUserInfo = async (uid: string, nickname: string) => {
  // 로컬 저장소만 사용
  localStorage.setItem('bingo_nickname', nickname);
};

export const recordWin = async (uid: string) => {
  // 로컬 전용 앱에서는 사용하지 않음
};

export const getTopRankings = async (count: number = 10): Promise<UserRanking[]> => {
  return [];
};
