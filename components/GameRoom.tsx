
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  arrayUnion, 
  increment, 
  getDoc, 
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase';
import { Room, UserProfile, RoomStatus, PlayerInfo } from '../types';

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
    });
    return unsubscribe;
  }, [roomId, onExit, winnerFound]);

  const selectedNumbers = useMemo(() => room?.selectedNumbers || [], [room?.selectedNumbers]);
  const players = useMemo(() => room?.players || [], [room?.players]);
  const isMyTurn = useMemo(() => {
    if (!room || room.status !== RoomStatus.PLAYING) return false;
    return room.players[room.turnIndex]?.uid === user.uid;
  }, [room, user.uid]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bingoCount]);

  const handleWin = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(roomRef);
      const data = snap.data() as Room;
      if (data.status === RoomStatus.FINISHED) return;

      // Update room state
      transaction.update(roomRef, { 
        status: RoomStatus.FINISHED,
        winner: user.uid
      });

      // Update all players stats
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

  const startGame = async () => {
    if (players.length < 2) {
      alert('최소 2명 이상이 필요합니다!');
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
        
        {/* Sidebar: Players and Stats */}
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
                <div key={p.uid} className={`flex items-center gap-3 p-3 rounded-2xl border-2 ${room.turnIndex === idx && room.status === RoomStatus.PLAYING ? 'border-pink-500 bg-pink-50' : 'border-gray-50'}`}>
                  <div className="relative">
                    <img 
                      src={p.photoURL || `https://picsum.photos/seed/${p.uid}/40`} 
                      className="w-10 h-10 rounded-full border-2 border-white" 
                      alt="avatar"
                    />
                    {p.isHost && <span className="absolute -top-1 -left-1 bg-yellow-400 text-[10px] px-1 rounded-full">★</span>}
                  </div>
                  <div className="flex-grow">
                    <p className="font-bold text-sm truncate">{p.displayName}</p>
                    <p className="text-xs text-gray-400">
                      {room.status === RoomStatus.PLAYING ? `${p.bingoCount} 빙고` : (p.ready ? '준비완료' : '대기중')}
                    </p>
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

          <div className="bg-white rounded-3xl p-6 shadow-xl border-t-8 border-yellow-400 text-center">
            <h3 className="text-lg font-bold mb-2">나의 빙고 상태</h3>
            <div className="text-4xl font-black text-yellow-500 mb-1">{bingoCount} 줄</div>
            <div className="text-xs text-gray-400">5줄을 완성하면 승리!</div>
          </div>

          <button 
            onClick={onExit}
            className="w-full py-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-2xl transition-colors"
          >
            나가기
          </button>
        </div>

        {/* Main Board */}
        <div className="lg:w-2/3">
          <div className="bg-white rounded-[40px] p-4 sm:p-8 shadow-2xl relative overflow-hidden">
            {room.status === RoomStatus.WAITING ? (
              <div className="py-20 flex flex-col items-center justify-center text-center">
                <div className="w-24 h-24 bg-pink-50 flex items-center justify-center rounded-full mb-6">
                  <i className="fas fa-hourglass-half text-4xl text-pink-400 animate-bounce"></i>
                </div>
                <h2 className="text-3xl font-bold mb-4">플레이어를 기다리고 있어요</h2>
                <p className="text-gray-500 mb-8 max-w-sm">
                  방 번호를 친구에게 공유해주세요!<br/>
                  최소 2명 이상 모여야 게임을 시작할 수 있습니다.
                </p>
                {room.hostId === user.uid ? (
                  <button 
                    onClick={startGame}
                    className="px-12 py-4 bg-pink-500 hover:bg-pink-600 text-white rounded-2xl font-bold text-2xl shadow-xl transition-all active:scale-95"
                  >
                    게임 시작하기!
                  </button>
                ) : (
                  <div className="bg-blue-50 text-blue-600 px-8 py-4 rounded-2xl font-bold">
                    방장이 시작하기를 기다리고 있습니다...
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <span className="text-sm font-bold bg-pink-500 text-white px-3 py-1 rounded-full mb-1 inline-block">5x5 BINGO</span>
                    <h2 className="text-2xl font-bold">빙고판</h2>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">진행 번호: {selectedNumbers.length}개</p>
                    {isMyTurn && <p className="text-pink-600 font-bold animate-pulse">🔥 지금 숫자를 고르세요!</p>}
                  </div>
                </div>

                <div className="bingo-grid p-2 bg-pink-50 rounded-2xl border-4 border-pink-200">
                  {board.map((num) => {
                    const isSelected = selectedNumbers.includes(num);
                    const isLastSelected = selectedNumbers[selectedNumbers.length - 1] === num;
                    
                    return (
                      <button
                        key={num}
                        onClick={() => handleSelectNumber(num)}
                        disabled={room.status === RoomStatus.FINISHED || !isMyTurn || isSelected}
                        className={`
                          aspect-square flex items-center justify-center text-2xl sm:text-3xl font-bold rounded-xl sm:rounded-2xl transition-all transform
                          ${isSelected 
                            ? 'bg-pink-500 text-white shadow-inner scale-95 opacity-90' 
                            : 'bg-white text-gray-700 shadow-md hover:scale-105 active:scale-90'}
                          ${isLastSelected ? 'ring-4 ring-yellow-400 ring-offset-2' : ''}
                          ${!isSelected && isMyTurn ? 'hover:bg-pink-100 cursor-pointer' : 'cursor-default'}
                        `}
                      >
                        {num}
                        {isLastSelected && (
                          <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {room.status === RoomStatus.FINISHED && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center pop-in z-20">
                    <div className="w-24 h-24 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-5xl mb-6 shadow-lg">
                      <i className="fas fa-trophy"></i>
                    </div>
                    <h2 className="text-4xl font-black mb-2">빙고 완성!</h2>
                    <p className="text-xl font-bold text-gray-600 mb-8">
                      {room.winner === user.uid ? '🎉 축하합니다! 당신이 승리했어요!' : `😢 ${players.find(p => p.uid === room.winner)?.displayName}님이 승리했어요.`}
                    </p>
                    <button 
                      onClick={onExit}
                      className="px-12 py-4 bg-pink-500 text-white rounded-2xl font-bold text-xl shadow-xl hover:bg-pink-600 transition-all active:scale-95"
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
    </div>
  );
};

export default GameRoom;
