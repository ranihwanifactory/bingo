
import React from 'react';
import { BingoCell } from '../types';

interface BingoBoardProps {
  cells: BingoCell[];
  onCellClick: (value: number) => void;
  status: string;
  playerColors: Record<string, string>;
}

const BingoBoard: React.FC<BingoBoardProps> = ({ cells, onCellClick, status, playerColors }) => {
  return (
    <div className="w-full aspect-square grid grid-cols-5 gap-2.5 p-3 sm:p-4 bg-white rounded-[2.5rem] sm:rounded-[3rem] shadow-[0_12px_0_#e2e8f0] border-4 border-[#FFD93D]">
      {cells.map((cell, idx) => {
        const isMarked = cell.isMarked;
        // 마킹한 사람의 색상을 표시하거나 기본 플레이어 색상 사용
        const color = cell.markedBy ? (playerColors[cell.markedBy] || '#4D96FF') : (playerColors['current'] || '#4D96FF');
        
        return (
          <button
            key={idx}
            disabled={status === 'won' || isMarked}
            onClick={() => onCellClick(cell.value)}
            className={`
              relative flex items-center justify-center text-2xl sm:text-4xl font-black rounded-xl sm:rounded-[1.2rem] transition-all duration-300
              ${isMarked 
                ? 'scale-95 text-white shadow-inner' 
                : 'bg-[#F0F7FF] text-[#4D96FF] hover:bg-blue-100 active:scale-90 shadow-[0_4px_0_#D0E7FF] sm:shadow-[0_6px_0_#D0E7FF]'
              }
              ${cell.isWinningCell ? 'ring-4 sm:ring-8 ring-[#FFD93D] z-10 animate-pulse' : ''}
            `}
            style={{ 
              backgroundColor: isMarked ? color : undefined,
              boxShadow: isMarked ? 'none' : undefined
            }}
          >
            {cell.value}
            {cell.isWinningCell && (
              <div className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 text-base sm:text-xl filter drop-shadow-md">⭐</div>
            )}
            {isMarked && (
              <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                <div className="w-3/4 h-3/4 border-2 sm:border-4 border-white rounded-full"></div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default BingoBoard;
