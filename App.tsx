
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
  getTopRankings,
  getUserProfile
} from './services/firebaseService';
import { onAuthStateChanged, User } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import BingoBoard from './components/BingoBoard';
import { 
  Gamepad2, Trophy, User as UserIcon, Share2, LogOut, 
  Sparkles, BellRing, MessageCircle, Smartphone, 
  Mail, ShieldCheck, Check, ExternalLink, AlertCircle, Medal
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
  
  const [isKakaoBrowser, setIsKakaoBrowser] = useState(false);
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

  const fetchUserStats = useCallback(async (uid: string) => {
    const stats = await getUserProfile(uid);
    if (stats) setUserStats(stats);
  }, []);

  const syncState = useCallback(() => {
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
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) setMatchId(roomFromUrl);

    const ua = navigator.userAgent.toLowerCase();
    if (ua.indexOf('kakaotalk') > -1) {
      setIsKakaoBrowser(true);
      handleOpenExternal();
    }

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        await updateUserInfo(u.uid, u.displayName || u.email?.split('@')[0] || "빙고 마스터", u.photoURL || "");
        fetchUserStats(u.uid);
      }
    });

    const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      unsub();
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, [fetchUserStats]);

  useEffect(() => {
    if (activeTab === 'rank') {
      getTopRankings(10).then(setRankings);
    } else if (activeTab === 'profile' && user) {
      fetchUserStats(user.uid);
    }
  }, [activeTab, user, fetchUserStats]);

  const handleOpenExternal = () => {
    const currentUrl = window.location.href;
    const ua = navigator.userAgent.toLowerCase();
    if (ua.match(/android/)) {
      window.location.href = `intent://${currentUrl.replace(/https?:\/\//i, '')}#Intent;scheme=http;package=com.android.chrome;end`;
    } else {
      window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}`;
    }
  };

  const handleShare = async () => {
    if (!matchId.trim()) return alert("공유할 방 번호가 없어요!");
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${matchId}`;
    const shareData = { title: '팡팡 빙고!', text: `방 번호 [${matchId}] 로 들어와!`, url: shareUrl };

    if (navigator.share) {
      try { await navigator.share(shareData); } catch (e) {}
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      } catch (e) { alert("링크 복사 실패!"); }
    }
  };

  const handleMarkAction = useCallback((value: number, senderId: string) => {
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
        recordWin(user.uid).then(() => fetchUserStats(user.uid));
      }
    }
  }, [linesCount, user, fetchUserStats]);

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
          setPlayers(prev => {
            if (prev.find(p => p.id === payload.playerId)) return prev;
            const newPlayers = [...prev, { 
              id: payload.playerId, 
              name: payload.name, 
              photoURL: payload.photoURL,
              color: PLAYER_COLORS[prev.length % PLAYER_COLORS.length] 
            }].sort((a, b) => a.id.localeCompare(b.id));
            sounds.playJoin();
            if (payload.action === 'join') {
              publishMessage(matchId, { action: 'presence', playerId: user.uid, name: user.displayName || user.email?.split('@')[0], photoURL: user.photoURL });
              setTimeout(syncState, 800);
            }
            return newPlayers;
          });
        } else if (payload.action === 'mark') {
          handleMarkAction(payload.value, payload.senderId);
        } else if (payload.action === 'sync_state') {
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
  }, [status, matchId, user, handleMarkAction, syncState]);

  const startGame = async () => {
    if (!matchId.trim()) return alert("방 번호를 입력해주세요! 🏠");
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

  // Render Logic
  if (isKakaoBrowser) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FFF9E3] p-8 text-center gap-6">
      <div className="w-20 h-20 bg-[#FFD93D] rounded-full flex items-center justify-center text-white shadow-lg animate-bounce"><AlertCircle size={40} /></div>
      <h2 className="text-xl font-black text-gray-700">카카오톡 브라우저 차단! 🖐️</h2>
      <button onClick={handleOpenExternal} className="w-full py-4 bg-[#4D96FF] text-white font-black rounded-2xl flex items-center justify-center gap-2">외부 브라우저로 열기</button>
    </div>
  );

  if (authLoading) return <div className="min-h-screen flex flex-col items-center justify-center bg-[#FFF9E3] font-black text-gray-400 gap-4"><div className="animate-spin text-4xl">✨</div>로딩 중...</div>;

  const getRankTitle = (wins: number) => {
    if (wins >= 50) return "전설의 빙고 마스터";
    if (wins >= 20) return "빙고 도사";
    if (wins >= 10) return "프로 빙고러";
    if (wins >= 5) return "빙고 유망주";
    return "빙고 새내기";
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF9E3] text-[#4A4A4A] select-none safe-area-inset">
      {/* Toast Feedback */}
      {copyFeedback && <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-gray-800 text-white px-6 py-2 rounded-full flex items-center gap-2 shadow-2xl animate__animated animate__fadeInDown"><Check size={14} className="text-green-400"/><span className="font-black text-xs">링크 복사 완료!</span></div>}

      {/* Main Viewport */}
      <main className="flex-1 flex flex-col items-center w-full max-w-md mx-auto relative overflow-hidden">
        
        {/* TAB 1: GAME SCREEN */}
        {activeTab === 'game' && (
          <div className="w-full flex-1 flex flex-col p-4 animate__animated animate__fadeIn">
            {!user ? (
              <div className="flex-1 flex flex-col justify-center items-center text-center space-y-6">
                <div className="text-7xl floating">🧸</div>
                <h2 className="text-3xl font-black text-[#FF69B4]">팡팡 빙고!</h2>
                <button onClick={() => loginWithGoogle()} className="w-full py-4 bg-white border-4 border-[#FFD93D] rounded-3xl shadow-[0_6px_0_#FFD93D] flex items-center justify-center gap-4 active:translate-y-1 active:shadow-none transition-all">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="G"/>
                  <span className="text-lg font-black">Google 로그인</span>
                </button>
              </div>
            ) : status === 'idle' ? (
              <div className="flex-1 flex flex-col justify-center space-y-6">
                <div className="bg-white p-6 rounded-[2.5rem] shadow-[0_8px_0_#FFB3D9] border-4 border-[#FFD93D] space-y-4">
                  <div className="flex items-center gap-3 bg-[#FFF9E3] p-3 rounded-2xl border-2 border-dashed border-[#FFD93D]">
                    <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} className="w-12 h-12 rounded-xl shadow-sm" />
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{getRankTitle(userStats?.wins || 0)}</p>
                      <p className="text-lg font-black truncate">{user.displayName || "빙고왕"}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 ml-2">비밀 방 번호</label>
                    <input type="text" value={matchId} onChange={(e)=>setMatchId(e.target.value)} placeholder="예: 1234" className="w-full bg-[#EBF3FF] border-3 border-[#4D96FF] rounded-2xl p-4 text-xl font-black outline-none" />
                  </div>
                  <button onClick={startGame} className="w-full py-5 bg-[#FFD93D] text-[#4A4A4A] font-black text-xl rounded-2xl shadow-[0_6px_0_#E5B700] active:translate-y-1">방 만들기 / 입장</button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                {/* 콤팩트 헤더 */}
                <div className="flex items-center justify-between mb-2">
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full border-2 transition-all ${isMyTurn ? 'bg-[#FFD93D] border-[#E5B700] scale-105 shadow-md' : 'bg-white border-gray-100'}`}>
                    <img src={activePlayer?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${activePlayer?.id}`} className="w-6 h-6 rounded-lg" style={{ backgroundColor: activePlayer?.color }} />
                    <span className="text-xs font-black">{isMyTurn ? "내 차례 ✨" : activePlayer?.name}</span>
                  </div>
                  <div className="bg-white px-3 py-1 rounded-full border-2 border-pink-200 text-xs font-black text-[#FF69B4]">
                    빙고 {linesCount} / 5 줄
                  </div>
                </div>

                {/* AI 코멘터리 (작게) */}
                <div className="mb-4 text-center">
                  <p className="text-[11px] font-bold text-gray-500 italic">"{commentary}"</p>
                </div>

                {/* 빙고 보드 */}
                <div className="flex-1 flex items-center justify-center">
                  <BingoBoard cells={cells} onCellClick={handleCellClick} status={status} playerColors={players.reduce((acc,p)=>({...acc, [p.id]:p.color}), {})} />
                </div>

                {/* 우승 팝업 */}
                {status === 'won' && (
                   <div className="mt-4 p-4 bg-white rounded-3xl border-4 border-[#FFD93D] text-center animate__animated animate__jackInTheBox">
                     <p className="text-2xl font-black text-[#FF69B4]">WINNER!</p>
                     <p className="text-sm font-bold text-gray-500">{activePlayer?.name}님이 승리했어요!</p>
                     <button onClick={()=>setStatus('idle')} className="mt-3 w-full py-3 bg-[#FFD93D] rounded-xl font-black">대기실로</button>
                   </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: RANKING */}
        {activeTab === 'rank' && (
          <div className="w-full flex-1 p-6 flex flex-col animate__animated animate__fadeIn">
            <h2 className="text-2xl font-black text-center mb-6">🏆 명예의 전당</h2>
            <div className="flex-1 overflow-y-auto space-y-3 pb-24">
              {rankings.map((r, i)=>(
                <div key={r.uid} className={`flex items-center justify-between p-4 rounded-3xl border-2 ${i===0?'bg-yellow-50 border-yellow-300':'bg-white border-gray-100'}`}>
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full font-black text-[10px] text-white ${i===0?'bg-yellow-400':'bg-gray-300'}`}>{i+1}</span>
                    <img src={r.photoURL} className="w-10 h-10 rounded-xl" />
                    <span className="font-black truncate max-w-[100px]">{r.nickname}</span>
                  </div>
                  <p className="text-lg font-black text-[#FF69B4]">{r.wins}<span className="text-[10px] ml-1">WINS</span></p>
                </div>
              ))}
              {rankings.length === 0 && <p className="text-center py-10 text-gray-400 font-bold">랭킹 정보를 불러오고 있어요... 🏅</p>}
            </div>
          </div>
        )}

        {/* TAB 3: PROFILE */}
        {activeTab === 'profile' && (
          <div className="w-full flex-1 p-8 flex flex-col items-center justify-center animate__animated animate__fadeIn">
            {user ? (
              <div className="bg-white p-8 rounded-[3rem] border-4 border-[#FFD93D] w-full text-center space-y-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#FF69B4] via-[#FFD93D] to-[#4D96FF]"></div>
                <div className="relative inline-block mt-4">
                  <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} className="w-28 h-28 rounded-[2.5rem] border-4 border-[#FFF9E3] shadow-lg" />
                  <div className="absolute -bottom-2 -right-2 bg-[#FFD93D] p-2.5 rounded-full shadow-md text-white"><Medal size={20} /></div>
                </div>
                <div>
                  <p className="text-xs font-black text-[#FF69B4] uppercase tracking-[0.2em] mb-1">{getRankTitle(userStats?.wins || 0)}</p>
                  <h3 className="text-3xl font-black">{userStats?.nickname || user.displayName}</h3>
                  <p className="text-sm font-bold text-gray-400 opacity-60">{user.email}</p>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-[#FFF9E3] p-6 rounded-[2rem] border-2 border-dashed border-[#FFD93D]">
                    <p className="text-[10px] font-black text-[#FFD93D] uppercase tracking-widest mb-1">Total Victories</p>
                    <div className="flex items-center justify-center gap-2">
                       <span className="text-5xl font-black text-[#FF69B4]">{userStats?.wins || 0}</span>
                       <span className="text-sm font-black text-gray-400">번의 승리</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button onClick={()=>logout()} className="text-gray-300 hover:text-red-400 font-black text-xs uppercase tracking-widest flex items-center gap-2 mx-auto transition-colors">
                    <LogOut size={14}/> 로그아웃
                  </button>
                </div>
              </div>
            ) : <p className="font-black text-gray-400">로그인이 필요합니다.</p>}
          </div>
        )}
      </main>

      {/* BOTTOM NAVBAR */}
      {user && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t-2 border-gray-100 flex justify-around items-center px-4 pb-8 pt-4 z-50">
          <NavButton active={activeTab==='game'} icon={<Gamepad2 size={24}/>} label="게임" onClick={()=>setActiveTab('game')} />
          <NavButton active={activeTab==='rank'} icon={<Trophy size={24}/>} label="순위" onClick={()=>setActiveTab('rank')} />
          {status === 'playing' && (
            <button onClick={handleShare} className="w-14 h-14 -mt-10 bg-[#4D96FF] text-white rounded-full shadow-lg shadow-blue-200 border-4 border-white flex items-center justify-center active:scale-95 transition-all">
              <Share2 size={24}/>
            </button>
          )}
          <NavButton active={activeTab==='profile'} icon={<UserIcon size={24}/>} label="정보" onClick={()=>setActiveTab('profile')} />
          {status === 'playing' ? (
            <NavButton active={false} icon={<LogOut size={24} className="text-red-300"/>} label="종료" onClick={() => confirm("게임을 종료할까요?") && setStatus('idle')} />
          ) : (
             <div className="w-[44px]"></div> // Spacing
          )}
        </nav>
      )}
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; icon: React.ReactNode; label: string; onClick: () => void }> = ({ active, icon, label, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-[#FF69B4] scale-110' : 'text-gray-300'}`}>
    {icon}
    <span className="text-[9px] font-black uppercase tracking-tighter">{label}</span>
    {active && <div className="w-1 h-1 bg-[#FF69B4] rounded-full mt-0.5"></div>}
  </button>
);

export default App;
