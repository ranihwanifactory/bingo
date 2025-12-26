
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BingoCell, GameStatus } from './types';
import { generateSeededBoard, getAICommentary } from './services/geminiService';
import { publishMessage, subscribeToMatch } from './services/syncService';
import BingoBoard from './components/BingoBoard';
import { Trophy, RotateCcw, Play, Hash, MessageCircle, Globe, User, Users, Download } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [matchId, setMatchId] = useState<string>('');
  const [cells, setCells] = useState<BingoCell[]>([]);
  const [linesCount, setLinesCount] = useState<number>(0);
  const [commentary, setCommentary] = useState<string>("친구와 같은 코드를 입력해 실시간 턴제 대결을 시작하세요!");
  const [isSynced, setIsSynced] = useState(false);
  const [players, setPlayers] = useState<string[]>([]);
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0);
  const [myId] = useState(() => {
    const saved = localStorage.getItem('bingo_player_id');
    if (saved) return saved;
    const newId = 'P-' + Math.random().toString(36).substr(2, 4).toUpperCase();
    localStorage.setItem('bingo_player_id', newId);
    return newId;
  });

  const cellsRef = useRef<BingoCell[]>([]);
  cellsRef.current = cells;
  const playersRef = useRef<string[]>([]);
  playersRef.current = players;

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

  const applyRemoteMark = useCallback((value: number, nextTurnIdx: number) => {
    const currentCells = cellsRef.current;
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
    setCurrentTurnIdx(nextTurnIdx);
    
    if (count > linesCount) {
      updateAICommentary(count);
    }
    setLinesCount(count);
    if (count >= 5) setStatus('won');
  }, [linesCount]);

  const updateAICommentary = async (count: number) => {
    const isWinner = count >= 5;
    const msg = await getAICommentary(count, isWinner);
    setCommentary(msg);
  };

  // 실시간 메시지 처리
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (status === 'playing' && matchId) {
      setIsSynced(true);
      unsubscribe = subscribeToMatch(matchId, (payload) => {
        if (payload.action === 'join') {
          // 새로운 플레이어 입장 알림을 받으면 내 ID도 다시 전송하여 서로를 인지
          if (!playersRef.current.includes(payload.playerId)) {
            setPlayers(prev => [...prev, payload.playerId].sort());
            publishMessage(matchId, { action: 'presence', playerId: myId });
          }
        } else if (payload.action === 'presence') {
          if (!playersRef.current.includes(payload.playerId)) {
            setPlayers(prev => [...prev, payload.playerId].sort());
          }
        } else if (payload.action === 'mark') {
          applyRemoteMark(payload.value, payload.nextTurnIdx);
        }
      });

      // 입장 즉시 나를 알림
      publishMessage(matchId, { action: 'join', playerId: myId });
    }

    return () => {
      if (unsubscribe) unsubscribe();
      setPlayers([]);
      setCurrentTurnIdx(0);
    };
  }, [status, matchId, myId, applyRemoteMark]);

  const startGame = () => {
    if (!matchId.trim()) return alert("매치 코드를 입력하세요!");
    const values = generateSeededBoard(matchId.trim().toLowerCase());
    setCells(values.map(v => ({ value: v, isMarked: false, isWinningCell: false })));
    setLinesCount(0);
    setPlayers([myId]);
    setStatus('playing');
  };

  const handleCellClick = (val: number) => {
    if (status !== 'playing') return;
    
    // 내 차례인지 확인
    const isMyTurn = players[currentTurnIdx] === myId;
    if (!isMyTurn) {
      setCommentary("상대방의 차례입니다! 조금만 기다려주세요.");
      return;
    }

    const target = cells.find(c => c.value === val);
    if (target?.isMarked) return;

    const nextTurnIdx = (currentTurnIdx + 1) % players.length;

    // 동기화 메시지 발송
    publishMessage(matchId, { 
      action: 'mark', 
      value: val, 
      nextTurnIdx,
      senderId: myId 
    });

    // 로컬 업데이트
    applyRemoteMark(val, nextTurnIdx);
  };

  const isMyTurn = players.length > 0 && players[currentTurnIdx] === myId;

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#0f172a] text-white py-6 px-4 font-sans">
      <header className="text-center mb-6 space-y-1">
        <h1 className="text-4xl md:text-6xl font-orbitron font-extrabold neon-text uppercase tracking-tighter">
          BINGO NEON
        </h1>
        <div className="flex items-center justify-center gap-3 text-[10px] font-bold tracking-widest text-cyan-400 opacity-80">
          <span className="flex items-center gap-1"><User size={12}/> ID: {myId}</span>
          <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
          <span className="flex items-center gap-1"><Users size={12}/> PLAYERS: {players.length}</span>
        </div>
      </header>

      <main className="w-full max-w-md space-y-4">
        {status === 'idle' ? (
          <div className="bg-slate-800/40 p-6 rounded-3xl border border-slate-700 shadow-2xl space-y-6">
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Room Match Code</label>
              <input 
                type="text" 
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
                placeholder="예: BINGO123"
                className="w-full bg-slate-900/80 border-2 border-slate-700 rounded-2xl px-5 py-4 text-xl font-orbitron focus:border-cyan-500 focus:outline-none transition-all text-cyan-400 uppercase"
              />
            </div>
            
            <button 
              onClick={startGame}
              className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-black text-xl rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Play fill="currentColor" size={20} /> 대결 시작하기
            </button>

            <div className="pt-4 border-t border-slate-700/50">
              <p className="text-[11px] text-slate-500 text-center mb-4 leading-relaxed">
                * 동일한 코드로 접속한 플레이어들과 순서대로 번호를 누르는 턴제 게임입니다.<br/>
                * 아래 버튼을 눌러 앱으로 설치하면 더 쾌적하게 즐길 수 있습니다.
              </p>
              <button 
                onClick={() => window.dispatchEvent(new Event('beforeinstallprompt'))}
                className="w-full py-2 border border-slate-600 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:border-white transition-all flex items-center justify-center gap-2"
              >
                <Download size={14} /> 홈 화면에 앱 설치하기
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
            {/* Turn Indicator */}
            <div className={`p-4 rounded-2xl border-2 transition-all duration-500 flex items-center justify-between ${isMyTurn ? 'bg-cyan-500/20 border-cyan-400 active-turn-glow' : 'bg-slate-800/60 border-slate-700'}`}>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Current Turn</span>
                <span className={`text-lg font-orbitron font-bold ${isMyTurn ? 'text-cyan-400' : 'text-white'}`}>
                  {isMyTurn ? 'YOUR TURN (나)' : `${players[currentTurnIdx] || 'Waiting...'}`}
                </span>
              </div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isMyTurn ? 'bg-cyan-500 shadow-[0_0_15px_#22d3ee]' : 'bg-slate-700 text-slate-500'}`}>
                {isMyTurn ? <Play fill="black" size={20} /> : <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse"></div>}
              </div>
            </div>

            <div className="bg-slate-800/40 p-3 rounded-xl flex items-center gap-3 text-xs italic text-slate-300 border border-slate-700/50">
              <MessageCircle size={14} className="text-cyan-400 shrink-0" />
              <p className="line-clamp-2">"{commentary}"</p>
            </div>

            <BingoBoard cells={cells} onCellClick={handleCellClick} status={status} />

            <div className="flex items-center justify-between px-2">
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 uppercase font-black">Match Code</span>
                <span className="text-sm font-orbitron font-bold text-slate-300">{matchId}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-slate-500 uppercase font-black">My Progress</span>
                <span className="text-sm font-orbitron font-bold text-pink-500">{linesCount} / 5 Lines</span>
              </div>
            </div>

            <div className="flex justify-center pt-2">
              {status === 'won' ? (
                <div className="text-center space-y-4">
                  <h2 className="text-4xl font-orbitron font-black text-white neon-text animate-bounce">WINNER!</h2>
                  <button onClick={() => setStatus('idle')} className="px-8 py-3 bg-pink-500 text-white font-black rounded-full shadow-lg">REMATCH</button>
                </div>
              ) : (
                <button onClick={() => confirm("게임을 종료할까요?") && setStatus('idle')} className="text-[10px] font-bold text-slate-600 hover:text-slate-400 flex items-center gap-1 uppercase tracking-widest">
                  <RotateCcw size={10} /> Leave Match
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="mt-auto pt-8 text-[9px] text-slate-700 font-bold tracking-widest uppercase">
        &copy; 2024 NEON BINGO ENGINE • REAL-TIME SYNC
      </footer>
    </div>
  );
};

export default App;
