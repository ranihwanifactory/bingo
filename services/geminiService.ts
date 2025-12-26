
export const generateRandomBoard = (): number[] => {
  const nums = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  return nums;
};

export const getAICommentary = async (lines: number, isWinner: boolean): Promise<string> => {
  if (isWinner) return "우와아아! 빙고 완성! 당신이 최고예요! 👑";
  if (lines > 0) return `${lines}줄이나 완성했어요! 조금만 더 힘내봐요! 🔥`;
  return "어떤 숫자를 고를지 정말 기대돼요! 🌟";
};
