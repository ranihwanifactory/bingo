
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
    <div className="w-full max-w-sm mx-auto aspect-square grid grid-cols-5 gap-3 p-4 bg-white rounded-[2.5rem] shadow-[0_12px_0_#e2e8f0] border-4 border-[#FFD93D]">
      {cells.map((cell, idx) => {
        const markerColor = cell.markedBy ? playerColors[cell.markedBy] || '#FF6B6B' : 'transparent';
        
        return (
          <button
            key={idx}
            disabled={status === 'won'}
            onClick={() => onCellClick(cell.value)}
            className={`
              relative flex items-center justify-center text-2xl font-black rounded-2xl transition-all duration-200 bubble-shadow
              ${cell.isMarked 
                ? 'scale-90 text-white animate__animated animate__pulse' 
                : 'bg-[#F0F4F8] text-[#546E7A] hover:bg-[#E2E8F0] active:translate-y-1'
              }
              ${cell.isWinningCell ? 'ring-4 ring-yellow-400 z-10' : ''}
            `}
            style={{ 
              backgroundColor: cell.isMarked ? markerColor : undefined,
              boxShadow: cell.isMarked ? `0 4px 0 rgba(0,0,0,0.2)` : undefined
            }}
          >
            {cell.value}
            {cell.isWinningCell && (
              <div className="absolute -top-1 -right-1 text-xs">⭐</div>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default BingoBoard;
