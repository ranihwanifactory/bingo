
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
  LogIn, Mail, ShieldCheck, Gamepad2, Key
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
  const [commentary, setCommentary] = useState<string>("로그인하여 확실한 플레이어 구분을 해주세요! 🌍");
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0);
  const [showRanking, setShowRanking] = useState(false);
  const [rankings, setRankings] = useState<UserRanking[]>([]);
  
  // Login states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isEmailLogin, setIsEmailLogin] = useState(false);

  const playersRef = useRef<PlayerInfo[]>([]);
  playersRef.current = players;
  const cellsRef = useRef<BingoCell[]>([]);
  cellsRef.current = cells;
  const gameEndedRef = useRef(false);

  // Sync turn and board for late joiners
  const syncState = useCallback(() => {
    if (players.length > 0 && players[0].id === user?.uid) {
      const markedValues = cellsRef.current.filter(c => c.isMarked).map(c => ({ value: c.value, senderId: c.markedBy }));
      publishMessage(matchId, {
        action: 'sync_state',
        markedValues,
        currentTurnIdx: currentTurnIdx
      });
    }
  }, [matchId, user, currentTurnIdx, players]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        updateUserInfo(u.uid, u.displayName || u.email?.split('@')[0] || "빙고 마스터", u.photoURL || "");
      }
    });
    return unsub;
  }, []);

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

  const updateAICommentary = async (count: number) => {
    const isWinner = count >= 5;
    const msg = await getAICommentary(count, isWinner);
    setCommentary(msg);
  };

  const handleMark = useCallback((value: number, senderId: string) => {
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
    
    // Advance turn to next in sorted list
    const currentPlayers = playersRef.current;
    const lastSenderIdx = currentPlayers.findIndex(p => p.id === senderId);
    if (lastSenderIdx !== -1) {
      const nextIdx = (lastSenderIdx + 1) % currentPlayers.length;
      setCurrentTurnIdx(nextIdx);
      if (currentPlayers[nextIdx].id === user?.uid) {
        sounds.playTurn();
      }
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
            
            const newPlayers = [...prev, { 
              id: payload.playerId, 
              name: payload.name, 
              photoURL: payload.photoURL,
              color: PLAYER_COLORS[prev.length % PLAYER_COLORS.length] 
            }].sort((a, b) => a.id.localeCompare(b.id));

            sounds.playJoin();
            
            // If someone joins, everyone knows. The first player (host) sends the current state.
            if (payload.action === 'join') {
              publishMessage(matchId, { 
                action: 'presence', 
                playerId: user.uid, 
                name: user.displayName || user.email?.split('@')[0],
                photoURL: user.photoURL
              });
              // Briefly delay sync to allow joiner to receive presence
              setTimeout(syncState, 500);
            }
            return newPlayers;
          });
        } else if (payload.action === 'mark') {
          handleMark(payload.value, payload.senderId);
        } else if (payload.action === 'sync_state') {
          // Sync existing markings and current turn
          const markedVals = payload.markedValues as {value: number, senderId: string}[];
          let updatedCells = [...cellsRef.current];
          markedVals.forEach(mv => {
            const idx = updatedCells.findIndex(c => c.value === mv.value);
            if (idx !== -1) updatedCells[idx] = { ...updatedCells[idx], isMarked: true, markedBy: mv.senderId };
          });
          setCells(updatedCells);
          setCurrentTurnIdx(payload.currentTurnIdx);
        }
      });
      
      publishMessage(matchId, { 
        action: 'join', 
        playerId: user.uid, 
        name: user.displayName || user.email?.split('@')[0],
        photoURL: user.photoURL
      });
    }
    return () => unsubscribe?.();
  }, [status, matchId, user, handleMark, syncState]);

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
    setCommentary("친구들을 초대하세요! 최소 2명이 모이면 더 재미있어요.");
  };

  const handleCellClick = (val: number) => {
    if (status !== 'playing') return;
    if (players.length < 2) {
      setCommentary("아직 친구가 없어요! 같은 방 번호로 친구를 불러주세요. 👥");
      return;
    }
    
    const isMyTurn = players[currentTurnIdx]?.id === user?.uid;
    if (!isMyTurn) {
      setCommentary(`${players[currentTurnIdx]?.name}님의 순서입니다. 차례를 기다려주세요! 🍵`);
      return;
    }
    
    const target = cells.find(c => c.value === val);
    if (target?.isMarked) return;

    publishMessage(matchId, { action: 'mark', value: val, senderId: user?.uid });
    handleMark(val, user?.uid || "");
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
    <div className="min-h-screen flex items-center justify-center bg-[#FFF9E3]">
      <div className="animate-spin text-5xl">✨</div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center py-6 px-4 bg-[#FFF9E3] font-['Jua']">
      <header className="text-center mb-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="text-[#FFD93D]" fill="#FFD93D"/>
            <h1 className="text-3xl font-black text-[#FF69B4] tracking-tight">팡팡 빙고</h1>
          </div>
          {user && (
            <button onClick={() => logout()} className="text-[10px] font-bold text-gray-400 flex items-center gap-1 bg-white px-3 py-1 rounded-full shadow-sm hover:text-[#FF6B6B] transition-colors">
              <LogOut size={12}/> 로그아웃
            </button>
          )}
        </div>
        
        <button onClick={fetchRankings} className="flex items-center gap-2 mx-auto bg-white px-4 py-2 rounded-full shadow-md text-xs font-bold text-[#FF8E9E] hover:scale-105 transition-all">
          <Trophy size={14}/> 실시간 랭킹 보기
        </button>
      </header>

      <main className="w-full max-w-md">
        {!user ? (
          <div className="bg-white p-8 rounded-[3rem] shadow-[0_12px_0_#FFB3D9] border-4 border-[#FFD93D] text-center space-y-6 animate__animated animate__fadeInUp">
            <div className="space-y-2">
               <div className="w-20 h-20 bg-[#FFF9E3] rounded-full mx-auto flex items-center justify-center text-5xl shadow-inner border-2 border-dashed border-[#FFD93D]">🔐</div>
               <h2 className="text-2xl font-black text-gray-700">로그인</h2>
               <p className="text-gray-400 text-sm font-bold">확실한 본인 확인을 위해 로그인해주세요.</p>
            </div>
            
            {isEmailLogin ? (
              <form onSubmit={onEmailLogin} className="space-y-4">
                <input 
                  type="email" 
                  placeholder="이메일" 
                  className="w-full bg-gray-50 border-2 border-gray-100 p-3 rounded-2xl focus:border-[#4D96FF] outline-none"
                  value={email} onChange={e => setEmail(e.target.value)} required
                />
                <input 
                  type="password" 
                  placeholder="비밀번호" 
                  className="w-full bg-gray-50 border-2 border-gray-100 p-3 rounded-2xl focus:border-[#4D96FF] outline-none"
                  value={password} onChange={e => setPassword(e.target.value)} required
                />
                <button type="submit" className="w-full py-3 bg-[#4D96FF] text-white font-black rounded-2xl shadow-lg">로그인 / 가입</button>
                <button type="button" onClick={() => setIsEmailLogin(false)} className="text-xs text-gray-400 font-bold">구글 로그인으로 돌아가기</button>
              </form>
            ) : (
              <div className="space-y-3">
                <button 
                  onClick={() => loginWithGoogle()}
                  className="w-full py-4 bg-white border-2 border-gray-100 rounded-3xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-4"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google"/>
                  <span className="text-lg font-black text-gray-600">Google 계정 로그인</span>
                </button>
                <button 
                  onClick={() => setIsEmailLogin(true)}
                  className="w-full py-4 bg-white border-2 border-gray-100 rounded-3xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-4"
                >
                  <Mail className="text-gray-400" size={24}/>
                  <span className="text-lg font-black text-gray-600">이메일로 시작하기</span>
                </button>
              </div>
            )}
          </div>
        ) : status === 'idle' ? (
          <div className="bg-white p-8 rounded-[3rem] shadow-[0_12px_0_#FFB3D9] border-4 border-[#FFD93D] space-y-6 animate__animated animate__fadeInUp">
            <div className="flex items-center gap-4 bg-[#FFF9E3] p-4 rounded-3xl border-2 border-dashed border-[#FFD93D]">
               <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} className="w-16 h-16 rounded-2xl border-4 border-white shadow-md" alt="Me"/>
               <div>
                  <p className="text-xs font-black text-[#FF6B6B]">HELLO!</p>
                  <p className="text-xl font-black text-gray-700 truncate max-w-[150px]">{user.displayName || user.email?.split('@')[0]}</p>
               </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-black text-[#4D96FF] ml-2 flex items-center gap-1">
                <ShieldCheck size={14}/> 비밀 방 번호 (친구와 맞추세요)
              </label>
              <input 
                type="text" 
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
                placeholder="예: 7777"
                className="w-full bg-[#EBF3FF] border-3 border-[#4D96FF] rounded-2xl px-5 py-4 text-xl font-black focus:outline-none transition-all placeholder:text-gray-300"
              />
            </div>
            
            <button 
              onClick={startGame}
              className="w-full py-5 bg-[#FFD93D] hover:bg-[#FFC300] text-[#4A4A4A] font-black text-2xl rounded-2xl shadow-[0_8px_0_#E5B700] transition-all active:translate-y-1 active:shadow-none flex items-center justify-center gap-3"
            >
              <Gamepad2 size={24} /> 게임 시작하기!
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current Turn Indicator */}
            <div className={`p-4 rounded-3xl border-4 transition-all duration-500 flex items-center justify-between ${players[currentTurnIdx]?.id === user.uid ? 'bg-[#FFEB3B]/40 border-[#FFD93D] shadow-[0_0_20px_#FFD93D] animate__animated animate__pulse animate__infinite' : 'bg-white border-gray-100 shadow-md'}`}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img src={players[currentTurnIdx]?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${players[currentTurnIdx]?.id}`} className={`w-14 h-14 rounded-2xl shadow-lg border-2 border-white transition-all ${players[currentTurnIdx]?.id === user.uid ? 'rotate-12 scale-110' : 'opacity-60'}`} style={{ backgroundColor: players[currentTurnIdx]?.color || '#eee' }} />
                  {players[currentTurnIdx]?.id === user.uid && <div className="absolute -top-1 -right-1 bg-[#FF69B4] text-white p-1 rounded-full animate-bounce"><BellRing size={10}/></div>}
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Current Turn</p>
                  <p className="text-xl font-black text-gray-700">
                    {players[currentTurnIdx]?.id === user.uid ? <span className="text-[#FF69B4]">내 차례예요! ✨</span> : <span>{players[currentTurnIdx]?.name}님 차례</span>}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="bg-gray-100 px-3 py-1 rounded-full flex items-center gap-1 mb-2">
                   <Users size={12} className="text-gray-400"/>
                   <span className="text-[10px] font-black text-gray-500">{players.length}명 참여 중</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border-2 border-[#FFD93D] text-sm font-bold text-gray-600 flex gap-3 items-center shadow-sm">
              <div className="bg-[#FFF9E3] p-2 rounded-xl"><MessageCircle size={20} className="text-[#FFD93D]"/></div>
              <p className="flex-1 italic leading-tight">"{commentary}"</p>
            </div>

            <BingoBoard 
              cells={cells} 
              onCellClick={handleCellClick} 
              status={status} 
              playerColors={players.reduce((acc, p) => ({ ...acc, [p.id]: p.color }), {})} 
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-4 rounded-3xl border-3 border-pink-100 flex flex-col items-center shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-8 h-8 bg-pink-50 rounded-bl-full flex items-center justify-center">🎉</div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Bingo Count</span>
                <span className="text-3xl font-black text-[#FF69B4]">{linesCount} / 5</span>
              </div>
              <div className="bg-white p-4 rounded-3xl border-3 border-blue-100 flex flex-col items-center shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-8 h-8 bg-blue-50 rounded-bl-full flex items-center justify-center">🔑</div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Room Code</span>
                <span className="text-2xl font-black text-[#4D96FF]">{matchId}</span>
              </div>
            </div>

            <div className="flex justify-center pt-4">
              {status === 'won' ? (
                <div className="text-center space-y-4 p-6 bg-white rounded-[3rem] border-4 border-[#FFD93D] shadow-xl animate__animated animate__jackInTheBox w-full">
                  <div className="text-6xl mb-2">🏆</div>
                  <h2 className="text-4xl font-black text-[#FF69B4]">최종 우승!</h2>
                  <p className="text-gray-500 font-bold">{players[currentTurnIdx]?.name}님이 승리했습니다!</p>
                  <button onClick={() => setStatus('idle')} className="w-full px-10 py-5 bg-[#FFD93D] text-[#4A4A4A] font-black text-xl rounded-2xl shadow-[0_6px_0_#E5B700] hover:translate-y-1 hover:shadow-none transition-all flex items-center justify-center gap-2">
                    새 게임 하러가기
                  </button>
                </div>
              ) : (
                <button onClick={() => confirm("게임을 나갈까요? 현재 방에서 나갑니다.") && setStatus('idle')} className="flex items-center gap-2 text-gray-400 hover:text-[#FF6B6B] transition-colors text-xs font-bold uppercase tracking-widest bg-white/50 px-4 py-2 rounded-full">
                  <LogOut size={12} /> 게임 종료 및 나가기
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Rankings Modal */}
      {showRanking && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate__animated animate__fadeIn">
          <div className="bg-white w-full max-w-sm rounded-[3rem] border-4 border-[#FFD93D] shadow-2xl p-8 relative animate__animated animate__zoomIn">
            <button onClick={() => setShowRanking(false)} className="absolute top-6 right-6 p-2 bg-[#F0F4F8] rounded-full text-gray-400 hover:text-gray-600">
              <X size={20}/>
            </button>
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">🏅</div>
              <h3 className="text-2xl font-black text-[#4A4A4A]">명예의 전당</h3>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest italic">The Best Bingo Masters</p>
            </div>
            <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {rankings.map((rank, index) => (
                <div key={rank.uid} className={`flex items-center justify-between p-3 rounded-2xl border-2 ${index === 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img src={rank.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${rank.uid}`} className="w-10 h-10 rounded-xl border-2 border-white shadow-sm" />
                      <div className={`absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] text-white ${index === 0 ? 'bg-yellow-400' : 'bg-gray-400'}`}>
                        {index + 1}
                      </div>
                    </div>
                    <p className="font-black text-[#4A4A4A] truncate max-w-[120px]">{rank.nickname}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xl font-black text-[#FF69B4]">{rank.wins}</span>
                    <span className="text-[8px] font-bold text-gray-400 uppercase">Wins</span>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowRanking(false)} className="w-full mt-6 py-4 bg-[#FFD93D] text-[#4A4A4A] font-black rounded-2xl shadow-[0_4px_0_#E5B700] active:translate-y-1 active:shadow-none transition-all">
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
