import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  arrayUnion, 
  increment, 
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase';
import { Room, UserProfile, RoomStatus } from '../types';

interface GameRoomProps {
  roomId: string;
  user: UserProfile;
  onExit: () => void;
}

const GameRoom: React.FC<GameRoomProps> = ({ roomId, user, onExit }) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [board, setBoard] = useState<number[]>([]);
  const [winnerFound, setWinnerFound] = useState(false);
  const [copied, setCopied] = useState(false);

  // Initialize board once
  useEffect(() => {
    const nums = Array.from({ length: 25 }, (_, i) => i + 1);
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    setBoard(nums);
  }, []);

  // Sync Room data
  useEffect(() => {
    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Room;
        setRoom(data);
        
        // Finalize results if someone won
        if (data.status === RoomStatus.FINISHED && data.winner && !winnerFound) {
          setWinnerFound(true);
        }
      } else {
        onExit();
      }
    }, (error) => {
      console.error("Firestore snapshot error:", error);
    });
    return unsubscribe;
  }, [roomId, onExit, winnerFound]);

  const selectedNumbers = useMemo(() => room?.selectedNumbers || [], [room?.selectedNumbers]);
  const players = useMemo(() => room?.players || [], [room?.players]);
  const isMyTurn = useMemo(() => {
    if (!room || room.status !== RoomStatus.PLAYING) return false;
    return room.players[room.turnIndex]?.uid === user.uid;
  }, [room, user.uid]);

  const currentUserInfo = useMemo(() => players.find(p => p.uid === user.uid), [players, user.uid]);
  const isHost = useMemo(() => room?.hostId === user.uid, [room, user.uid]);
  const allPlayersReady = useMemo(() => players.every(p => p.ready), [players]);

  // Bingo Line Calculation
  const checkBingo = useCallback(() => {
    let lines = 0;
    const size = 5;
    const marked = board.map(n => selectedNumbers.includes(n));

    // Rows
    for (let i = 0; i < size; i++) {
      if (marked.slice(i * size, (i + 1) * size).every(v => v)) lines++;
    }
    // Cols
    for (let i = 0; i < size; i++) {
      let colFilled = true;
      for (let j = 0; j < size; j++) {
        if (!marked[j * size + i]) colFilled = false;
      }
      if (colFilled) lines++;
    }
    // Diagonals
    let diag1 = true;
    let diag2 = true;
    for (let i = 0; i < size; i++) {
      if (!marked[i * size + i]) diag1 = false;
      if (!marked[i * size + (size - 1 - i)]) diag2 = false;
    }
    if (diag1) lines++;
    if (diag2) lines++;

    return lines;
  }, [board, selectedNumbers]);

  const bingoCount = useMemo(() => checkBingo(), [checkBingo]);

  // Update server side bingo count
  useEffect(() => {
    if (room?.status === RoomStatus.PLAYING) {
      const roomRef = doc(db, 'rooms', roomId);
      const updatedPlayers = players.map(p => 
        p.uid === user.uid ? { ...p, bingoCount } : p
      );
      updateDoc(roomRef, { players: updatedPlayers });

      // Win condition: 5 or more lines
      if (bingoCount >= 5 && !room.winner) {
        handleWin();
      }
    }
  }, [bingoCount]);

  const handleWin = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      const data = snap.data() as Room;
      if (data.status === RoomStatus.FINISHED) return;

      transaction.update(roomRef, { 
        status: RoomStatus.FINISHED,
        winner: user.uid
      });

      data.players.forEach(p => {
        const userRef = doc(db, 'users', p.uid);
        if (p.uid === user.uid) {
          transaction.update(userRef, { 
            wins: increment(1), 
            gamesPlayed: increment(1) 
          });
        } else {
          transaction.update(userRef, { 
            losses: increment(1), 
            gamesPlayed: increment(1) 
          });
        }
      });
    });
  };

  const handleSelectNumber = async (num: number) => {
    if (!isMyTurn || selectedNumbers.includes(num)) return;

    const roomRef = doc(db, 'rooms', roomId);
    const nextTurnIndex = (room!.turnIndex + 1) % room!.players.length;

    await updateDoc(roomRef, {
      selectedNumbers: arrayUnion(num),
      turnIndex: nextTurnIndex
    });
  };

  const toggleReady = async () => {
    if (isHost || !room) return;
    const roomRef = doc(db, 'rooms', roomId);
    const updatedPlayers = players.map(p => 
      p.uid === user.uid ? { ...p, ready: !p.ready } : p
    );
    await updateDoc(roomRef, { players: updatedPlayers });
  };

  const startGame = async () => {
    if (players.length < 2) {
      alert('최소 2명 이상이 필요합니다!');
      return;
    }
    if (!allPlayersReady) {
      alert('모든 플레이어가 준비를 완료해야 합니다!');
      return;
    }
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      status: RoomStatus.PLAYING,
      turnIndex: 0
    });
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!room) return <div className="p-20 text-center">방 정보를 불러오는 중...</div>;

  return (
    <div className="min-h-screen bg-pink-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-6">
        
        {/* Sidebar */}
        <div className="lg:w-1/3 flex flex-col gap-4">
          <div className="bg-white rounded-3xl p-6 shadow-xl border-t-8 border-pink-500">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <i className="fas fa-users text-pink-500"></i>
                플레이어
              </h2>
              <button 
                onClick={copyRoomCode}
                className="text-xs bg-gray-100 px-3 py-1 rounded-full hover:bg-gray-200"
              >
                {copied ? '복사됨!' : '방 코드 복사'}
              </button>
            </div>
            
            <div className="space-y-3">
              {players.map((p, idx) => (
                <div key={p.uid} className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${room.turnIndex === idx && room.status === RoomStatus.PLAYING ? 'border-pink-500 bg-pink-50' : 'border-gray-50'}`}>
                  <div className="relative">
                    <img 
                      src={p.photoURL || `https://picsum.photos/seed/${p.uid}/40`} 
                      className="w-10 h-10 rounded-full border-2 border-white" 
                      alt="avatar"
                    />
                    {p.isHost && <span className="absolute -top-1 -left-1 bg-yellow-400 text-[10px] px-1 rounded-full border border-white">★</span>}
                  </div>
                  <div className="flex-grow">
                    <p className="font-bold text-sm truncate">{p.displayName}</p>
                    <div className="flex items-center gap-1">
                      {room.status === RoomStatus.PLAYING ? (
                        <p className="text-xs text-pink-500 font-bold">{p.bingoCount} 빙고</p>
                      ) : (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm transition-colors ${p.ready ? 'bg-green-100 text-green-600' : 'bg-orange-50 text-orange-400'}`}>
                          <i className={`fas ${p.ready ? 'fa-check-circle' : 'fa-clock animate-pulse'}`}></i>
                          {p.ready ? '준비완료' : '대기중'}
                        </span>
                      )}
                    </div>
                  </div>
                  {room.status === RoomStatus.PLAYING && room.turnIndex === idx && (
                    <div className="bg-pink-500 text-white text-[10px] px-2 py-1 rounded-full animate-pulse">
                      차례
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {room.status === RoomStatus.PLAYING && (
            <div className="bg-white rounded-3xl p-6 shadow-xl border-t-8 border-yellow-400 text-center pop-in">
              <h3 className="text-lg font-bold mb-2">나의 빙고 상태</h3>
              <div className="text-4xl font-black text-yellow-500 mb-1">{bingoCount} 줄</div>
              <div className="text-xs text-gray-400">5줄을 완성하면 승리!</div>
            </div>
          )}

          {room.status === RoomStatus.WAITING && !isHost && (
            <button 
              onClick={toggleReady}
              className={`w-full py-4 rounded-2xl font-bold text-xl shadow-xl transition-all active:scale-95 border-b-4 ${
                currentUserInfo?.ready 
                ? 'bg-green-500 hover:bg-green-600 border-green-700 text-white' 
                : 'bg-yellow-400 hover:bg-yellow-500 border-yellow-600 text-white'
              }`}
            >
              {currentUserInfo?.ready ? (
                <><i className="fas fa-check mr-2"></i> 준비 완료!</>
              ) : (
                <><i className="fas fa-play mr-2"></i> 준비하기</>
              )}
            </button>
          )}

          <button 
            onClick={onExit}
            className="w-full py-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-2xl transition-colors"
          >
            나가기
          </button>
        </div>

        {/* Main Board */}
        <div className="lg:w-2/3">
          <div className="bg-white rounded-[40px] p-4 sm:p-8 shadow-2xl relative overflow-hidden h-full min-h-[500px] flex flex-col">
            {room.status === RoomStatus.WAITING ? (
              <div className="flex-grow flex flex-col items-center justify-center text-center py-10">
                <div className="w-24 h-24 bg-pink-50 flex items-center justify-center rounded-full mb-6 relative">
                  <i className="fas fa-hourglass-half text-4xl text-pink-400 animate-bounce"></i>
                  <div className="absolute inset-0 border-4 border-dashed border-pink-200 rounded-full animate-spin-slow"></div>
                </div>
                <h2 className="text-3xl font-bold mb-4">방 번호: <span className="text-pink-600">{roomId.substring(0, 8)}</span></h2>
                <p className="text-gray-500 mb-8 max-w-sm">
                  방 번호를 친구에게 공유해주세요!<br/>
                  모든 플레이어가 준비를 마쳐야 시작할 수 있습니다.
                </p>
                
                {isHost ? (
                  <div className="flex flex-col items-center gap-4">
                    <button 
                      onClick={startGame}
                      disabled={players.length < 2 || !allPlayersReady}
                      className={`px-12 py-5 rounded-2xl font-bold text-2xl shadow-xl transition-all transform active:scale-95 ${
                        players.length >= 2 && allPlayersReady
                        ? 'bg-pink-500 hover:bg-pink-600 text-white hover:-translate-y-1'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-70'
                      }`}
                    >
                      게임 시작하기!
                    </button>
                    {players.length < 2 && <p className="text-red-400 text-sm font-bold">최소 2명의 플레이어가 필요합니다.</p>}
                    {players.length >= 2 && !allPlayersReady && <p className="text-orange-400 text-sm font-bold animate-pulse">다른 플레이어의 준비를 기다리는 중...</p>}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="bg-blue-50 text-blue-600 px-8 py-5 rounded-3xl font-bold text-xl border-2 border-blue-100 flex items-center gap-3">
                      <div className="w-3 h-3 bg-blue-500 rounded-full animate-ping"></div>
                      방장이 게임을 시작하기를 기다리고 있어요
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="text-sm font-bold bg-pink-500 text-white px-3 py-1 rounded-full mb-1 inline-block shadow-sm">5x5 BINGO</span>
                    <h2 className="text-2xl font-bold">빙고판</h2>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">진행 번호: {selectedNumbers.length}개</p>
                    {isMyTurn && <p className="text-pink-600 font-bold animate-pulse">🔥 당신의 차례!</p>}
                  </div>
                </div>

                <div className="bingo-grid p-2 bg-pink-50 rounded-2xl border-4 border-pink-200 flex-grow">
                  {board.map((num) => {
                    const isSelected = selectedNumbers.includes(num);
                    const isLastSelected = selectedNumbers[selectedNumbers.length - 1] === num;
                    
                    return (
                      <button
                        key={num}
                        onClick={() => handleSelectNumber(num)}
                        disabled={room.status === RoomStatus.FINISHED || !isMyTurn || isSelected}
                        className={`
                          relative aspect-square flex items-center justify-center text-2xl sm:text-4xl font-black rounded-xl sm:rounded-2xl transition-all transform
                          ${isSelected 
                            ? 'bg-pink-500 text-white shadow-inner scale-95 opacity-90' 
                            : 'bg-white text-gray-700 shadow-md hover:scale-105 active:scale-90'}
                          ${isLastSelected ? 'ring-4 ring-yellow-400 ring-offset-2 z-10' : ''}
                          ${!isSelected && isMyTurn ? 'hover:bg-pink-100 cursor-pointer' : 'cursor-default'}
                        `}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>

                {room.status === RoomStatus.FINISHED && (
                  <div className="absolute inset-0 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center pop-in z-20">
                    <div className="w-32 h-32 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-6xl mb-6 shadow-2xl border-4 border-white animate-bounce">
                      <i className="fas fa-trophy"></i>
                    </div>
                    <h2 className="text-5xl font-black mb-2 text-gray-800">빙고 완성!</h2>
                    <p className="text-2xl font-bold text-pink-600 mb-8">
                      {room.winner === user.uid ? '🎉 축하합니다! 승리했어요!' : '😢 아쉽네요! 다음에 다시 도전해요!'}
                    </p>
                    <button 
                      onClick={onExit}
                      className="px-16 py-5 bg-pink-500 text-white rounded-2xl font-bold text-2xl shadow-xl hover:bg-pink-600 transition-all active:scale-95"
                    >
                      로비로 돌아가기
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </div>
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default GameRoom;