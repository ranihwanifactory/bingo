
import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  doc, 
  updateDoc, 
  arrayUnion, 
  getDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, Room, RoomStatus, PlayerInfo } from '../types';

interface LobbyProps {
  onJoinRoom: (roomId: string) => void;
  user: UserProfile;
}

const Lobby: React.FC<LobbyProps> = ({ onJoinRoom, user }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'rooms'), 
      where('status', '==', RoomStatus.WAITING)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roomList: Room[] = [];
      snapshot.forEach((doc) => {
        roomList.push({ id: doc.id, ...doc.data() } as Room);
      });
      setRooms(roomList);
    });
    return unsubscribe;
  }, []);

  const createRoom = async () => {
    setLoading(true);
    try {
      const player: PlayerInfo = {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        ready: true,
        isHost: true,
        bingoCount: 0
      };
      
      const newRoom = {
        hostId: user.uid,
        status: RoomStatus.WAITING,
        players: [player],
        selectedNumbers: [],
        turnIndex: 0,
        createdAt: Date.now()
      };
      
      const docRef = await addDoc(collection(db, 'rooms'), newRoom);
      onJoinRoom(docRef.id);
    } catch (err) {
      setError('방을 만들 수 없어요.');
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (roomId: string) => {
    setLoading(true);
    try {
      const roomRef = doc(db, 'rooms', roomId);
      const roomSnap = await getDoc(roomRef);
      
      if (!roomSnap.exists()) throw new Error('방이 없어요.');
      const roomData = roomSnap.data() as Room;
      
      if (roomData.players.some(p => p.uid === user.uid)) {
        onJoinRoom(roomId);
        return;
      }

      if (roomData.players.length >= 8) throw new Error('방이 꽉 찼어요.');
      if (roomData.status !== RoomStatus.WAITING) throw new Error('이미 시작된 게임이에요.');

      const newPlayer: PlayerInfo = {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        ready: false,
        isHost: false,
        bingoCount: 0
      };

      await updateDoc(roomRef, {
        players: arrayUnion(newPlayer)
      });
      
      onJoinRoom(roomId);
    } catch (err: any) {
      setError(err.message || '참가할 수 없어요.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinByCode = () => {
    if (roomCodeInput.trim()) {
      joinRoom(roomCodeInput.trim());
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Create or Join by code */}
        <div className="bg-white rounded-3xl p-8 shadow-xl border-t-8 border-yellow-400 flex flex-col items-center justify-center text-center">
          <div className="bg-yellow-50 p-6 rounded-full mb-6">
            <i className="fas fa-plus text-4xl text-yellow-500"></i>
          </div>
          <h2 className="text-2xl font-bold mb-4">새로운 게임 만들기</h2>
          <p className="text-gray-500 mb-8 leading-relaxed">친구가 들어올 수 있는 방을 만들고<br/>방 번호를 공유해보세요!</p>
          <button
            onClick={createRoom}
            disabled={loading}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 text-white rounded-2xl font-bold text-xl shadow-lg transition-transform active:scale-95 mb-4"
          >
            {loading ? <i className="fas fa-spinner fa-spin"></i> : '방 만들기'}
          </button>
          
          <div className="w-full flex gap-2 mt-4">
            <input 
              type="text" 
              placeholder="방 번호 입력"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value)}
              className="flex-grow px-4 py-3 rounded-xl border-2 border-gray-100 focus:border-yellow-300 outline-none"
            />
            <button 
              onClick={handleJoinByCode}
              className="px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
            >
              참가
            </button>
          </div>
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        {/* Room List */}
        <div className="bg-white rounded-3xl p-8 shadow-xl border-t-8 border-blue-400">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <i className="fas fa-list-ul text-blue-500"></i>
            대기 중인 방
          </h2>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {rooms.length === 0 ? (
              <div className="py-20 text-center text-gray-400">
                <p>열려있는 방이 없어요.<br/>먼저 방을 만들어보세요!</p>
              </div>
            ) : (
              rooms.map(room => (
                <div key={room.id} className="group p-4 rounded-2xl bg-blue-50 border-2 border-transparent hover:border-blue-200 transition-all flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg text-blue-900">방 번호: {room.id.substring(0,6)}...</h3>
                    <p className="text-sm text-blue-600 flex items-center gap-2">
                      <i className="fas fa-users"></i>
                      참가자: {room.players.length}/8명
                    </p>
                  </div>
                  <button 
                    onClick={() => joinRoom(room.id)}
                    className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl shadow-md transition-all group-hover:scale-105"
                  >
                    참가하기
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-pink-400 to-purple-500 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <h2 className="text-3xl font-bold mb-2">빙고 왕이 되어보세요! 👑</h2>
            <p className="opacity-90">게임을 이길 때마다 랭킹 점수가 쑥쑥 올라갑니다.</p>
          </div>
          <div className="bg-white/20 backdrop-blur-md p-6 rounded-2xl flex items-center gap-4">
            <div className="text-center">
              <p className="text-xs uppercase opacity-70">나의 전적</p>
              <p className="text-2xl font-bold">{user.wins}승 {user.losses}패</p>
            </div>
            <div className="w-px h-10 bg-white/20"></div>
            <div className="text-center">
              <p className="text-xs uppercase opacity-70">승률</p>
              <p className="text-2xl font-bold">
                {user.gamesPlayed === 0 ? '0' : Math.round((user.wins / user.gamesPlayed) * 100)}%
              </p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 -mr-10 -mt-10 opacity-10 transform rotate-12">
          <i className="fas fa-crown text-[200px]"></i>
        </div>
      </div>
    </div>
  );
};

export default Lobby;
