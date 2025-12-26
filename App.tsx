
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BingoCell, GameStatus, PlayerInfo, UserRanking } from './types';
import { generateRandomBoard, getAICommentary } from './services/geminiService';
import { publishMessage, subscribeToMatch } from './services/syncService';
import { sounds } from './services/soundService';
import { 
  auth, 
  loginWithGoogle, 
  loginWithEmail,
  logout, 
  updateUserInfo, 
  recordWin, 
  getTopRankings 
} from './services/firebaseService';
import { onAuthStateChanged, User } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import BingoBoard from './components/BingoBoard';
import { 
  Play, MessageCircle, User as UserIcon, Users, 
  LogOut, Sparkles, BellRing, Trophy, Medal, X, 
  LogIn, Mail, ShieldCheck, Gamepad2, Download
} from 'lucide-react';
import confetti from 'canvas-confetti';

const PLAYER_COLORS = ['#FF6B6B', '#4D96FF', '#6BCB77', '#FFD93D', '#917FB3', '#FF9F43'];

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [status, setStatus] = useState<GameStatus>('idle');
  const [matchId, setMatchId] = useState<string>('');
  const [cells, setCells] = useState<BingoCell[]>([]);
  const [linesCount, setLinesCount] = useState<number>(0);
  const [commentary, setCommentary] = useState<string>("친구들과 함께하는 신나는 빙고 타임! 🌈");
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0);
  const [showRanking, setShowRanking] = useState(false);
  const [rankings, setRankings] = useState<UserRanking[]>([]);
  
  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Login states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isEmailLogin, setIsEmailLogin] = useState(false);

  const playersRef = useRef<PlayerInfo[]>([]);
  playersRef.current = players;
  const cellsRef = useRef<BingoCell[]>([]);
  cellsRef.current = cells;
  const currentTurnIdxRef = useRef(0);
  currentTurnIdxRef.current = currentTurnIdx;
  const gameEndedRef = useRef(false);

  // Sync turn and board for late joiners
  const syncState = useCallback(() => {
    // Only the first player in the sorted list (the "host") broadcasts the state
    if (playersRef.current.length > 0 && playersRef.current[0].id === user?.uid) {
      const markedValues = cellsRef.current
        .filter(c => c.isMarked)
        .map(c => ({ value: c.value, senderId: c.markedBy }));
      
      publishMessage(matchId, {
        action: 'sync_state',
        markedValues,
        currentTurnIdx: currentTurnIdxRef.current
      });
    }
  }, [matchId, user]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        updateUserInfo(u.uid, u.displayName || u.email?.split('@')[0] || "빙고 마스터", u.photoURL || "");
      }
    });

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    return unsub;
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    }
  };

  const fetchRankings = async () => {
    const data = await getTopRankings(10);
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

  const handleMarkAction = useCallback((value: number, senderId: string) => {
    const currentCells = [...cellsRef.current];
    const targetIdx = currentCells.findIndex(c => c.value === value);
    if (targetIdx === -1 || currentCells[targetIdx].isMarked) return;

    sounds.playPop();
    currentCells[targetIdx] = { ...currentCells[targetIdx], isMarked: true, markedBy: senderId };

    const { count, winningIndices } = calculateBingo(currentCells);
    const finalCells = currentCells.map((c, i) => ({
      ...c,
      isWinningCell: winningIndices.has(i)
    }));

    setCells(finalCells);
    
    // Crucially: Rotate turn consistently for everyone based on the sorted players list
    const currentPlayers = playersRef.current;
    if (currentPlayers.length > 0) {
      const lastPlayerIdx = currentPlayers.findIndex(p => p.id === senderId);
      if (lastPlayerIdx !== -1) {
        const nextIdx = (lastPlayerIdx + 1) % currentPlayers.length;
        setCurrentTurnIdx(nextIdx);
        if (currentPlayers[nextIdx].id === user?.uid) {
          sounds.playTurn();
        }
      }
    }

    if (count > linesCount) {
      sounds.playWin();
      getAICommentary(count, count >= 5).then(setCommentary);
    }
    setLinesCount(count);

    if (count >= 5 && !gameEndedRef.current) {
      gameEndedRef.current = true;
      setStatus('won');
      sounds.playWin();
      confetti({ particleCount: 200, spread: 80, origin: { y: 0.6 } });
      if (senderId === user?.uid) {
        recordWin(user.uid).catch(console.error);
      }
    }
  }, [linesCount, user]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    if (status === 'playing' && matchId && user) {
      unsubscribe = subscribeToMatch(matchId, (payload) => {
        if (payload.action === 'join' || payload.action === 'presence') {
          setPlayers(prev => {
            if (prev.find(p => p.id === payload.playerId)) return prev;
            
            // Re-sort players by ID to ensure turn order is identical across clients
            const newPlayers = [...prev, { 
              id: payload.playerId, 
              name: payload.name, 
              photoURL: payload.photoURL,
              color: PLAYER_COLORS[prev.length % PLAYER_COLORS.length] 
            }].sort((a, b) => a.id.localeCompare(b.id));

            sounds.playJoin();
            
            if (payload.action === 'join') {
              // Send my presence back to new joiner
              publishMessage(matchId, { 
                action: 'presence', 
                playerId: user.uid, 
                name: user.displayName || user.email?.split('@')[0],
                photoURL: user.photoURL
              });
              // Briefly delay sync to allow joiner to receive presence messages first
              setTimeout(syncState, 800);
            }
            return newPlayers;
          });
        } else if (payload.action === 'mark') {
          handleMarkAction(payload.value, payload.senderId);
        } else if (payload.action === 'sync_state') {
          // Sync state for players who joined late
          const markedVals = payload.markedValues as {value: number, senderId: string}[];
          let updatedCells = [...cellsRef.current];
          markedVals.forEach(mv => {
            const idx = updatedCells.findIndex(c => c.value === mv.value);
            if (idx !== -1) updatedCells[idx] = { ...updatedCells[idx], isMarked: true, markedBy: mv.senderId };
          });
          const { count, winningIndices } = calculateBingo(updatedCells);
          setCells(updatedCells.map((c, i) => ({ ...c, isWinningCell: winningIndices.has(i) })));
          setLinesCount(count);
          setCurrentTurnIdx(payload.currentTurnIdx);
        }
      });
      
      // Notify others I'm joining
      publishMessage(matchId, { 
        action: 'join', 
        playerId: user.uid, 
        name: user.displayName || user.email?.split('@')[0],
        photoURL: user.photoURL
      });
    }
    return () => unsubscribe?.();
  }, [status, matchId, user, handleMarkAction, syncState]);

  const startGame = async () => {
    if (!matchId.trim()) return alert("방 번호를 입력해주세요! 🏠");
    if (!user) return alert("로그인이 필요합니다!");

    const values = generateRandomBoard();
    setCells(values.map(v => ({ value: v, isMarked: false, isWinningCell: false })));
    setLinesCount(0);
    setPlayers([{ 
      id: user.uid, 
      name: user.displayName || user.email?.split('@')[0] || "마스터", 
      photoURL: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
      color: PLAYER_COLORS[0] 
    }]);
    setCurrentTurnIdx(0);
    gameEndedRef.current = false;
    setStatus('playing');
    sounds.playJoin();
    setCommentary("친구들을 기다리고 있어요. 방 번호를 친구에게 알려주세요!");
  };

  const handleCellClick = (val: number) => {
    if (status !== 'playing') return;
    if (players.length < 2) {
      setCommentary("혼자서는 빙고를 할 수 없어요! 친구를 기다려주세요. 👥");
      return;
    }
    
    const isMyTurn = players[currentTurnIdx]?.id === user?.uid;
    if (!isMyTurn) {
      setCommentary("지금은 내 순서가 아니에요. 친구의 선택을 기다려봐요! 🍵");
      return;
    }
    
    const target = cells.find(c => c.value === val);
    if (target?.isMarked) return;

    publishMessage(matchId, { action: 'mark', value: val, senderId: user?.uid });
    handleMarkAction(val, user?.uid || "");
  };

  const onEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await loginWithEmail(email, password);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (authLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FFF9E3] gap-4">
      <div className="animate-bounce text-6xl">✨</div>
      <p className="font-black text-gray-400">데이터를 불러오는 중...</p>
    </div>
  );

  const activePlayer = players[currentTurnIdx];
  const isMyTurn = activePlayer?.id === user?.uid;

  return (
    <div className="min-h-screen flex flex-col items-center py-6 px-4 bg-[#FFF9E3]">
      <header className="text-center mb-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="text-[#FFD93D]" fill="#FFD93D"/>
            <h1 className="text-3xl font-black text-[#FF69B4] tracking-tight">팡팡 빙고</h1>
          </div>
          <div className="flex gap-2">
            {deferredPrompt && (
              <button onClick={handleInstall} className="p-2 bg-white rounded-full shadow-sm text-blue-500 hover:bg-blue-50">
                <Download size={16}/>
              </button>
            )}
            {user && (
              <button onClick={() => logout()} className="p-2 bg-white rounded-full shadow-sm text-gray-400 hover:text-[#FF6B6B]">
                <LogOut size={16}/>
              </button>
            )}
          </div>
        </div>
        
        <button onClick={fetchRankings} className="flex items-center gap-2 mx-auto bg-white px-4 py-2 rounded-full shadow-md text-xs font-black text-[#FF8E9E] hover:scale-105 transition-all border-2 border-[#FFD93D]">
          <Trophy size={14}/> 명예의 전당 (실시간 랭킹)
        </button>
      </header>

      <main className="w-full max-w-md">
        {!user ? (
          <div className="bg-white p-8 rounded-[3rem] shadow-[0_12px_0_#FFB3D9] border-4 border-[#FFD93D] text-center space-y-6 animate__animated animate__fadeInUp">
            <div className="space-y-2">
               <div className="w-20 h-20 bg-[#FFF9E3] rounded-full mx-auto flex items-center justify-center text-5xl shadow-inner border-2 border-dashed border-[#FFD93D]">🧸</div>
               <h2 className="text-2xl font-black text-gray-700">로그인하고 시작해요!</h2>
               <p className="text-gray-400 text-sm font-bold leading-tight">확실한 친구 구분을 위해 <br/>로그인이 꼭 필요해요.</p>
            </div>
            
            {isEmailLogin ? (
              <form onSubmit={onEmailLogin} className="space-y-4 animate__animated animate__fadeIn">
                <input 
                  type="email" 
                  placeholder="이메일" 
                  className="w-full bg-gray-50 border-3 border-gray-100 p-4 rounded-3xl focus:border-[#4D96FF] outline-none font-black"
                  value={email} onChange={e => setEmail(e.target.value)} required
                />
                <input 
                  type="password" 
                  placeholder="비밀번호" 
                  className="w-full bg-gray-50 border-3 border-gray-100 p-4 rounded-3xl focus:border-[#4D96FF] outline-none font-black"
                  value={password} onChange={e => setPassword(e.target.value)} required
                />
                <button type="submit" className="w-full py-4 bg-[#4D96FF] text-white font-black rounded-3xl shadow-[0_6px_0_#3B7EDF] active:translate-y-1 active:shadow-none transition-all">로그인 / 가입하기</button>
                <button type="button" onClick={() => setIsEmailLogin(false)} className="text-xs text-gray-400 font-bold hover:underline">다른 방법으로 로그인하기</button>
              </form>
            ) : (
              <div className="space-y-3">
                <button 
                  onClick={() => loginWithGoogle()}
                  className="w-full py-4 bg-white border-3 border-gray-100 rounded-3xl shadow-[0_6px_0_#f0f0f0] hover:shadow-md transition-all flex items-center justify-center gap-4 group active:translate-y-1 active:shadow-none"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google"/>
                  <span className="text-lg font-black text-gray-600">Google 로그인</span>
                </button>
                <button 
                  onClick={() => setIsEmailLogin(true)}
                  className="w-full py-4 bg-white border-3 border-gray-100 rounded-3xl shadow-[0_6px_0_#f0f0f0] hover:shadow-md transition-all flex items-center justify-center gap-4 active:translate-y-1 active:shadow-none"
                >
                  <Mail className="text-gray-400" size={24}/>
                  <span className="text-lg font-black text-gray-600">이메일 로그인</span>
                </button>
              </div>
            )}
          </div>
        ) : status === 'idle' ? (
          <div className="bg-white p-8 rounded-[3rem] shadow-[0_12px_0_#FFB3D9] border-4 border-[#FFD93D] space-y-6 animate__animated animate__fadeInUp">
            <div className="flex items-center gap-4 bg-[#FFF9E3] p-4 rounded-3xl border-2 border-dashed border-[#FFD93D]">
               <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} className="w-16 h-16 rounded-2xl border-4 border-white shadow-md" alt="Me"/>
               <div className="flex-1 overflow-hidden">
                  <p className="text-[10px] font-black text-[#FF6B6B] uppercase tracking-widest">Bingo Master</p>
                  <p className="text-xl font-black text-gray-700 truncate">{user.displayName || user.email?.split('@')[0]}님</p>
               </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-black text-[#4D96FF] ml-2 flex items-center gap-1">
                <ShieldCheck size={14}/> 비밀 방 번호 (친구와 공유하세요)
              </label>
              <input 
                type="text" 
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
                placeholder="예: 1234"
                className="w-full bg-[#EBF3FF] border-3 border-[#4D96FF] rounded-2xl px-5 py-4 text-xl font-black focus:outline-none transition-all placeholder:text-gray-300 bubble-shadow"
              />
            </div>
            
            <button 
              onClick={startGame}
              className="w-full py-5 bg-[#FFD93D] hover:bg-[#FFC300] text-[#4A4A4A] font-black text-2xl rounded-2xl shadow-[0_8px_0_#E5B700] transition-all active:translate-y-1 active:shadow-none flex items-center justify-center gap-3"
            >
              <Gamepad2 size={24} /> 방 입장 / 시작하기
            </button>
          </div>
        ) : (
          <div className="space-y-4 animate__animated animate__fadeIn">
            {/* Real-time Turn Indicator */}
            <div className={`p-4 rounded-3xl border-4 transition-all duration-500 flex items-center justify-between ${isMyTurn ? 'bg-[#FFEB3B]/40 border-[#FFD93D] shadow-[0_0_20px_#FFD93D] animate__animated animate__pulse animate__infinite' : 'bg-white border-gray-100 shadow-md'}`}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img src={activePlayer?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${activePlayer?.id}`} className={`w-14 h-14 rounded-2xl shadow-lg border-2 border-white transition-all duration-300 ${isMyTurn ? 'rotate-12 scale-110' : 'opacity-60 scale-90'}`} style={{ backgroundColor: activePlayer?.color || '#eee' }} />
                  {isMyTurn && <div className="absolute -top-1 -right-1 bg-[#FF69B4] text-white p-1 rounded-full shadow-md"><BellRing size={10} className="animate-bounce"/></div>}
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Current Turn</p>
                  <p className="text-xl font-black text-gray-700">
                    {isMyTurn ? <span className="text-[#FF69B4]">내 차례예요! ✨</span> : <span>{activePlayer?.name || "기다리는 중..."}</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="bg-gray-100 px-3 py-1 rounded-full flex items-center gap-1 mb-2">
                   <Users size={12} className="text-gray-400"/>
                   <span className="text-[10px] font-black text-gray-500">{players.length}명 대결 중</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border-2 border-[#FFD93D] text-sm font-bold text-gray-600 flex gap-3 items-center shadow-sm">
              <div className="bg-[#FFF9E3] p-2 rounded-xl flex-shrink-0"><MessageCircle size={20} className="text-[#FFD93D]"/></div>
              <p className="flex-1 italic leading-tight text-xs">"{commentary}"</p>
            </div>

            <BingoBoard 
              cells={cells} 
              onCellClick={handleCellClick} 
              status={status} 
              playerColors={players.reduce((acc, p) => ({ ...acc, [p.id]: p.color }), {})} 
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-4 rounded-3xl border-3 border-pink-100 flex flex-col items-center shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-8 h-8 bg-pink-50 rounded-bl-full flex items-center justify-center">🎈</div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">완성한 줄</span>
                <span className="text-3xl font-black text-[#FF69B4]">{linesCount} / 5</span>
              </div>
              <div className="bg-white p-4 rounded-3xl border-3 border-blue-100 flex flex-col items-center shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-8 h-8 bg-blue-50 rounded-bl-full flex items-center justify-center">🏠</div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">방 번호</span>
                <span className="text-2xl font-black text-[#4D96FF]">{matchId}</span>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              {status === 'won' ? (
                <div className="text-center space-y-4 p-6 bg-white rounded-[3rem] border-4 border-[#FFD93D] shadow-xl animate__animated animate__jackInTheBox w-full z-20">
                  <div className="text-6xl mb-2">🏆</div>
                  <h2 className="text-4xl font-black text-[#FF69B4]">축하해요! 우승!</h2>
                  <p className="text-gray-500 font-bold">{activePlayer?.name}님이 빙고 5줄을 완성했어요!</p>
                  <button onClick={() => setStatus('idle')} className="w-full px-10 py-5 bg-[#FFD93D] text-[#4A4A4A] font-black text-xl rounded-2xl shadow-[0_6px_0_#E5B700] hover:translate-y-1 hover:shadow-none transition-all flex items-center justify-center gap-2">
                    다시 한 판 하러가기
                  </button>
                </div>
              ) : (
                <button onClick={() => confirm("게임을 종료하고 나갈까요?") && setStatus('idle')} className="flex items-center gap-2 text-gray-400 hover:text-[#FF6B6B] transition-colors text-xs font-black uppercase tracking-widest bg-white/50 px-4 py-2 rounded-full">
                  <LogOut size={12} /> 게임 나가기
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Rankings Modal */}
      {showRanking && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate__animated animate__fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[3rem] border-4 border-[#FFD93D] shadow-2xl p-8 relative animate__animated animate__zoomIn">
            <button onClick={() => setShowRanking(false)} className="absolute top-6 right-6 p-2 bg-[#F0F4F8] rounded-full text-gray-400 hover:text-gray-600 transition-colors">
              <X size={20}/>
            </button>
            <div className="text-center mb-6">
              <div className="text-5xl mb-2 floating">🏅</div>
              <h3 className="text-2xl font-black text-[#4A4A4A]">빙고 왕 순위</h3>
              <p className="text-xs text-gray-400 font-black uppercase tracking-widest italic">Hall of Fame</p>
            </div>
            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-2">
              {rankings.map((rank, index) => (
                <div key={rank.uid} className={`flex items-center justify-between p-3 rounded-2xl border-2 transition-all ${index === 0 ? 'bg-yellow-50 border-yellow-300 scale-105 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-90'}`}>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img src={rank.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${rank.uid}`} className="w-10 h-10 rounded-xl border-2 border-white shadow-sm bg-white" />
                      <div className={`absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] text-white ${index === 0 ? 'bg-yellow-400' : 'bg-gray-400'}`}>
                        {index + 1}
                      </div>
                    </div>
                    <p className="font-black text-[#4A4A4A] truncate max-w-[120px]">{rank.nickname}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xl font-black text-[#FF69B4]">{rank.wins}</span>
                    <span className="text-[8px] font-black text-gray-400 uppercase">WINS</span>
                  </div>
                </div>
              ))}
              {rankings.length === 0 && <p className="text-center py-8 text-gray-300 font-black">아직 승리 기록이 없어요!</p>}
            </div>
            <button onClick={() => setShowRanking(false)} className="w-full mt-6 py-4 bg-[#FFD93D] text-[#4A4A4A] font-black rounded-2xl shadow-[0_4px_0_#E5B700] active:translate-y-1 active:shadow-none transition-all">
              순위표 닫기
            </button>
          </div>
        </div>
      )}
      
      <footer className="mt-8 text-[10px] text-gray-300 font-black tracking-[0.2em] uppercase opacity-50">
        Friendship Bingo • Real-time Battle Mode
      </footer>
    </div>
  );
};

export default App;
