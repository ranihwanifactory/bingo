
import React from 'react';
import { BingoCell } from '../types';

interface BingoBoardProps {
  cells: BingoCell[];
  onCellClick: (value: number) => void;
  status: string;
}

const BingoBoard: React.FC<BingoBoardProps> = ({ cells, onCellClick, status }) => {
  return (
    <div className="w-full max-w-md mx-auto aspect-square grid grid-cols-5 gap-2 p-3 bg-slate-800/40 rounded-2xl border border-slate-700/50 shadow-2xl">
      {cells.map((cell, idx) => (
        <button
          key={idx}
          disabled={status === 'won'}
          onClick={() => onCellClick(cell.value)}
          className={`
            relative flex items-center justify-center p-1 text-xl md:text-2xl font-orbitron font-bold rounded-xl transition-all duration-300
            ${cell.isMarked 
              ? 'bg-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.5)] scale-95' 
              : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600 active:scale-90'
            }
            ${cell.isWinningCell ? 'ring-4 ring-pink-500 shadow-[0_0_25px_rgba(236,72,153,0.8)] animate-pulse' : ''}
          `}
        >
          {cell.value}
          {cell.isMarked && (
            <div className="absolute inset-0 border-2 border-cyan-300/40 rounded-xl pointer-events-none"></div>
          )}
        </button>
      ))}
    </div>
  );
};

export default BingoBoard;
