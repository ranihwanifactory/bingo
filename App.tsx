
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BingoCell, GameStatus, PlayerInfo, UserRanking } from './types';
import { generateRandomBoard, getAICommentary } from './services/geminiService';
import { publishMessage, subscribeToMatch } from './services/syncService';
import { sounds } from './services/soundService';
import { 
  auth, 
  loginWithGoogle, 
  logout, 
  updateUserInfo, 
  recordWin, 
  getTopRankings,
  getUserProfile,
  getH2HRecord,
  updateH2HRecord
} from './services/firebaseService';
import { onAuthStateChanged, User } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import BingoBoard from './components/BingoBoard';
import { 
  Gamepad2, Trophy, User as UserIcon, Share2, LogOut, 
  Sparkles, Check, AlertCircle, Medal,
  MessageCircle, PlusCircle, LogIn, Swords, Copy
} from 'lucide-react';
import confetti from 'canvas-confetti';

const PLAYER_COLORS = ['#FF6B6B', '#4D96FF', '#6BCB77', '#FFD93D', '#917FB3', '#FF9F43'];

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userStats, setUserStats] = useState<UserRanking | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [status, setStatus] = useState<GameStatus>('idle');
  const [activeTab, setActiveTab] = useState<'game' | 'rank' | 'profile'>('game');
  const [matchId, setMatchId] = useState<string>('');
  const [cells, setCells] = useState<BingoCell[]>([]);
  const [linesCount, setLinesCount] = useState<number>(0);
  const [commentary, setCommentary] = useState<string>("친구들과 함께하는 신나는 빙고 타임! 🌈");
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0);
  const [rankings, setRankings] = useState<UserRanking[]>([]);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const playersRef = useRef<PlayerInfo[]>([]);
  playersRef.current = players;
  const cellsRef = useRef<BingoCell[]>([]);
  cellsRef.current = cells;
  const currentTurnIdxRef = useRef(0);
  currentTurnIdxRef.current = currentTurnIdx;
  const gameEndedRef = useRef(false);

  const fetchUserStats = useCallback(async (uid: string) => {
    try {
      const stats = await getUserProfile(uid);
      if (stats) setUserStats(stats);
    } catch (e) { console.error(e); }
  }, []);

  const fetchH2HRecords = useCallback(async (newPlayers: PlayerInfo[]) => {
    if (!user) return;
    try {
      const updatedPlayers = await Promise.all(newPlayers.map(async (p) => {
        if (p.id === user.uid) return p;
        const record = await getH2HRecord(user.uid, p.id);
        return {
          ...p,
          h2hRecord: {
            myWins: record[user.uid] || 0,
            opponentWins: record[p.id] || 0
          }
        };
      }));
      setPlayers(updatedPlayers);
    } catch (e) { console.error(e); }
  }, [user]);

  const syncState = useCallback(() => {
    if (playersRef.current.length > 0 && playersRef.current[0].id === user?.uid) {
      const markedValues = cellsRef.current
        .filter(c => c.isMarked)
        .map(c => ({ value: c.value, senderId: c.markedBy }));
      
      publishMessage(matchId, {
        action: 'sync_state',
        markedValues,
        currentTurnIdx: currentTurnIdxRef.current,
        players: playersRef.current
      });
    }
  }, [matchId, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) setMatchId(roomFromUrl);

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        await updateUserInfo(u.uid, u.displayName || u.email?.split('@')[0] || "빙고 마스터", u.photoURL || "");
        fetchUserStats(u.uid);
      }
    });

    return () => unsub();
  }, [fetchUserStats]);

  useEffect(() => {
    if (activeTab === 'rank') {
      getTopRankings(10).then(setRankings).catch(console.error);
    } else if (activeTab === 'profile' && user) {
      fetchUserStats(user.uid);
    }
  }, [activeTab, user, fetchUserStats]);

  const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  const handleCopyLink = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${matchId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (e) { alert("링크 복사 실패!"); }
  };

  const handleShare = async () => {
    if (!matchId.trim()) return alert("공유할 방 번호가 없어요!");
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${matchId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: '팡팡 빙고!', text: `방 번호 [${matchId}] 로 들어와!`, url: shareUrl });
      } catch (e) { handleCopyLink(); }
    } else {
      handleCopyLink();
    }
  };

  const handleMarkAction = useCallback(async (value: number, senderId: string) => {
    const currentCells = [...cellsRef.current];
    const targetIdx = currentCells.findIndex(c => c.value === value);
    if (targetIdx === -1 || currentCells[targetIdx].isMarked) return;

    sounds.playPop();
    currentCells[targetIdx] = { ...currentCells[targetIdx], isMarked: true, markedBy: senderId };

    const { count, winningIndices } = calculateBingo(currentCells);
    setCells(currentCells.map((c, i) => ({ ...c, isWinningCell: winningIndices.has(i) })));
    
    const currentPlayers = playersRef.current;
    if (currentPlayers.length > 0) {
      const lastPlayerIdx = currentPlayers.findIndex(p => p.id === senderId);
      if (lastPlayerIdx !== -1) {
        const nextIdx = (lastPlayerIdx + 1) % currentPlayers.length;
        setCurrentTurnIdx(nextIdx);
        if (currentPlayers[nextIdx].id === user?.uid) sounds.playTurn();
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
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      
      if (senderId === user?.uid) {
        await recordWin(user.uid);
        for (const p of currentPlayers) {
          if (p.id !== user.uid) await updateH2HRecord(user.uid, p.id);
        }
        fetchUserStats(user.uid);
        fetchH2HRecords(currentPlayers);
      }
    }
  }, [linesCount, user, fetchUserStats, fetchH2HRecords]);

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

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    if (status === 'playing' && matchId && user) {
      unsubscribe = subscribeToMatch(matchId, (payload) => {
        if (payload.action === 'join' || payload.action === 'presence') {
          const newPlayerId = payload.playerId;
          setPlayers(prev => {
            if (prev.find(p => p.id === newPlayerId)) return prev;
            const newPlayersList = [...prev, { 
              id: newPlayerId, 
              name: payload.name, 
              photoURL: payload.photoURL,
              color: PLAYER_COLORS[prev.length % PLAYER_COLORS.length] 
            }].sort((a, b) => a.id.localeCompare(b.id));
            
            sounds.playJoin();
            fetchH2HRecords(newPlayersList);

            if (payload.action === 'join') {
              publishMessage(matchId, { action: 'presence', playerId: user.uid, name: user.displayName || user.email?.split('@')[0], photoURL: user.photoURL });
              setTimeout(syncState, 500);
            }
            return newPlayersList;
          });
        } else if (payload.action === 'mark') {
          handleMarkAction(payload.value, payload.senderId);
        } else if (payload.action === 'sync_state') {
          if (payload.players) {
            const syncedPlayers = payload.players.sort((a: any, b: any) => a.id.localeCompare(b.id));
            fetchH2HRecords(syncedPlayers);
          }
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
      publishMessage(matchId, { action: 'join', playerId: user.uid, name: user.displayName || user.email?.split('@')[0], photoURL: user.photoURL });
    }
    return () => unsubscribe?.();
  }, [status, matchId, user, handleMarkAction, syncState, fetchH2HRecords]);

  const startGame = async (forcedId?: string) => {
    const idToUse = forcedId || matchId;
    if (!idToUse.trim()) return alert("방 번호가 필요해요! 🏠");
    
    setMatchId(idToUse);
    const values = generateRandomBoard();
    setCells(values.map(v => ({ value: v, isMarked: false, isWinningCell: false })));
    setLinesCount(0);
    setPlayers([{ id: user!.uid, name: user!.displayName || user!.email?.split('@')[0] || "마스터", photoURL: user!.photoURL || "", color: PLAYER_COLORS[0] }]);
    setCurrentTurnIdx(0);
    gameEndedRef.current = false;
    setStatus('playing');
    setActiveTab('game');
    sounds.playJoin();
    setCommentary("친구들을 기다리고 있어요! 초대 버튼으로 공유하세요.");
  };

  const createNewGame = () => startGame(generateRoomId());

  const handleCellClick = (val: number) => {
    if (status !== 'playing' || players.length < 2) {
      if (players.length < 2) setCommentary("친구를 기다려주세요! 👥");
      return;
    }
    const isMyTurn = players[currentTurnIdx]?.id === user?.uid;
    if (!isMyTurn) return setCommentary("내 차례가 아니에요! 🍵");
    
    const target = cells.find(c => c.value === val);
    if (target?.isMarked) return;

    publishMessage(matchId, { action: 'mark', value: val, senderId: user?.uid });
    handleMarkAction(val, user?.uid || "");
  };

  const activePlayer = players[currentTurnIdx];
  const isMyTurn = activePlayer?.id === user?.uid;

  if (authLoading) return <div className="min-h-screen flex flex-col items-center justify-center bg-[#FFF9E3] font-black text-[#FFD93D] gap-4"><div className="animate-spin text-5xl">🧸</div><p>팡팡 빙고 입장 중...</p></div>;

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF9E3] text-[#4A4A4A] select-none safe-area-inset overflow-hidden">
      {copyFeedback && <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[100] bg-gray-800 text-white px-6 py-2 rounded-full flex items-center gap-2 shadow-2xl animate__animated animate__fadeInDown"><Check size={14} className="text-green-400"/><span className="font-black text-xs">초대 링크 복사 완료!</span></div>}

      <main className="flex-1 flex flex-col items-center w-full max-w-md mx-auto relative px-4">
        
        {activeTab === 'game' && (
          <div className="w-full h-full flex flex-col animate__animated animate__fadeIn py-4">
            {!user ? (
              <div className="flex-1 flex flex-col justify-center items-center text-center space-y-8">
                <div className="text-8xl floating">🌈</div>
                <div className="space-y-2">
                  <h2 className="text-4xl font-black text-[#FF69B4] tracking-tighter">팡팡 빙고!</h2>
                  <p className="text-gray-400 font-bold">친구들과 실시간으로 즐겨요!</p>
                </div>
                <button onClick={() => loginWithGoogle()} className="w-full py-5 bg-white border-4 border-[#FFD93D] rounded-[2rem] shadow-[0_8px_0_#FFD93D] flex items-center justify-center gap-4 transition-all active:translate-y-1 active:shadow-none">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="G"/>
                  <span className="text-xl font-black">Google로 시작하기</span>
                </button>
              </div>
            ) : status === 'idle' ? (
              <div className="flex-1 flex flex-col justify-center space-y-6">
                <div className="bg-white p-8 rounded-[3rem] shadow-[0_12px_0_#FFB3D9] border-4 border-[#FFD93D] space-y-8">
                  <div className="text-center space-y-3">
                    <div className="text-6xl floating inline-block">🏰</div>
                    <h2 className="text-3xl font-black text-[#FF69B4]">게임 로비</h2>
                  </div>

                  <div className="space-y-4">
                    <button onClick={createNewGame} className="w-full py-5 bg-[#FFD93D] text-[#4A4A4A] font-black text-xl rounded-[1.5rem] shadow-[0_8px_0_#E5B700] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2">
                      <PlusCircle size={24} /> 방 만들기
                    </button>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-[2px] bg-gray-100"></div>
                      <span className="text-xs font-black text-gray-300">또는</span>
                      <div className="flex-1 h-[2px] bg-gray-100"></div>
                    </div>

                    <div className="space-y-3">
                      <input 
                        type="text" 
                        value={matchId} 
                        onChange={(e)=>setMatchId(e.target.value.toUpperCase())} 
                        placeholder="방 번호 입력" 
                        className="w-full bg-[#F0F7FF] border-4 border-[#4D96FF] rounded-[1.5rem] p-4 text-center text-2xl font-black outline-none placeholder:text-gray-300" 
                      />
                      <button onClick={() => startGame()} className="w-full py-5 bg-[#4D96FF] text-white font-black text-xl rounded-[1.5rem] shadow-[0_8px_0_#2B66CC] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2">
                        <LogIn size={24} /> 입장하기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                {/* 상단 플레이어 리스트 */}
                <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
                  {players.map((p, idx) => (
                    <div 
                      key={p.id}
                      className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-2xl border-2 transition-all duration-300 ${currentTurnIdx === idx ? 'bg-white border-[#FFD93D] shadow-lg scale-105 z-10' : 'bg-white/50 border-transparent opacity-60'}`}
                    >
                      <div className="relative">
                        <img src={p.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.id}`} className="w-10 h-10 rounded-xl border-2 border-white shadow-sm" style={{ backgroundColor: p.color }} />
                        {currentTurnIdx === idx && <div className="absolute -top-1 -right-1 bg-[#FFD93D] rounded-full p-0.5 animate-pulse"><Sparkles size={10} className="text-white" fill="white" /></div>}
                      </div>
                      <span className="text-[10px] font-black">{p.id === user?.uid ? "나" : p.name}</span>
                      {p.id !== user?.uid && p.h2hRecord && (
                        <div className="text-[8px] font-black text-[#FF69B4] bg-[#FFF0F6] px-1.5 rounded-full">{p.h2hRecord.myWins}W {p.h2hRecord.opponentWins}L</div>
                      )}
                    </div>
                  ))}
                  {players.length < 2 && (
                    <button onClick={handleShare} className="flex-shrink-0 w-14 h-14 rounded-2xl border-4 border-dashed border-[#4D96FF] flex items-center justify-center text-[#4D96FF] bg-blue-50 animate-pulse">
                      <PlusCircle size={24} />
                    </button>
                  )}
                </div>

                {/* 게임 현황판 */}
                <div className="bg-white rounded-[2rem] p-4 mb-4 border-4 border-gray-50 shadow-sm flex items-center justify-between">
                   <div className="flex flex-col">
                     <span className="text-[10px] font-black text-gray-300 uppercase">ROOM: {matchId}</span>
                     <div className="flex items-center gap-1">
                        <p className="text-base font-black text-gray-700">
                          {players.length < 2 ? "친구를 기다려요..." : (isMyTurn ? <span className="text-[#FF69B4] animate-pulse">내 차례! 🍎</span> : <span>{activePlayer?.name} 차례</span>)}
                        </p>
                     </div>
                   </div>
                   <div className="bg-[#FFF0F6] px-6 py-2 rounded-2xl border-2 border-pink-100 flex flex-col items-center">
                      <span className="text-[10px] font-black text-pink-300 uppercase">LINES</span>
                      <span className="text-2xl font-black text-[#FF69B4] leading-none">{linesCount} / 5</span>
                   </div>
                </div>

                {/* AI 말풍선 */}
                <div className="mb-4 bg-white/80 backdrop-blur-sm p-3 rounded-[1.5rem] border-2 border-dashed border-[#FFD93D] flex items-center gap-3">
                  <div className="bg-[#FFD93D] p-2 rounded-full text-white flex-shrink-0"><MessageCircle size={16} fill="white" /></div>
                  <p className="text-xs font-bold text-gray-500 italic truncate">"{commentary}"</p>
                </div>

                {/* 빙고판 */}
                <div className="flex-1 flex items-center justify-center pb-20">
                  <BingoBoard cells={cells} onCellClick={handleCellClick} status={status} playerColors={players.reduce((acc,p)=>({...acc, [p.id]:p.color}), {})} />
                </div>

                {/* 우승 팝업 */}
                {status === 'won' && (
                   <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm p-6">
                     <div className="bg-white w-full p-8 rounded-[3rem] border-8 border-[#FFD93D] text-center animate__animated animate__jackInTheBox shadow-2xl">
                       <div className="text-6xl mb-2">🏆</div>
                       <h3 className="text-3xl font-black text-[#FF69B4] mb-1">BINGO!</h3>
                       <p className="font-bold text-gray-500 mb-6">{activePlayer?.name}님이 승리했어요!</p>
                       <button onClick={()=>setStatus('idle')} className="w-full py-4 bg-[#FFD93D] rounded-2xl font-black text-xl shadow-[0_6px_0_#E5B700] active:translate-y-1 active:shadow-none transition-all">확인</button>
                     </div>
                   </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'rank' && (
          <div className="w-full flex-1 p-4 flex flex-col animate__animated animate__fadeIn">
            <h2 className="text-3xl font-black text-center mb-6 text-[#FF69B4]">🏆 명예의 전당</h2>
            <div className="flex-1 overflow-y-auto space-y-4 pb-24 scrollbar-hide">
              {rankings.map((r, i)=>(
                <div key={r.uid} className={`flex items-center justify-between p-5 rounded-[2rem] border-4 ${i===0?'bg-yellow-50 border-yellow-300':'bg-white border-gray-100'}`}>
                  <div className="flex items-center gap-4">
                    <span className={`w-8 h-8 flex items-center justify-center rounded-full font-black text-xs text-white ${i===0?'bg-yellow-400':'bg-gray-300'}`}>{i+1}</span>
                    <img src={r.photoURL} className="w-12 h-12 rounded-2xl shadow-sm" />
                    <span className="text-lg font-black truncate max-w-[120px]">{r.nickname}</span>
                  </div>
                  <p className="text-2xl font-black text-[#FF69B4]">{r.wins}<span className="text-[10px] ml-1">WINS</span></p>
                </div>
              ))}
              {rankings.length === 0 && <div className="text-center py-20 text-gray-300 font-bold">랭킹 데이터가 없어요!</div>}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="w-full flex-1 flex flex-col items-center justify-center animate__animated animate__fadeIn pb-24">
            {user ? (
              <div className="bg-white p-10 rounded-[4rem] border-8 border-[#FFD93D] w-full text-center space-y-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-3 bg-gradient-to-r from-[#FF69B4] via-[#FFD93D] to-[#4D96FF]"></div>
                <div className="relative inline-block">
                  <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} className="w-32 h-32 rounded-[3rem] border-8 border-[#FFF9E3] shadow-xl" />
                  <div className="absolute -bottom-2 -right-2 bg-[#FFD93D] p-3 rounded-full shadow-lg text-white"><Medal size={24} /></div>
                </div>
                <div>
                  <h3 className="text-3xl font-black">{userStats?.nickname || user.displayName}</h3>
                  <p className="text-xs font-bold text-gray-300 mt-1">{user.email}</p>
                </div>
                <div className="bg-[#FFF9E3] p-6 rounded-[2.5rem] border-4 border-dashed border-[#FFD93D]">
                  <p className="text-xs font-black text-[#FFD93D] uppercase tracking-widest mb-2">누적 승리</p>
                  <p className="text-6xl font-black text-[#FF69B4]">{userStats?.wins || 0}</p>
                </div>
                <button onClick={()=>logout()} className="text-gray-300 hover:text-red-400 font-black text-sm flex items-center gap-2 mx-auto">
                  <LogOut size={16}/> 로그아웃
                </button>
              </div>
            ) : <p className="font-black text-gray-400">로그인이 필요해요!</p>}
          </div>
        )}
      </main>

      {user && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t-4 border-gray-50 flex justify-around items-center px-6 pb-8 pt-4 z-50 rounded-t-[3rem] shadow-2xl">
          <NavButton active={activeTab==='game'} icon={<Gamepad2 size={28}/>} label="빙고" onClick={()=>setActiveTab('game')} />
          <NavButton active={activeTab==='rank'} icon={<Trophy size={28}/>} label="랭킹" onClick={()=>setActiveTab('rank')} />
          <NavButton active={activeTab==='profile'} icon={<UserIcon size={28}/>} label="내정보" onClick={()=>setActiveTab('profile')} />
          {status === 'playing' && (
            <button onClick={() => confirm("게임을 나갈까요?") && setStatus('idle')} className="flex flex-col items-center gap-1 text-red-300">
              <LogOut size={28}/>
              <span className="text-[10px] font-black uppercase">나가기</span>
            </button>
          )}
        </nav>
      )}
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; icon: React.ReactNode; label: string; onClick: () => void }> = ({ active, icon, label, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all duration-300 ${active ? 'text-[#FF69B4] scale-110 -translate-y-2' : 'text-gray-300'}`}>
    <div className={`p-1 ${active ? 'bg-pink-50 rounded-xl' : ''}`}>{icon}</div>
    <span className="text-[10px] font-black">{label}</span>
    {active && <div className="w-1.5 h-1.5 bg-[#FF69B4] rounded-full mt-0.5 animate-pulse"></div>}
  </button>
);

export default App;
