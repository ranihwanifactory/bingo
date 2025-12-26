
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getAICommentary = async (lines: number, isWinner: boolean): Promise<string> => {
  try {
    const prompt = isWinner 
      ? `초등학생용 빙고 게임에서 플레이어가 우승했어요! 아주아주 신나고 귀여운 말투로 칭찬해주세요. (이모지 포함, 1문장)`
      : `초등학생용 빙고 게임에서 플레이어가 ${lines}줄을 완성했어요! 다음 줄을 기대하게 만드는 귀엽고 다정한 응원을 해주세요. (이모지 포함, 1문장)`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { maxOutputTokens: 100 }
    });

    return response.text || "와아! 정말 대단한 실력이에요! 🌟";
  } catch (error) {
    return "우리 친구, 조금만 더 힘내요! 할 수 있어요! 화이팅! 🎈";
  }
};

/**
 * 각 플레이어마다 완전히 다른 보드 배열을 가질 수 있도록 
 * 시드 없이 무작위 셔플을 수행합니다.
 */
export const generateRandomBoard = (): number[] => {
  const nums = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  return nums;
};
