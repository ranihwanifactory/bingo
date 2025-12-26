
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BingoCell, GameStatus } from './types';
import { generateSeededBoard, getAICommentary } from './services/geminiService';
import { publishMark, subscribeToMatch } from './services/syncService';
import BingoBoard from './components/BingoBoard';
import { Trophy, RotateCcw, Play, Hash, MessageCircle, Globe } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [matchId, setMatchId] = useState<string>('');
  const [cells, setCells] = useState<BingoCell[]>([]);
  const [linesCount, setLinesCount] = useState<number>(0);
  const [commentary, setCommentary] = useState<string>("친구와 같은 코드를 입력해 실시간 대결을 시작하세요!");
  const [isSynced, setIsSynced] = useState(false);

  // 현재 보드 상태를 추적하기 위한 ref (클로저 문제 방지)
  const cellsRef = useRef<BingoCell[]>([]);
  cellsRef.current = cells;

  // 라인 체크 로직 (재사용)
  const calculateBingo = (board: BingoCell[]) => {
    const size = 5;
    const lines: number[][] = [];
    for (let i = 0; i < size; i++) {
      const row = Array.from({ length: size }, (_, j) => i * size + j);
      if (row.every(idx => board[idx].isMarked)) lines.push(row);
      const col = Array.from({ length: size }, (_, j) => j * size + i);
      if (col.every(idx => board[idx].isMarked)) lines.push(col);
    }
    const d1 = [0, 6, 12, 18, 24], d2 = [4, 8, 12, 16, 20];
    if (d1.every(idx => board[idx].isMarked)) lines.push(d1);
    if (d2.every(idx => board[idx].isMarked)) lines.push(d2);
    return { count: lines.length, winningIndices: new Set(lines.flat()) };
  };

  // 메시지 수신 시 보드 업데이트
  const applyRemoteMark = useCallback((value: number) => {
    const currentCells = cellsRef.current;
    // 이미 체크된 경우 무시
    const targetCell = currentCells.find(c => c.value === value);
    if (!targetCell || targetCell.isMarked) return;

    const newCells = currentCells.map(cell => 
      cell.value === value ? { ...cell, isMarked: true } : cell
    );

    const { count, winningIndices } = calculateBingo(newCells);
    const finalCells = newCells.map((c, i) => ({
      ...c,
      isWinningCell: winningIndices.has(i)
    }));

    setCells(finalCells);
    
    // 라인이 늘어났을 때 AI 멘트
    if (count > linesCount) {
      updateCommentary(count);
    }
    setLinesCount(count);

    if (count >= 5) setStatus('won');
  }, [linesCount]);

  const updateCommentary = async (count: number) => {
    const isWinner = count >= 5;
    const msg = await getAICommentary(count, isWinner);
    setCommentary(msg);
  };

  // 게임 시작 및 구독 설정
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (status === 'playing' && matchId) {
      setIsSynced(true);
      unsubscribe = subscribeToMatch(matchId, (payload) => {
        if (payload.action === 'mark') {
          applyRemoteMark(payload.value);
        }
      });
    } else {
      setIsSynced(false);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [status, matchId, applyRemoteMark]);

  const startGame = () => {
    if (!matchId.trim()) {
      alert("매치 코드를 입력해주세요!");
      return;
    }
    const values = generateSeededBoard(matchId.trim().toLowerCase());
    const initialBoard = values.map(v => ({ value: v, isMarked: false, isWinningCell: false }));
    setCells(initialBoard);
    setLinesCount(0);
    setStatus('playing');
    setCommentary(`[${matchId}] 방에서 실시간 동기화 중입니다. 숫자를 부르세요!`);
  };

  const handleCellClick = (val: number) => {
    if (status !== 'playing') return;
    
    // 이미 마킹된 경우 무시 (토글 방지 - 빙고는 한 번 칠하면 끝)
    const target = cells.find(c => c.value === val);
    if (target?.isMarked) return;

    // 1. 서버에 알림 (동기화 발신)
    publishMark(matchId, val);

    // 2. 내 화면 즉시 업데이트
    applyRemoteMark(val);
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#0f172a] text-white py-8 px-4 font-sans selection:bg-cyan-500/30">
      <header className="text-center mb-8 space-y-2">
        <h1 className="text-5xl md:text-7xl font-orbitron font-extrabold tracking-tighter neon-text uppercase">
          BINGO NEON
        </h1>
        <div className="flex items-center justify-center gap-4 text-cyan-400 font-bold tracking-widest text-xs">
          <span className="flex items-center gap-1"><Hash size={14} /> MULTI-SYNC</span>
          {status === 'playing' && (
            <span className={`flex items-center gap-1 ${isSynced ? 'text-green-400' : 'text-red-400'}`}>
              <Globe size={14} className={isSynced ? 'animate-pulse' : ''} /> 
              {isSynced ? 'LIVE SYNCED' : 'OFFLINE'}
            </span>
          )}
        </div>
      </header>

      <main className="w-full max-w-xl">
        {status === 'idle' ? (
          <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700 shadow-2xl space-y-8 animate-in fade-in zoom-in duration-500">
            <div className="space-y-4">
              <label className="block text-sm font-bold text-slate-400 uppercase tracking-widest">Match Code (친구와 같은 코드를 쓰세요)</label>
              <input 
                type="text" 
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
                placeholder="예: LUCK777"
                className="w-full bg-slate-900 border-2 border-slate-700 rounded-2xl px-6 py-4 text-2xl font-orbitron focus:border-cyan-500 focus:outline-none transition-all text-cyan-400 uppercase"
              />
            </div>
            
            <button 
              onClick={startGame}
              className="w-full py-5 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-black text-2xl rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
            >
              <Play fill="currentColor" size={28} /> 동기화 시작
            </button>
            
            <p className="text-center text-slate-500 text-sm italic">
              * 배포 후 각자의 기기에서 동일한 매치 코드로 접속하면 클릭이 서로 동기화됩니다.
            </p>
          </div>
        ) : (
          <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 flex flex-col items-center justify-center relative overflow-hidden group">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest z-10">Lines</span>
                <span className="text-4xl font-orbitron font-black text-pink-500 z-10">{linesCount} / 5</span>
                <div className="absolute inset-0 bg-pink-500/5 group-hover:bg-pink-500/10 transition-colors"></div>
              </div>
              <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700 flex flex-col items-center justify-center">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Room</span>
                <span className="text-xl font-orbitron font-bold text-cyan-400 uppercase truncate max-w-full px-2">{matchId}</span>
              </div>
            </div>

            <div className="bg-cyan-500/10 border-l-4 border-cyan-500 p-4 rounded-r-xl flex items-start gap-3 min-h-[80px]">
              <MessageCircle className="text-cyan-400 mt-1 flex-shrink-0" />
              <p className="text-slate-200 italic font-medium leading-tight">"{commentary}"</p>
            </div>

            <BingoBoard cells={cells} onCellClick={handleCellClick} status={status} />

            <div className="flex flex-col items-center gap-6 mt-8">
              {status === 'won' ? (
                <div className="text-center space-y-6 animate-bounce">
                  <h2 className="text-5xl font-orbitron font-black text-white neon-text">VICTORY!</h2>
                  <button 
                    onClick={() => setStatus('idle')}
                    className="px-10 py-4 bg-pink-500 text-white font-bold rounded-full shadow-lg hover:bg-pink-400 transition-all"
                  >
                    새 매치 만들기
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => { if(confirm("대결을 종료하시겠습니까?")) setStatus('idle'); }}
                  className="flex items-center gap-2 text-slate-500 hover:text-slate-300 transition-colors uppercase text-xs font-bold tracking-widest"
                >
                  <RotateCcw size={14} /> Exit Room
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      <div className="fixed inset-0 pointer-events-none -z-10 opacity-30">
        <div className="absolute top-1/3 -left-20 w-[500px] h-[500px] bg-cyan-900/40 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/3 -right-20 w-[500px] h-[500px] bg-pink-900/40 rounded-full blur-[120px]"></div>
      </div>
    </div>
  );
};

export default App;
