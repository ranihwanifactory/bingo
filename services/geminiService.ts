
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getAICommentary = async (lines: number, isWinner: boolean): Promise<string> => {
  try {
    const prompt = isWinner 
      ? `The player just completed 5 lines and won Bingo! Give a very short, explosive victory shout in Korean.`
      : `The player just completed ${lines} lines in Bingo. Give a very short, witty 1-sentence encouragement in Korean.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { maxOutputTokens: 60 }
    });

    return response.text || "대단해요! 계속 가세요!";
  } catch (error) {
    return "빙고를 향해 달립시다!";
  }
};

// Simple seeded shuffle to ensure same matchId results in same board
export const generateSeededBoard = (seed: string): number[] => {
  const nums = Array.from({ length: 25 }, (_, i) => i + 1);
  
  // Use matchId string to create a simple hash for seeding
  let seedNum = 0;
  for (let i = 0; i < seed.length; i++) {
    seedNum += seed.charCodeAt(i);
  }

  const seededRandom = () => {
    seedNum = (seedNum * 9301 + 49297) % 233280;
    return seedNum / 233280;
  };

  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  return nums;
};
