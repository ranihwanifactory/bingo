
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BingoCell, GameStatus, PlayerInfo } from './types';
import { sounds } from './services/soundService';
import { publishMessage, subscribeToMatch } from './services/syncService';
import { generateRandomBoard } from './services/geminiService';
import BingoBoard from './components/BingoBoard';
import { 
  Gamepad2, Sparkles, Trophy, 
  MessageCircle, RefreshCw, User as UserIcon, Users, Plus, X, Play, ArrowRight, Hash, LogIn
} from 'lucide-react';
import confetti from 'canvas-confetti';

const PLAYER_COLORS = ['#4D96FF', '#FF6B6B', '#6BCB77', '#FFD93D', '#917FB3', '#FF9F43'];

const getLocalUserId = () => {
  let id = localStorage.getItem('bingo_user_id');
  if (!id) {
    id = 'user_' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('bingo_user_id', id);
  }
  return id;
};

const App: React.FC = () => {
  const [localUser, setLocalUser] = useState<{ id: string; nickname: string } | null>(null);
  const [nicknameInput, setNicknameInput] = useState(localStorage.getItem('bingo_nickname') || '');
  const [roomId, setRoomId] = useState('');
  
  const [gameState, setGameState] = useState<'setup' | 'playing' | 'won'>('setup');
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [cells, setCells] = useState<BingoCell[]>([]);
  const [linesCount, setLinesCount] = useState(0);
  const [turnIdx, setTurnIdx] = useState(0);
  const [commentary, setCommentary] = useState("방에 입장하여 친구들을 기다리세요! 🌈");
  const [winners, setWinners] = useState<PlayerInfo[]>([]);

  const playersRef = useRef<PlayerInfo[]>([]);
  playersRef.current = players;
  const turnIdxRef = useRef(0);
  turnIdxRef.current = turnIdx;
  const cellsRef = useRef<BingoCell[]>([]);
  cellsRef.current = cells;

  useEffect(() => {
    const savedId = getLocalUserId();
    const savedNick = localStorage.getItem('bingo_nickname');
    if (savedNick) {
      setLocalUser({ id: savedId, nickname: savedNick });
    }
  }, []);

  const calculateBingo = (board: BingoCell[]) => {
    const size = 5;
    const lines: number[][] = [];
    for (let i = 0; i < size; i++) {
      const row = Array.from({ length: size }, (_, j) => i * size + j);
      if (row.every(idx => board[idx] && board[idx].isMarked)) lines.push(row);
      const col = Array.from({ length: size }, (_, j) => j * size + i);
      if (col.every(idx => board[idx] && board[idx].isMarked)) lines.push(col);
    }
    const d1 = [0, 6, 12, 18, 24], d2 = [4, 8, 12, 16, 20];
    if (d1.every(idx => board[idx] && board[idx].isMarked)) lines.push(d1);
    if (d2.every(idx => board[idx] && board[idx].isMarked)) lines.push(d2);
    return { count: lines.length, winningIndices: new Set(lines.flat()) };
  };

  const handleMarkAction = useCallback((value: number, senderId: string) => {
    const currentCells = [...cellsRef.current];
    const targetIdx = currentCells.findIndex(c => c.value === value);
    if (targetIdx === -1 || currentCells[targetIdx].isMarked) return;

    sounds.playPop();
    currentCells[targetIdx] = { ...currentCells[targetIdx], isMarked: true, markedBy: senderId };

    const { count, winningIndices } = calculateBingo(currentCells);
    const updatedCells = currentCells.map((c, i) => ({ ...c, isWinningCell: winningIndices.has(i) }));
    setCells(updatedCells);
    setLinesCount(count);

    // 턴 넘기기
    const nextIdx = (turnIdxRef.current + 1) % playersRef.current.length;
    setTurnIdx(nextIdx);
    
    const currentPlayer = playersRef.current[nextIdx];
    if (currentPlayer?.id === getLocalUserId()) {
      setCommentary("당신의 차례입니다! 숫자를 골라주세요! 🍎");
      sounds.playTurn();
    } else {
      setCommentary(`${currentPlayer?.name}님의 차례입니다... 🍵`);
    }

    // 승리 체크
    if (count >= 5) {
      // 나 자신이 승리했음을 알림 (다른 사람도 각자 체크하지만, 명시적으로 알릴 수도 있음)
      publishMessage(roomId, { action: 'win', playerId: getLocalUserId(), name: localUser?.nickname });
    }
  }, [roomId, localUser]);

  const joinGame = async () => {
    if (!nicknameInput.trim() || !roomId.trim()) return alert("닉네임과 방 번호를 입력해주세요!");
    
    const userId = getLocalUserId();
    localStorage.setItem('bingo_nickname', nicknameInput);
    setLocalUser({ id: userId, nickname: nicknameInput });
    
    // 내 개인 빙고판 생성
    const myBoard = generateRandomBoard();
    setCells(myBoard.map(v => ({ value: v, isMarked: false, isWinningCell: false })));
    setLinesCount(0);
    setPlayers([{ id: userId, name: nicknameInput, color: PLAYER_COLORS[0] }]);
    setTurnIdx(0);
    setGameState('playing');
    sounds.playJoin();

    // 방에 내 입장 알림
    publishMessage(roomId, { action: 'join', playerId: userId, name: nicknameInput });
  };

  useEffect(() => {
    let unsubscribe: () => void;
    if (gameState === 'playing' && roomId) {
      unsubscribe = subscribeToMatch(roomId, (payload) => {
        if (!payload || !payload.action) return;

        if (payload.action === 'join' || payload.action === 'presence') {
          setPlayers(prev => {
            if (prev.find(p => p.id === payload.playerId)) return prev;
            const newPlayers = [...prev, { 
              id: payload.playerId, 
              name: payload.name, 
              color: PLAYER_COLORS[prev.length % PLAYER_COLORS.length] 
            }].sort((a, b) => a.id.localeCompare(b.id)); // ID순 정렬하여 턴 순서 고정
            
            sounds.playJoin();
            // 새로 들어온 사람에게 내 존재를 알림
            if (payload.action === 'join') {
              publishMessage(roomId, { action: 'presence', playerId: getLocalUserId(), name: localUser?.nickname });
            }
            return newPlayers;
          });
        } else if (payload.action === 'mark') {
          handleMarkAction(payload.value, payload.playerId);
        } else if (payload.action === 'win') {
          setWinners(prev => {
            if (prev.find(w => w.id === payload.playerId)) return prev;
            return [...prev, { id: payload.playerId, name: payload.name, color: '#FF69B4' }];
          });
          setGameState('won');
          sounds.playWin();
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }
      });
    }
    return () => unsubscribe?.();
  }, [gameState, roomId, localUser, handleMarkAction]);

  const handleCellClick = (val: number) => {
    if (gameState !== 'playing' || players.length < 2) {
      if (players.length < 2) setCommentary("친구들을 기다리고 있어요... (최소 2명) 👥");
      return;
    }

    const isMyTurn = players[turnIdx]?.id === getLocalUserId();
    if (!isMyTurn) return;

    // 마킹 정보 브로드캐스트
    publishMessage(roomId, { action: 'mark', value: val, playerId: getLocalUserId() });
    handleMarkAction(val, getLocalUserId());
  };

  if (gameState === 'setup') {
    return (
      <div className="min-h-screen flex flex-col bg-[#FFF9E3] p-6 items-center justify-center">
        <div className="w-full max-w-md bg-white rounded-[3rem] shadow-[0_12px_0_#FFB3D9] border-4 border-[#FFD93D] p-8 animate__animated animate__fadeInDown">
          <div className="text-center mb-8">
            <div className="text-7xl mb-4 floating">🌈</div>
            <h1 className="text-4xl font-black text-[#FF69B4] tracking-tighter">팡팡 빙고!</h1>
            <p className="text-gray-400 font-bold mt-2">친구와 함께 실시간 빙고!</p>
          </div>

          <div className="space-y-4 mb-8">
            <div className="space-y-2">
              <label className="text-sm font-black text-gray-400 ml-2 uppercase">Your Name</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  className="w-full p-4 pl-12 bg-[#F0F7FF] border-2 border-[#4D96FF] rounded-2xl font-black text-lg outline-none"
                  placeholder="닉네임을 입력하세요"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-black text-gray-400 ml-2 uppercase">Room Number</label>
              <div className="relative">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  className="w-full p-4 pl-12 bg-[#FFF0F6] border-2 border-[#FF69B4] rounded-2xl font-black text-lg outline-none"
                  placeholder="방 번호를 입력하세요"
                />
              </div>
            </div>
          </div>

          <button 
            onClick={joinGame}
            className="w-full py-5 bg-[#FFD93D] text-[#4A4A4A] font-black text-2xl rounded-[1.5rem] shadow-[0_8px_0_#E5B700] active:translate-y-1 transition-all flex items-center justify-center gap-3"
          >
            입장하기 <LogIn size={24} />
          </button>
          <p className="text-[10px] text-center text-gray-300 font-black mt-4 uppercase">같은 방 번호를 입력하면 친구와 만날 수 있어요!</p>
        </div>
      </div>
    );
  }

  const turnPlayer = players[turnIdx];
  const isMyTurn = turnPlayer?.id === getLocalUserId();

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF9E3] text-[#4A4A4A] select-none safe-area-inset overflow-hidden">
      <main className="flex-1 flex flex-col items-center w-full max-w-2xl mx-auto py-4 px-4">
        
        {/* 상단: 현재 상태 및 플레이어 리스트 */}
        <header className="w-full flex flex-col gap-3 mb-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-[2rem] border-4 border-gray-50 shadow-sm">
            <div className="flex items-center gap-3">
              <div 
                className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-lg transition-transform ${isMyTurn ? 'animate-bounce' : ''}`}
                style={{ backgroundColor: turnPlayer?.color || '#ccc' }}
              >
                {turnPlayer?.name.charAt(0) || '?'}
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">CURRENT TURN</p>
                <h2 className="text-xl font-black text-gray-700">{isMyTurn ? "나의 차례! 🍎" : `${turnPlayer?.name}님 차례`}</h2>
              </div>
            </div>
            <div className="bg-[#FFF0F6] px-5 py-2 rounded-2xl border-2 border-pink-100 flex flex-col items-center">
              <span className="text-[10px] font-black text-pink-300 uppercase">MY LINES</span>
              <span className="text-2xl font-black text-[#FF69B4]">{linesCount} / 5</span>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {players.map((p, i) => (
              <div
                key={p.id}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 bg-white transition-all ${turnIdx === i ? 'border-[#FFD93D] shadow-md' : 'border-transparent opacity-60'}`}
              >
                <div className="w-5 h-5 rounded-lg flex items-center justify-center text-[8px] text-white" style={{ backgroundColor: p.color }}>
                  {p.name.charAt(0)}
                </div>
                <span className="text-xs font-black">{p.name}{p.id === getLocalUserId() && ' (나)'}</span>
              </div>
            ))}
          </div>
        </header>

        {/* 코멘트 */}
        <div className="w-full bg-white/90 backdrop-blur-sm p-4 rounded-[1.5rem] border-2 border-dashed border-[#FFD93D] flex items-center gap-3 mb-4">
          <div className="bg-[#FFD93D] p-2 rounded-full text-white">
            <MessageCircle size={18} fill="white" />
          </div>
          <p className="text-sm font-bold text-gray-600 truncate">"{commentary}"</p>
        </div>

        {/* 메인 빙고판 (초대형) */}
        <div className="flex-1 w-full flex flex-col items-center justify-center relative">
          <div className={`w-full max-w-md transition-opacity duration-300 ${!isMyTurn ? 'opacity-70' : 'opacity-100'}`}>
            <BingoBoard 
              cells={cells} 
              onCellClick={handleCellClick} 
              status={gameState} 
              playerColors={{'current': isMyTurn ? turnPlayer.color : '#4D96FF'}} 
            />
          </div>
          
          {!isMyTurn && gameState === 'playing' && players.length >= 2 && (
            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
              <div className="bg-white/80 px-6 py-3 rounded-2xl shadow-xl border-4 border-gray-100 backdrop-blur-sm">
                <p className="font-black text-gray-400">다른 플레이어의 선택을 기다려요...</p>
              </div>
            </div>
          )}

          {players.length < 2 && (
             <div className="absolute inset-0 flex items-center justify-center z-20 bg-white/40 backdrop-blur-[2px]">
              <div className="bg-white p-8 rounded-[2rem] border-4 border-dashed border-[#4D96FF] text-center shadow-2xl animate-pulse">
                <Users size={48} className="mx-auto mb-4 text-[#4D96FF]" />
                <h3 className="text-xl font-black text-gray-700 mb-1">친구를 기다리는 중...</h3>
                <p className="text-sm font-bold text-gray-400">방 번호 <span className="text-[#FF69B4] underline">#{roomId}</span>를 알려주세요!</p>
              </div>
             </div>
          )}
        </div>

        {/* 하단: 나가기 버튼 */}
        <button 
          onClick={() => confirm("정말 게임을 나갈까요?") && setGameState('setup')}
          className="mt-6 text-gray-300 hover:text-red-400 font-black text-sm uppercase tracking-tighter"
        >
          Exit Game
        </button>

        {/* 승리 팝업 */}
        {gameState === 'won' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-md p-6">
            <div className="bg-white w-full max-w-sm p-10 rounded-[4rem] border-8 border-[#FFD93D] text-center animate__animated animate__jackInTheBox shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-[#FF69B4] via-[#FFD93D] to-[#4D96FF]"></div>
              <div className="text-7xl mb-6">🏆</div>
              <h3 className="text-4xl font-black text-[#FF69B4] mb-2">BINGO!</h3>
              <div className="space-y-1 mb-8">
                {winners.map(w => (
                  <p key={w.id} className="text-xl font-black text-gray-700">
                    <span className="text-[#FF69B4]">{w.name}</span>님이 승리했습니다!
                  </p>
                ))}
              </div>
              <button 
                onClick={() => setGameState('setup')} 
                className="w-full py-5 bg-[#FFD93D] rounded-[2rem] font-black text-2xl shadow-[0_8px_0_#E5B700] active:translate-y-1 transition-all"
              >
                로비로 돌아가기
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
