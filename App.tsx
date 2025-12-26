
import React, { useState, useCallback } from 'react';
import { BingoCell, GameStatus } from './types';
import { generateSeededBoard, getAICommentary } from './services/geminiService';
import BingoBoard from './components/BingoBoard';
import { Trophy, RotateCcw, Play, Hash, MessageCircle } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [matchId, setMatchId] = useState<string>('');
  const [cells, setCells] = useState<BingoCell[]>([]);
  const [linesCount, setLinesCount] = useState<number>(0);
  const [commentary, setCommentary] = useState<string>("친구와 같은 코드를 입력해 대결해보세요!");

  const checkLines = (board: BingoCell[]) => {
    const size = 5;
    const lines: number[][] = [];
    
    // Rows & Columns
    for (let i = 0; i < size; i++) {
      const row = Array.from({ length: size }, (_, j) => i * size + j);
      if (row.every(idx => board[idx].isMarked)) lines.push(row);
      
      const col = Array.from({ length: size }, (_, j) => j * size + i);
      if (col.every(idx => board[idx].isMarked)) lines.push(col);
    }
    
    // Diagonals
    const d1 = [0, 6, 12, 18, 24], d2 = [4, 8, 12, 16, 20];
    if (d1.every(idx => board[idx].isMarked)) lines.push(d1);
    if (d2.every(idx => board[idx].isMarked)) lines.push(d2);

    return { count: lines.length, winningIndices: new Set(lines.flat()) };
  };

  const startGame = () => {
    if (!matchId.trim()) {
      alert("매치 코드를 입력해주세요!");
      return;
    }
    const values = generateSeededBoard(matchId.trim().toLowerCase());
    setCells(values.map(v => ({ value: v, isMarked: false, isWinningCell: false })));
    setLinesCount(0);
    setStatus('playing');
    setCommentary(`${matchId} 번 방에 입장했습니다! 5줄을 완성하세요.`);
  };

  const handleCellClick = async (val: number) => {
    if (status !== 'playing') return;

    const newCells = cells.map(cell => 
      cell.value === val ? { ...cell, isMarked: !cell.isMarked } : cell
    );

    const { count, winningIndices } = checkLines(newCells);
    const finalCells = newCells.map((c, i) => ({
      ...c,
      isWinningCell: winningIndices.has(i)
    }));

    setCells(finalCells);
    
    if (count > linesCount) {
      const isWinner = count >= 5;
      if (isWinner) setStatus('won');
      const msg = await getAICommentary(count, isWinner);
      setCommentary(msg);
    }
    
    setLinesCount(count);
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#0f172a] text-white py-8 px-4 font-sans selection:bg-cyan-500/30">
      {/* Header */}
      <header className="text-center mb-10 space-y-2">
        <h1 className="text-5xl md:text-7xl font-orbitron font-extrabold tracking-tighter neon-text uppercase">
          BINGO NEON
        </h1>
        <div className="flex items-center justify-center gap-2 text-cyan-400 font-bold tracking-widest text-sm">
          <Hash size={16} /> SEEDED MULTIPLAYER MODE
        </div>
      </header>

      <main className="w-full max-w-xl">
        {status === 'idle' ? (
          <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700 shadow-2xl space-y-8 animate-in fade-in zoom-in duration-500">
            <div className="space-y-4">
              <label className="block text-sm font-bold text-slate-400 uppercase tracking-widest">Match Code (친구와 똑같이 입력하세요)</label>
              <input 
                type="text" 
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
                placeholder="예: BINGO123"
                className="w-full bg-slate-900 border-2 border-slate-700 rounded-2xl px-6 py-4 text-2xl font-orbitron focus:border-cyan-500 focus:outline-none transition-all text-cyan-400 uppercase"
              />
            </div>
            
            <button 
              onClick={startGame}
              className="w-full py-5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-black text-2xl rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
            >
              <Play fill="currentColor" size={28} /> 입장하기
            </button>
            
            <p className="text-center text-slate-500 text-sm italic">
              * 동일한 매치 코드를 입력하면 모든 플레이어가 동일한 숫자판으로 게임을 시작합니다.
            </p>
          </div>
        ) : (
          <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500">
            {/* HUD */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 flex flex-col items-center justify-center relative overflow-hidden group">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest z-10">Lines Completed</span>
                <span className="text-4xl font-orbitron font-black text-pink-500 z-10">{linesCount} / 5</span>
                <div className="absolute inset-0 bg-pink-500/5 group-hover:bg-pink-500/10 transition-colors"></div>
              </div>
              <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 flex flex-col items-center justify-center">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Match ID</span>
                <span className="text-xl font-orbitron font-bold text-cyan-400 uppercase truncate max-w-full px-2">{matchId}</span>
              </div>
            </div>

            {/* Commentary */}
            <div className="bg-cyan-500/10 border-l-4 border-cyan-500 p-4 rounded-r-xl flex items-start gap-3">
              <MessageCircle className="text-cyan-400 mt-1 flex-shrink-0" />
              <p className="text-slate-200 italic font-medium">"{commentary}"</p>
            </div>

            {/* Board */}
            <BingoBoard cells={cells} onCellClick={handleCellClick} status={status} />

            {/* Controls */}
            <div className="flex flex-col items-center gap-6 mt-8">
              {status === 'won' ? (
                <div className="text-center space-y-6 animate-bounce">
                  <h2 className="text-5xl font-orbitron font-black text-white neon-text">BINGO!</h2>
                  <button 
                    onClick={() => setStatus('idle')}
                    className="px-10 py-4 bg-pink-500 text-white font-bold rounded-full shadow-lg hover:bg-pink-400 transition-all"
                  >
                    새로운 게임 시작
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => { if(confirm("방을 나가시겠습니까?")) setStatus('idle'); }}
                  className="flex items-center gap-2 text-slate-500 hover:text-slate-300 transition-colors uppercase text-xs font-bold tracking-widest"
                >
                  <RotateCcw size={14} /> Exit Match
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Decorative Background */}
      <div className="fixed inset-0 pointer-events-none -z-10 opacity-30">
        <div className="absolute top-1/3 -left-20 w-[500px] h-[500px] bg-cyan-900/40 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/3 -right-20 w-[500px] h-[500px] bg-pink-900/40 rounded-full blur-[120px]"></div>
      </div>
    </div>
  );
};

export default App;
