
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
  LogIn, Mail, ShieldCheck, Gamepad2, Download, Smartphone, ExternalLink, AlertCircle, Share2, Check
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
  const [copyFeedback, setCopyFeedback] = useState(false);
  
  // Browser Detection
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

  // Sync turn and board
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
    // Check for URL parameter 'room'
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      setMatchId(roomFromUrl);
    }

    // Check for KakaoTalk In-App Browser
    const ua = navigator.userAgent.toLowerCase();
    if (ua.indexOf('kakaotalk') > -1) {
      setIsKakaoBrowser(true);
      handleOpenExternal(); // Auto-try external browser
    }

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        updateUserInfo(u.uid, u.displayName || u.email?.split('@')[0] || "빙고 마스터", u.photoURL || "");
      }
    });

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      unsub();
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleOpenExternal = () => {
    const currentUrl = window.location.href;
    const ua = navigator.userAgent.toLowerCase();
    
    if (ua.match(/android/)) {
      const intentUrl = `intent://${currentUrl.replace(/https?:\/\//i, '')}#Intent;scheme=http;package=com.android.chrome;end`;
      window.location.href = intentUrl;
    } else {
      window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}`;
    }
  };

  const handleShare = async () => {
    if (!matchId.trim()) {
      alert("공유할 방 번호가 없어요! 🏠");
      return;
    }

    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${matchId}`;
    const shareData = {
      title: '팡팡 빙고!',
      text: `나랑 빙고 한 판 할래? 방 번호 [${matchId}] 로 들어와!`,
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log('Share failed', err);
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
      } catch (err) {
        alert("링크 복사에 실패했어요. 주소창의 링크를 복사해주세요!");
      }
    }
  };

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
            
            const newPlayers = [...prev, { 
              id: payload.playerId, 
              name: payload.name, 
              photoURL: payload.photoURL,
              color: PLAYER_COLORS[prev.length % PLAYER_COLORS.length] 
            }].sort((a, b) => a.id.localeCompare(b.id));

            sounds.playJoin();
            
            if (payload.action === 'join') {
              publishMessage(matchId, { 
                action: 'presence', 
                playerId: user.uid, 
                name: user.displayName || user.email?.split('@')[0],
                photoURL: user.photoURL
              });
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
    setCommentary("친구들을 기다리고 있어요. 공유 버튼을 눌러 친구를 초대하세요!");
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

  if (isKakaoBrowser) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FFF9E3] p-8 text-center gap-6 animate__animated animate__fadeIn">
      <div className="w-24 h-24 bg-[#FFD93D] rounded-full flex items-center justify-center text-white shadow-lg animate__animated animate__bounceIn">
        <AlertCircle size={48} />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-black text-gray-700">잠시만요! 🖐️</h2>
        <p className="text-gray-500 font-bold leading-relaxed">
          카카오톡 브라우저에서는<br/> 
          <span className="text-[#FF69B4]">구글 로그인</span>이 작동하지 않아요.
        </p>
      </div>
      <div className="bg-white p-6 rounded-[2rem] border-4 border-[#FFD93D] shadow-xl w-full max-w-xs space-y-4">
        <p className="text-sm text-gray-400 font-bold italic">
          원활한 게임 진행을 위해<br/> 크롬이나 사파리로 열어주세요!
        </p>
        <button 
          onClick={handleOpenExternal}
          className="w-full py-4 bg-[#4D96FF] text-white font-black rounded-2xl shadow-[0_6px_0_#3B7EDF] flex items-center justify-center gap-2 active:translate-y-1 active:shadow-none transition-all"
        >
          <ExternalLink size={20}/> 외부 브라우저로 열기
        </button>
      </div>
    </div>
  );

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
      {/* Toast Feedback */}
      {copyFeedback && (
        <div className="fixed top-10 z-[100] bg-gray-800 text-white px-6 py-3 rounded-full flex items-center gap-2 shadow-2xl animate__animated animate__fadeInDown">
          <Check size={16} className="text-green-400"/>
          <span className="font-black text-sm">초대 링크가 복사되었어요!</span>
        </div>
      )}

      <header className="text-center mb-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="text-[#FFD93D]" fill="#FFD93D"/>
            <h1 className="text-3xl font-black text-[#FF69B4] tracking-tight">팡팡 빙고</h1>
          </div>
          <div className="flex gap-2">
            {user && (
              <button onClick={() => logout()} className="p-2 bg-white rounded-full shadow-sm text-gray-400 hover:text-[#FF6B6B] transition-all">
                <LogOut size={16}/>
              </button>
            )}
          </div>
        </div>
        
        <button onClick={fetchRankings} className="flex items-center gap-2 mx-auto bg-white px-4 py-2 rounded-full shadow-md text-xs font-black text-[#FF8E9E] hover:scale-105 transition-all border-2 border-[#FFD93D]">
          <Trophy size={14}/> 명예의 전당
        </button>
      </header>

      <main className="w-full max-w-md">
        {!user ? (
          <div className="bg-white p-8 rounded-[3rem] shadow-[0_12px_0_#FFB3D9] border-4 border-[#FFD93D] text-center space-y-6 animate__animated animate__fadeInUp">
            <div className="space-y-2">
               <div className="w-20 h-20 bg-[#FFF9E3] rounded-full mx-auto flex items-center justify-center text-5xl shadow-inner border-2 border-dashed border-[#FFD93D]">🧸</div>
               <h2 className="text-2xl font-black text-gray-700">로그인하고 시작해요!</h2>
               <p className="text-gray-400 text-sm font-bold leading-tight">로그인이 꼭 필요해요.</p>
            </div>
            
            {isEmailLogin ? (
              <form onSubmit={onEmailLogin} className="space-y-4 animate__animated animate__fadeIn">
                <input 
                  type="email" placeholder="이메일" 
                  className="w-full bg-gray-50 border-3 border-gray-100 p-4 rounded-3xl focus:border-[#4D96FF] outline-none font-black"
                  value={email} onChange={e => setEmail(e.target.value)} required
                />
                <input 
                  type="password" placeholder="비밀번호" 
                  className="w-full bg-gray-50 border-3 border-gray-100 p-4 rounded-3xl focus:border-[#4D96FF] outline-none font-black"
                  value={password} onChange={e => setPassword(e.target.value)} required
                />
                <button type="submit" className="w-full py-4 bg-[#4D96FF] text-white font-black rounded-3xl shadow-[0_6px_0_#3B7EDF] active:translate-y-1 active:shadow-none transition-all">로그인 / 가입</button>
                <button type="button" onClick={() => setIsEmailLogin(false)} className="text-xs text-gray-400 font-bold hover:underline">돌아가기</button>
              </form>
            ) : (
              <div className="space-y-3">
                <button 
                  onClick={() => loginWithGoogle()}
                  className="w-full py-4 bg-white border-3 border-gray-100 rounded-3xl shadow-[0_6px_0_#f0f0f0] hover:shadow-md transition-all flex items-center justify-center gap-4 active:translate-y-1 active:shadow-none"
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
          <div className="space-y-6 animate__animated animate__fadeInUp">
            {deferredPrompt && (
              <div className="bg-[#4D96FF] p-5 rounded-[2.5rem] shadow-[0_8px_0_#3B7EDF] border-4 border-white flex items-center justify-between gap-4">
                <Smartphone className="text-white" size={32} />
                <div className="flex-1 text-white">
                  <h3 className="font-black">앱으로 설치하기</h3>
                  <p className="text-[10px]">더 빠르게 즐겨보세요!</p>
                </div>
                <button onClick={handleInstall} className="bg-white text-[#4D96FF] font-black px-4 py-2 rounded-2xl">설치</button>
              </div>
            )}

            <div className="bg-white p-8 rounded-[3rem] shadow-[0_12px_0_#FFB3D9] border-4 border-[#FFD93D] space-y-6">
              <div className="flex items-center gap-4 bg-[#FFF9E3] p-4 rounded-3xl border-2 border-dashed border-[#FFD93D]">
                 <img src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} className="w-16 h-16 rounded-2xl border-4 border-white shadow-md" alt="Me"/>
                 <div className="flex-1 overflow-hidden">
                    <p className="text-[10px] font-black text-[#FF6B6B] uppercase tracking-widest">Bingo Master</p>
                    <p className="text-xl font-black text-gray-700 truncate">{user.displayName || user.email?.split('@')[0]}님</p>
                 </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-black text-[#4D96FF] ml-2 flex items-center gap-1">
                  <ShieldCheck size={14}/> 방 번호 (친구와 함께 맞춰요)
                </label>
                <div className="flex gap-2">
                  <input 
                    type="text" value={matchId}
                    onChange={(e) => setMatchId(e.target.value)}
                    placeholder="예: 1234"
                    className="flex-1 bg-[#EBF3FF] border-3 border-[#4D96FF] rounded-2xl px-5 py-4 text-xl font-black focus:outline-none transition-all placeholder:text-gray-300 bubble-shadow"
                  />
                  <button 
                    onClick={handleShare}
                    className="aspect-square w-14 bg-white border-3 border-[#4D96FF] rounded-2xl flex items-center justify-center text-[#4D96FF] hover:bg-blue-50 transition-colors shadow-[0_4px_0_#3B7EDF] active:translate-y-1 active:shadow-none"
                    title="초대 링크 복사"
                  >
                    <Share2 size={24} />
                  </button>
                </div>
              </div>
              
              <button 
                onClick={startGame}
                className="w-full py-5 bg-[#FFD93D] hover:bg-[#FFC300] text-[#4A4A4A] font-black text-2xl rounded-2xl shadow-[0_8px_0_#E5B700] transition-all active:translate-y-1 active:shadow-none flex items-center justify-center gap-3"
              >
                <Gamepad2 size={24} /> 게임 시작하기
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate__animated animate__fadeIn">
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
                <div className="bg-gray-100 px-3 py-1 rounded-full flex items-center gap-1 mb-1">
                   <Users size={12} className="text-gray-400"/>
                   <span className="text-[10px] font-black text-gray-500">{players.length}명</span>
                </div>
                <button onClick={handleShare} className="text-[10px] font-black text-[#4D96FF] flex items-center gap-1 hover:underline">
                  <Share2 size={10}/> 초대하기
                </button>
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
              <div className="bg-white p-4 rounded-3xl border-3 border-pink-100 flex flex-col items-center shadow-sm">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">완성한 줄</span>
                <span className="text-3xl font-black text-[#FF69B4]">{linesCount} / 5</span>
              </div>
              <div className="bg-white p-4 rounded-3xl border-3 border-blue-100 flex flex-col items-center shadow-sm relative group cursor-pointer" onClick={handleShare}>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">방 번호</span>
                <span className="text-2xl font-black text-[#4D96FF] flex items-center gap-2">
                  {matchId} <Share2 size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
                <div className="absolute top-1 right-2 text-[8px] font-black text-blue-300 opacity-0 group-hover:opacity-100">CLICK TO SHARE</div>
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
      
      <footer className="mt-8 text-[10px] text-gray-300 font-black tracking-[0.2em] uppercase opacity-50 text-center">
        Friendship Bingo • Real-time Battle Mode
      </footer>
    </div>
  );
};

export default App;
