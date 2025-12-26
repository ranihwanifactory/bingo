
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
  Gamepad2, Trophy, User as UserIcon, LogOut, 
  Sparkles, Check, Medal,
  MessageCircle, PlusCircle, LogIn, Swords, ExternalLink, AlertCircle, X
} from 'lucide-react';
import confetti from 'canvas-confetti';

const PLAYER_COLORS = ['#FF6B6B', '#4D96FF', '#6BCB77', '#FFD93D', '#917FB3', '#FF9F43'];

const generateRoomId = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

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
  const [isExternalBrowserRequired, setIsExternalBrowserRequired] = useState(false);

  const playersRef = useRef<PlayerInfo[]>([]);
  playersRef.current = players;
  const cellsRef = useRef<BingoCell[]>([]);
  cellsRef.current = cells;
  const currentTurnIdxRef = useRef(0);
  currentTurnIdxRef.current = currentTurnIdx;
  const gameEndedRef = useRef(false);

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.indexOf('kakaotalk') > -1 || ua.indexOf('line') > -1) {
      setIsExternalBrowserRequired(true);
    }
    getTopRankings(10).then(setRankings);
  }, []);

  const resetAllState = useCallback(() => {
    setStatus('idle');
    setActiveTab('game');
    setMatchId('');
    setCells([]);
    setLinesCount(0);
    setPlayers([]);
    setCurrentTurnIdx(0);
    setCommentary("친구들과 함께하는 신나는 빙고 타임! 🌈");
    gameEndedRef.current = false;
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
    if (d2.every(idx => board[idx].isMarked)) lines.push(d2);
    return { count: lines.length, winningIndices: new Set(lines.flat()) };
  };

  const fetchUserStats = useCallback(async (uid: string) => {
    try {
      const stats = await getUserProfile(uid);
      if (stats) setUserStats(stats);
    } catch (e) { console.error(e); }
  }, []);

  const fetchH2HRecords = useCallback(async (newPlayers: PlayerInfo[]) => {
    if (!auth.currentUser) return;
    try {
      const updatedPlayers = await Promise.all(newPlayers.map(async (p) => {
        if (p.id === auth.currentUser?.uid) return p;
        const record = await getH2HRecord(auth.currentUser!.uid, p.id);
        return {
          ...p,
          h2hRecord: {
            myWins: record[auth.currentUser!.uid] || 0,
            opponentWins: record[p.id] || 0
          }
        };
      }));
      setPlayers(updatedPlayers);
    } catch (e) { console.error(e); }
  }, []);

  const startGame = useCallback(async (forcedId?: string) => {
    // forcedId가 없으면 matchId를 쓰고, 그것도 없으면 새로 생성함
    const idToUse = (forcedId || matchId || generateRoomId()).trim().toUpperCase();
    
    setMatchId(idToUse);
    
    // 초대받아 들어온 경우(forcedId가 있는 경우) 처음엔 보드 없이 시작해서 Host 정보를 기다림
    const isHost = !forcedId; 
    const initialBoard = isHost ? generateRandomBoard() : [];
    
    setCells(initialBoard.map(v => ({ value: v, isMarked: false, isWinningCell: false })));
    setLinesCount(0);
    setPlayers([{ 
      id: auth.currentUser!.uid, 
      name: auth.currentUser!.displayName || "플레이어", 
      photoURL: auth.currentUser!.photoURL || "", 
      color: PLAYER_COLORS[0] 
    }]);
    setCurrentTurnIdx(0);
    gameEndedRef.current = false;
    setStatus('playing');
    setActiveTab('game');
    sounds.playJoin();

    if (!isHost) {
      setCommentary("방장으로부터 빙고판을 불러오고 있어요... 🔄");
    }
  }, [matchId]);

  const syncStateToOthers = useCallback(() => {
    if (!matchId || !user) return;
    const currentPs = playersRef.current;
    
    // 방장(목록의 첫 번째)만 현재의 보드와 정보를 동기화용으로 전송
    if (currentPs.length > 0 && currentPs[0].id === user.uid) {
      const markedValues = cellsRef.current
        .filter(c => c.isMarked)
        .map(c => ({ value: c.value, senderId: c.markedBy }));
      
      const boardValues = cellsRef.current.map(c => c.value);
      
      publishMessage(matchId, {
        action: 'sync_state',
        markedValues,
        boardValues,
        currentTurnIdx: currentTurnIdxRef.current,
        players: currentPs.map(({h2hRecord, ...rest}) => rest)
      });
    }
  }, [matchId, user]);

  const handleMarkAction = useCallback(async (value: number, senderId: string) => {
    const currentCells = [...cellsRef.current];
    const targetIdx = currentCells.findIndex(c => c.value === value);
    if (targetIdx === -1 || currentCells[targetIdx].isMarked) return;

    sounds.playPop();
    currentCells[targetIdx] = { ...currentCells[targetIdx], isMarked: true, markedBy: senderId };

    const { count, winningIndices } = calculateBingo(currentCells);
    const updatedCells = currentCells.map((c, i) => ({ ...c, isWinningCell: winningIndices.has(i) }));
    setCells(updatedCells);
    
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        await updateUserInfo(u.uid, u.displayName || u.email?.split('@')[0] || "빙고술사", u.photoURL || "");
        fetchUserStats(u.uid);
        if (roomFromUrl && status === 'idle') {
          setTimeout(() => startGame(roomFromUrl.toUpperCase().trim()), 800);
        }
      } else {
        setUser(null);
        resetAllState();
      }
      setAuthLoading(false);
    });

    return () => unsub();
  }, [fetchUserStats, resetAllState, startGame]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let heartbeatInterval: any;

    if (status === 'playing' && matchId && user) {
      const cleanMatchId = matchId.trim().toUpperCase();
      
      unsubscribe = subscribeToMatch(cleanMatchId, (payload) => {
        if (!payload || !payload.action) return;

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
              // 새로 들어온 친구에게 나를 알리고 판 상태 전송
              publishMessage(cleanMatchId, { 
                action: 'presence', 
                playerId: user.uid, 
                name: user.displayName || user.email?.split('@')[0], 
                photoURL: user.photoURL 
              });
              setTimeout(syncStateToOthers, 600);
            }
            return newPlayersList;
          });
        } else if (payload.action === 'mark') {
          handleMarkAction(payload.value, payload.senderId);
        } else if (payload.action === 'sync_state') {
          // 게스트가 방장으로부터 데이터를 받는 시점
          if (payload.boardValues && payload.boardValues.length === 25 && (cellsRef.current.length === 0 || cellsRef.current.every(c => !c.value))) {
            setCells(payload.boardValues.map((v: number) => ({
              value: v,
              isMarked: false,
              isWinningCell: false
            })));
            setCommentary("빙고판을 성공적으로 받아왔어요! 🍀");
          }

          if (payload.players) {
            const syncedPlayers = payload.players.map((p: any, idx: number) => ({
              ...p,
              color: PLAYER_COLORS[idx % PLAYER_COLORS.length]
            })).sort((a: any, b: any) => a.id.localeCompare(b.id));
            
            setPlayers(prev => {
              const combined = [...prev];
              syncedPlayers.forEach((sp: any) => {
                if (!combined.find(p => p.id === sp.id)) combined.push(sp);
              });
              const sorted = combined.sort((a, b) => a.id.localeCompare(b.id));
              fetchH2HRecords(sorted);
              return sorted;
            });
          }
          
          setTimeout(() => {
            const markedVals = (payload.markedValues || []) as {value: number, senderId: string}[];
            let updatedCells = [...cellsRef.current];
            if (updatedCells.length === 25) {
              markedVals.forEach(mv => {
                const idx = updatedCells.findIndex(c => c.value === mv.value);
                if (idx !== -1) updatedCells[idx] = { ...updatedCells[idx], isMarked: true, markedBy: mv.senderId };
              });
              const { count, winningIndices } = calculateBingo(updatedCells);
              setCells(updatedCells.map((c, i) => ({ ...c, isWinningCell: winningIndices.has(i) })));
              setLinesCount(count);
              if (payload.currentTurnIdx !== undefined) setCurrentTurnIdx(payload.currentTurnIdx);
            }
          }, 300);
        }
      });

      // Heartbeat: 2.5초마다 나를 알려서 늦게 온 친구도 나를 찾을 수 있게 함
      heartbeatInterval = setInterval(() => {
        if (playersRef.current.length < 2) {
          publishMessage(cleanMatchId, { 
            action: 'presence', 
            playerId: user.uid, 
            name: user.displayName || user.email?.split('@')[0], 
            photoURL: user.photoURL 
          });
        }
      }, 2500);

      // 입장 신호 (지연을 두어 채널이 열릴 때까지 대기)
      setTimeout(() => {
        publishMessage(cleanMatchId, { 
          action: 'join', 
          playerId: user.uid, 
          name: user.displayName || user.email?.split('@')[0], 
          photoURL: user.photoURL 
        });
      }, 1500);
    }
    
    return () => {
      unsubscribe?.();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
  }, [status, matchId, user, handleMarkAction, syncStateToOthers, fetchH2HRecords]);

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

  const handleShare = async () => {
    const id = matchId || generateRoomId();
    if (!matchId) setMatchId(id);
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: '팡팡 빙고!', text: `방 번호 [${id}] 로 들어와!`, url: shareUrl });
      } catch (e) { handleCopyLink(id); }
    } else {
      handleCopyLink(id);
    }
  };

  const handleCopyLink = async (id?: string) => {
    const rid = id || matchId;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${rid}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (e) { alert("링크 복사 실패!"); }
  };

  const openInChrome = () => {
    const url = window.location.href;
    if (navigator.userAgent.match(/Android/i)) {
      window.location.href = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
    } else {
      alert("브라우저 설정에서 '다른 브라우저로 열기'를 선택해주세요!");
    }
  };

  if (authLoading) return <div className="min-h-screen flex flex-col items-center justify-center bg-[#FFF9E3] font-black text-[#FFD93D] gap-4"><div className="animate-spin text-5xl">🧸</div><p>팡팡 빙고 입장 중...</p></div>;

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF9E3] text-[#4A4A4A] select-none safe-area-inset overflow-hidden">
      {isExternalBrowserRequired && (
        <div className="bg-[#4D96FF] text-white p-3 flex items-center justify-between animate__animated animate__fadeInDown z-[100]">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span className="text-xs font-black">브라우저에서 즐기시면 더 안정적이에요!</span>
          </div>
          <button onClick={openInChrome} className="bg-white text-[#4D96FF] px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-1 shadow-sm">
            <ExternalLink size={12} /> 열기
          </button>
        </div>
      )}

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
                <button onClick={() => loginWithGoogle()} className="w-full py-5 bg-white border-4 border-[#FFD93D] rounded-[2rem] shadow-[0_8px_0_#FFD93D] flex items-center justify-center gap-4 transition-all active:translate-y-1">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="G"/>
                  <span className="text-xl font-black">시작하기</span>
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
                    {/* FIX: 방 만들기 클릭 시 generationRoomId()를 직접 호출하여 matchId가 비어있는 현상 해결 */}
                    <button onClick={() => startGame(generateRoomId())} className="w-full py-5 bg-[#FFD93D] text-[#4A4A4A] font-black text-xl rounded-[1.5rem] shadow-[0_8px_0_#E5B700] active:translate-y-1">방 만들기</button>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-[2px] bg-gray-100"></div>
                      <span className="text-xs font-black text-gray-300">또는</span>
                      <div className="flex-1 h-[2px] bg-gray-100"></div>
                    </div>
                    <div className="space-y-3">
                      <div className="relative">
                        <input type="text" value={matchId} onChange={(e)=>setMatchId(e.target.value.toUpperCase())} placeholder="방 번호 입력" className="w-full bg-[#F0F7FF] border-4 rounded-[1.5rem] p-4 text-center text-2xl font-black outline-none border-[#4D96FF]" />
                        {matchId && <button onClick={()=>setMatchId('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"><X size={20}/></button>}
                      </div>
                      <button onClick={() => startGame()} className="w-full py-5 bg-[#4D96FF] text-white font-black text-xl rounded-[1.5rem] shadow-[0_8px_0_#2B66CC] active:translate-y-1">입장하기</button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide px-1">
                  {players.map((p, idx) => (
                    <div key={p.id} className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-2xl border-2 transition-all ${currentTurnIdx === idx ? 'bg-white border-[#FFD93D] shadow-lg scale-105 z-10' : 'bg-white/50 border-transparent opacity-60'}`}>
                      <div className="relative">
                        <img src={p.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.id}`} className="w-10 h-10 rounded-xl border-2 border-white" style={{ backgroundColor: p.color }} />
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
                <div className="bg-white rounded-[2rem] p-4 mb-4 border-4 border-gray-50 shadow-sm flex items-center justify-between">
                   <div className="flex flex-col">
                     <span className="text-[10px] font-black text-gray-300 uppercase">ROOM: {matchId}</span>
                     <p className="text-base font-black text-gray-700">
                       {players.length < 2 ? "친구를 기다려요..." : (players[currentTurnIdx]?.id === user?.uid ? <span className="text-[#FF69B4] animate-pulse">내 차례! 🍎</span> : <span>{players[currentTurnIdx]?.name} 차례</span>)}
                     </p>
                   </div>
                   <div className="bg-[#FFF0F6] px-6 py-2 rounded-2xl border-2 border-pink-100 flex flex-col items-center">
                      <span className="text-[10px] font-black text-pink-300 uppercase">LINES</span>
                      <span className="text-2xl font-black text-[#FF69B4]">{linesCount} / 5</span>
                   </div>
                </div>
                <div className="mb-4 bg-white/80 backdrop-blur-sm p-3 rounded-[1.5rem] border-2 border-dashed border-[#FFD93D] flex items-center gap-3">
                  <div className="bg-[#FFD93D] p-2 rounded-full text-white flex-shrink-0"><MessageCircle size={16} fill="white" /></div>
                  <p className="text-xs font-bold text-gray-500 italic truncate">"{commentary}"</p>
                </div>
                <div className="flex-1 flex items-center justify-center pb-20">
                  {cells.length > 0 && cells[0].value ? (
                    <BingoBoard cells={cells} onCellClick={handleCellClick} status={status} playerColors={players.reduce((acc,p)=>({...acc, [p.id]:p.color}), {})} />
                  ) : (
                    <div className="flex flex-col items-center gap-4 animate-pulse">
                      <div className="w-64 h-64 bg-white/50 rounded-[2rem] border-4 border-dashed border-gray-200 flex items-center justify-center">
                        <span className="text-4xl">🔎</span>
                      </div>
                      <p className="font-black text-gray-400 text-center">방장의 빙고판 정보를<br/>기다리고 있어요...</p>
                    </div>
                  )}
                </div>
                {status === 'won' && (
                   <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm p-6">
                     <div className="bg-white w-full p-8 rounded-[3rem] border-8 border-[#FFD93D] text-center animate__animated animate__jackInTheBox shadow-2xl">
                       <div className="text-6xl mb-2">🏆</div>
                       <h3 className="text-3xl font-black text-[#FF69B4] mb-1">BINGO!</h3>
                       <p className="font-bold text-gray-500 mb-6">{players[currentTurnIdx]?.name}님이 승리했어요!</p>
                       <button onClick={()=>setStatus('idle')} className="w-full py-4 bg-[#FFD93D] rounded-2xl font-black text-xl shadow-[0_6px_0_#E5B700]">확인</button>
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
                <button onClick={()=>logout()} className="text-gray-300 hover:text-red-400 font-black text-sm flex items-center gap-2 mx-auto mt-4 py-2 px-4 border-2 border-gray-50 rounded-2xl">
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
