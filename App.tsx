
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BingoCell, GameStatus, PlayerInfo, UserRanking } from './types';
import { generateRandomBoard, getAICommentary } from './services/geminiService';
import { publishMessage, subscribeToMatch } from './services/syncService';
import { sounds } from './services/soundService';
import { loginAnonymously, updateUserInfo, recordWin, getTopRankings, auth } from './services/firebaseService';
import BingoBoard from './components/BingoBoard';
import { Play, MessageCircle, User as UserIcon, Users, Download, PartyPopper, LogOut, Sparkles, BellRing, Trophy, Medal, X } from 'lucide-react';
import confetti from 'canvas-confetti';

const PLAYER_COLORS = ['#FF6B6B', '#4D96FF', '#6BCB77', '#FFD93D', '#917FB3', '#FF9F43'];

const App: React.FC = () => {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [matchId, setMatchId] = useState<string>('');
  const [nickname, setNickname] = useState<string>(() => localStorage.getItem('bingo_nickname') || '');
  const [cells, setCells] = useState<BingoCell[]>([]);
  const [linesCount, setLinesCount] = useState<number>(0);
  const [commentary, setCommentary] = useState<string>("친구랑 같이 모여서 즐거운 빙고 한 판! 🎈");
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0);
  const [showRanking, setShowRanking] = useState(false);
  const [rankings, setRankings] = useState<UserRanking[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const cellsRef = useRef<BingoCell[]>([]);
  cellsRef.current = cells;
  const playersRef = useRef<PlayerInfo[]>([]);
  playersRef.current = players;
  const gameEndedRef = useRef(false);

  useEffect(() => {
    // Firebase 익명 로그인
    loginAnonymously().then(cred => {
      setCurrentUser(cred.user);
    }).catch(err => console.error("Firebase Login Error", err));
  }, []);

  const fetchRankings = async () => {
    const data = await getTopRankings(5);
    setRankings(data);
    setShowRanking(true);
  };

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

  const applyRemoteMark = useCallback((value: number, nextTurnIdx: number, senderId: string) => {
    const currentCells = cellsRef.current;
    const targetCell = currentCells.find(c => c.value === value);
    if (!targetCell || targetCell.isMarked) return;

    sounds.playPop();

    const newCells = currentCells.map(cell => 
      cell.value === value ? { ...cell, isMarked: true, markedBy: senderId } : cell
    );

    const { count, winningIndices } = calculateBingo(newCells);
    const finalCells = newCells.map((c, i) => ({
      ...c,
      isWinningCell: winningIndices.has(i)
    }));

    setCells(finalCells);
    setCurrentTurnIdx(nextTurnIdx);
    
    const nextPlayer = playersRef.current[nextTurnIdx];
    if (nextPlayer?.id === currentUser?.uid) {
      sounds.playTurn();
    }

    if (count > linesCount) {
      sounds.playWin();
      updateAICommentary(count);
    }
    setLinesCount(count);

    if (count >= 5 && !gameEndedRef.current) {
      gameEndedRef.current = true;
      setStatus('won');
      sounds.playWin();
      confetti({ particleCount: 200, spread: 80, origin: { y: 0.6 } });
      
      // 승리한 사람이 나일 경우에만 DB 업데이트
      if (senderId === currentUser?.uid) {
        recordWin(currentUser.uid).catch(console.error);
      }
    }
  }, [linesCount, currentUser]);

  const updateAICommentary = async (count: number) => {
    const isWinner = count >= 5;
    const msg = await getAICommentary(count, isWinner);
    setCommentary(msg);
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    if (status === 'playing' && matchId && currentUser) {
      unsubscribe = subscribeToMatch(matchId, (payload) => {
        if (payload.action === 'join' || payload.action === 'presence') {
          setPlayers(prev => {
            if (prev.find(p => p.id === payload.playerId)) return prev;
            sounds.playJoin();
            const newPlayers = [...prev, { id: payload.playerId, name: payload.name, color: PLAYER_COLORS[prev.length % PLAYER_COLORS.length] }]
              .sort((a, b) => a.id.localeCompare(b.id));
            
            if (payload.action === 'join') {
              publishMessage(matchId, { action: 'presence', playerId: currentUser.uid, name: nickname });
            }
            return newPlayers;
          });
        } else if (payload.action === 'mark') {
          applyRemoteMark(payload.value, payload.nextTurnIdx, payload.senderId);
        }
      });
      publishMessage(matchId, { action: 'join', playerId: currentUser.uid, name: nickname });
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [status, matchId, currentUser, nickname, applyRemoteMark]);

  const startGame = async () => {
    if (!nickname.trim()) return alert("친구들이 부를 이름을 알려주세요! 😊");
    if (!matchId.trim()) return alert("같이 할 방 번호를 적어주세요! 🏠");
    if (!currentUser) return alert("잠시만 기다려주세요! (로그인 중)");
    
    localStorage.setItem('bingo_nickname', nickname);
    await updateUserInfo(currentUser.uid, nickname);

    // 각 플레이어마다 무작위로 다른 숫자 배열을 생성합니다.
    const values = generateRandomBoard();
    setCells(values.map(v => ({ value: v, isMarked: false, isWinningCell: false })));
    setLinesCount(0);
    setPlayers([{ id: currentUser.uid, name: nickname, color: PLAYER_COLORS[0] }]);
    gameEndedRef.current = false;
    setStatus('playing');
    sounds.playJoin();
    setCommentary(`${nickname} 친구 반가워요! 게임을 시작해볼까요?`);
  };

  const handleCellClick = (val: number) => {
    if (status !== 'playing') return;
    const isMyTurn = players.length > 0 && players[currentTurnIdx]?.id === currentUser?.uid;
    if (!isMyTurn) {
      setCommentary("지금은 친구 차례예요! 조금만 기다려줄래요? 🙏");
      return;
    }
    const target = cells.find(c => c.value === val);
    if (target?.isMarked) return;

    const nextTurnIdx = (currentTurnIdx + 1) % players.length;
    publishMessage(matchId, { action: 'mark', value: val, nextTurnIdx, senderId: currentUser.uid });
    applyRemoteMark(val, nextTurnIdx, currentUser.uid);
  };

  const currPlayer = players[currentTurnIdx];
  const isMyTurn = currPlayer?.id === currentUser?.uid;
  const playerColorsMap = players.reduce((acc, p) => ({ ...acc, [p.id]: p.color }), {});

  return (
    <div className="min-h-screen flex flex-col items-center py-6 px-4 bg-[#FFF9E3]">
      <header className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Sparkles className="text-[#FFD93D] animate-pulse" fill="#FFD93D"/>
          <h1 className="text-4xl font-black text-[#FF69B4] tracking-tight animate__animated animate__bounceInDown" style={{ WebkitTextStroke: '1.5px white' }}>
            우당탕탕! 팡팡 빙고
          </h1>
          <Sparkles className="text-[#FFD93D] animate-pulse" fill="#FFD93D"/>
        </div>
        <button onClick={fetchRankings} className="flex items-center gap-1 mx-auto bg-white px-3 py-1 rounded-full shadow-sm text-[10px] font-bold text-[#FF8E9E] hover:scale-105 transition-transform">
          <Trophy size={12}/> 명예의 전당 보기
        </button>
      </header>

      <main className="w-full max-w-md">
        {status === 'idle' ? (
          <div className="bg-white p-8 rounded-[3rem] shadow-[0_12px_0_#FFB3D9] border-4 border-[#FFD93D] space-y-6 animate__animated animate__fadeInUp">
            <div className="text-center">
               <div className="w-20 h-20 bg-[#FFF9E3] rounded-full mx-auto flex items-center justify-center text-4xl mb-2 shadow-inner">🎮</div>
               <p className="text-lg font-black text-gray-700">새로운 게임 만들기</p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-black text-[#FF6B6B] ml-2 flex items-center gap-1">
                  <UserIcon size={14}/> 내 이름 (별명)
                </label>
                <input 
                  type="text" 
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="예: 용감한사자"
                  className="w-full bg-[#FFF9E3] border-3 border-[#FFD93D] rounded-2xl px-5 py-4 text-xl focus:outline-none transition-all placeholder:text-gray-300 bubble-shadow"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-black text-[#4D96FF] ml-2 flex items-center gap-1">
                  <Users size={14}/> 비밀 방 번호
                </label>
                <input 
                  type="text" 
                  value={matchId}
                  onChange={(e) => setMatchId(e.target.value)}
                  placeholder="예: 1234"
                  className="w-full bg-[#EBF3FF] border-3 border-[#4D96FF] rounded-2xl px-5 py-4 text-xl focus:outline-none transition-all placeholder:text-gray-300 bubble-shadow"
                />
              </div>
            </div>
            
            <button 
              onClick={startGame}
              className="w-full py-5 bg-[#FFD93D] hover:bg-[#FFC300] text-[#4A4A4A] font-black text-2xl rounded-2xl shadow-[0_8px_0_#E5B700] transition-all active:translate-y-1 active:shadow-none flex items-center justify-center gap-3"
            >
              <Play fill="currentColor" size={24} /> 게임 시작하기!
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`p-4 rounded-3xl border-4 transition-all duration-300 flex items-center justify-between ${isMyTurn ? 'bg-[#FFEB3B]/30 border-[#FFD93D] my-turn-active animate__animated animate__pulse animate__infinite' : 'bg-white border-gray-100 shadow-md'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-lg transform transition-transform ${isMyTurn ? 'rotate-12 scale-110' : ''}`} style={{ backgroundColor: currPlayer?.color }}>
                  {isMyTurn ? '🦁' : '👤'}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Current Turn</p>
                    {isMyTurn && <BellRing size={10} className="text-[#FF69B4] animate-bounce"/>}
                  </div>
                  <p className="text-xl font-black text-gray-700">
                    {isMyTurn ? <span className="text-[#FF69B4]">내 차례예요! ✨</span> : <span>{currPlayer?.name || '기다려요...'}</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="bg-gray-100 px-3 py-1 rounded-full flex items-center gap-1 mb-2">
                   <Users size={12} className="text-gray-400"/>
                   <span className="text-[10px] font-black text-gray-500">{players.length}명 대결 중</span>
                </div>
                <div className="flex -space-x-3">
                   {players.map(p => (
                     <div key={p.id} className="w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[10px] text-white font-bold" style={{ backgroundColor: p.color }}>
                       {p.name[0]}
                     </div>
                   ))}
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border-2 border-[#FFD93D] text-sm font-bold text-gray-600 flex gap-3 items-center shadow-sm relative">
              <div className="bg-[#FFF9E3] p-2 rounded-xl"><MessageCircle size={20} className="text-[#FFD93D]"/></div>
              <p className="flex-1 italic leading-tight">"{commentary}"</p>
            </div>

            <BingoBoard cells={cells} onCellClick={handleCellClick} status={status} playerColors={playerColorsMap} />

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-4 rounded-3xl border-3 border-pink-100 flex flex-col items-center shadow-sm overflow-hidden relative">
                <div className="absolute top-0 right-0 w-8 h-8 bg-pink-50 rounded-bl-full flex items-center justify-center">🎉</div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">My Bingo</span>
                <span className="text-3xl font-black text-[#FF69B4]">{linesCount} / 5</span>
              </div>
              <div className="bg-white p-4 rounded-3xl border-3 border-blue-100 flex flex-col items-center shadow-sm overflow-hidden relative">
                <div className="absolute top-0 right-0 w-8 h-8 bg-blue-50 rounded-bl-full flex items-center justify-center">🔑</div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Room Code</span>
                <span className="text-2xl font-black text-[#4D96FF]">{matchId}</span>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              {status === 'won' ? (
                <div className="text-center space-y-4 p-6 bg-white rounded-[3rem] border-4 border-[#FFD93D] shadow-xl animate__animated animate__jackInTheBox w-full">
                  <div className="text-6xl mb-2">🏆</div>
                  <h2 className="text-4xl font-black text-[#FF69B4]" style={{ WebkitTextStroke: '1px white' }}>와아! 우승이에요!</h2>
                  <p className="text-gray-500 font-bold">{players.find(p => p.id === players[currentTurnIdx]?.id)?.name} 친구 축하해요!</p>
                  <button onClick={() => setStatus('idle')} className="w-full px-10 py-5 bg-[#FFD93D] text-[#4A4A4A] font-black text-xl rounded-2xl shadow-[0_6px_0_#E5B700] hover:translate-y-1 hover:shadow-none transition-all flex items-center justify-center gap-2">
                    <PartyPopper size={24}/> 다시 한 판 더!
                  </button>
                </div>
              ) : (
                <button onClick={() => confirm("정말 게임을 그만할까요?") && setStatus('idle')} className="flex items-center gap-2 text-gray-400 hover:text-[#FF6B6B] transition-colors text-xs font-bold uppercase tracking-widest bg-white/50 px-4 py-2 rounded-full">
                  <LogOut size={12} /> 게임 나가기
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Ranking Modal */}
      {showRanking && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate__animated animate__fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[3rem] border-4 border-[#FFD93D] shadow-2xl p-8 relative animate__animated animate__zoomIn">
            <button onClick={() => setShowRanking(false)} className="absolute top-6 right-6 p-2 bg-[#F0F4F8] rounded-full text-gray-400 hover:text-gray-600">
              <X size={20}/>
            </button>
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">🏅</div>
              <h3 className="text-2xl font-black text-[#4A4A4A]">빙고 왕 랭킹</h3>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Hall of Fame</p>
            </div>
            <div className="space-y-3">
              {rankings.map((rank, index) => (
                <div key={rank.uid} className={`flex items-center justify-between p-4 rounded-2xl border-2 ${index === 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${index === 0 ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-500'}`}>
                      {index + 1}
                    </div>
                    <p className="font-black text-[#4A4A4A]">{rank.nickname}</p>
                    {index === 0 && <Medal size={16} className="text-yellow-500"/>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xl font-black text-[#FF69B4]">{rank.wins}</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Wins</span>
                  </div>
                </div>
              ))}
              {rankings.length === 0 && <p className="text-center text-gray-400 py-4 font-bold">아직 랭킹 정보가 없어요!</p>}
            </div>
            <button onClick={() => setShowRanking(false)} className="w-full mt-6 py-4 bg-[#FFD93D] text-[#4A4A4A] font-black rounded-2xl shadow-[0_4px_0_#E5B700] active:translate-y-1 active:shadow-none transition-all">
              닫기
            </button>
          </div>
        </div>
      )}

      <footer className="mt-auto pt-12 text-[10px] text-gray-400 font-bold tracking-widest text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
           <div className="w-4 h-4 rounded-full bg-pink-200"></div>
           <div className="w-4 h-4 rounded-full bg-yellow-200"></div>
           <div className="w-4 h-4 rounded-full bg-blue-200"></div>
        </div>
        FRIENDS BINGO • HALL OF FAME ENABLED ✨
      </footer>
    </div>
  );
};

export default App;
