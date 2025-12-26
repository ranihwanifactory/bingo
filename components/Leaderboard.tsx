
import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

const Leaderboard: React.FC = () => {
  const [rankings, setRankings] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      orderBy('wins', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach((doc) => {
        users.push(doc.data() as UserProfile);
      });
      setRankings(users);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return <div className="p-20 text-center">랭킹을 불러오는 중...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border-t-8 border-purple-500 animate-fade-in">
        <div className="p-8 bg-purple-50 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-purple-900 flex items-center gap-3">
              <i className="fas fa-award text-purple-500"></i>
              명예의 전당
            </h2>
            <p className="text-purple-600 mt-1">최고의 빙고 용사들을 확인해보세요!</p>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm text-center">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">총 참가자</p>
            <p className="text-2xl font-black text-purple-600">{rankings.length}</p>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {rankings.map((user, index) => {
            const winRate = user.gamesPlayed > 0 
              ? Math.round((user.wins / user.gamesPlayed) * 100) 
              : 0;
            
            return (
              <div key={user.uid} className="p-6 flex items-center hover:bg-gray-50 transition-colors">
                <div className="w-12 text-center">
                  {index < 3 ? (
                    <span className={`
                      w-8 h-8 rounded-full flex items-center justify-center mx-auto text-lg font-bold
                      ${index === 0 ? 'bg-yellow-400 text-white' : ''}
                      ${index === 1 ? 'bg-gray-300 text-white' : ''}
                      ${index === 2 ? 'bg-orange-400 text-white' : ''}
                    `}>
                      {index === 0 && <i className="fas fa-crown"></i>}
                      {index > 0 && index + 1}
                    </span>
                  ) : (
                    <span className="text-gray-400 font-bold">{index + 1}</span>
                  )}
                </div>

                <div className="flex items-center gap-4 flex-grow px-4">
                  <img 
                    src={user.photoURL || `https://picsum.photos/seed/${user.uid}/50`} 
                    alt="profile" 
                    className="w-12 h-12 rounded-full border-2 border-purple-100 shadow-sm"
                  />
                  <div>
                    <h4 className="font-bold text-gray-900">{user.displayName}</h4>
                    <p className="text-xs text-gray-500">{user.gamesPlayed}경기 참여</p>
                  </div>
                </div>

                <div className="text-right flex gap-8">
                  <div className="hidden sm:block">
                    <p className="text-xs text-gray-400 uppercase font-bold">승률</p>
                    <p className="font-bold text-purple-600">{winRate}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase font-bold">승리</p>
                    <p className="text-xl font-black text-gray-900">{user.wins}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {rankings.length === 0 && (
          <div className="p-20 text-center text-gray-400">
            아직 랭킹 정보가 없어요.
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
