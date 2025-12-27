import React, { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import Login from './components/Login';
import Lobby from './components/Lobby';
import GameRoom from './components/GameRoom';
import Navbar from './components/Navbar';
import Leaderboard from './components/Leaderboard';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [view, setView] = useState<'lobby' | 'leaderboard'>('lobby');
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // 5초 후에도 응답이 없으면 강제로 초기화 완료 처리 (로그인 화면으로 유도)
    const timeout = setTimeout(() => {
      if (initializing) setInitializing(false);
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        setUser(authUser);
        try {
          const userRef = doc(db, 'users', authUser.uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            setProfile(userSnap.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: authUser.uid,
              email: authUser.email || '',
              displayName: authUser.displayName || '빙고용사',
              photoURL: authUser.photoURL || '',
              wins: 0,
              losses: 0,
              gamesPlayed: 0
            };
            await setDoc(userRef, newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          console.error("Firestore loading error:", error);
          // Firestore 오류 시에도 authUser 정보로 fallback 사용
        }
      } else {
        setUser(null);
        setProfile(null);
        setCurrentRoomId(null);
      }
      setInitializing(false);
      clearTimeout(timeout);
    });
    
    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const safeProfile = useMemo((): UserProfile | null => {
    if (!user) return null;
    return profile || {
      uid: user.uid,
      displayName: user.displayName || '빙고용사',
      email: user.email || '',
      photoURL: user.photoURL || '',
      wins: 0,
      losses: 0,
      gamesPlayed: 0
    };
  }, [user, profile]);

  if (initializing) {
    return (
      <div className="min-h-screen bg-pink-50 flex flex-col items-center justify-center">
        <div className="bg-white p-12 rounded-[40px] shadow-2xl flex flex-col items-center pop-in text-center">
          <div className="relative mb-6">
            <i className="fas fa-dice-five text-6xl text-pink-500 animate-bounce"></i>
            <div className="absolute -bottom-2 -right-2 bg-yellow-400 w-6 h-6 rounded-full animate-ping"></div>
          </div>
          <p className="text-pink-600 font-bold text-2xl mb-2">잠시만 기다려주세요</p>
          <p className="text-gray-400 text-sm">용사님의 정보를 불러오고 있습니다...</p>
        </div>
      </div>
    );
  }

  // 로그인되지 않았거나 프로필 생성에 실패한 경우 로그인 화면으로
  if (!user || !safeProfile) {
    return <Login />;
  }

  if (currentRoomId) {
    return (
      <GameRoom 
        roomId={currentRoomId} 
        user={safeProfile} 
        onExit={() => setCurrentRoomId(null)} 
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar 
        profile={safeProfile} 
        onShowLobby={() => setView('lobby')}
        onShowLeaderboard={() => setView('leaderboard')}
      />
      
      <main className="flex-grow container mx-auto px-4 py-8">
        {view === 'lobby' ? (
          <Lobby onJoinRoom={setCurrentRoomId} user={safeProfile} />
        ) : (
          <Leaderboard />
        )}
      </main>
      
      <footer className="bg-white py-4 text-center text-gray-500 text-sm border-t border-pink-100">
        &copy; 2024 Super Bingo Hero. Fun for Kids!
      </footer>
    </div>
  );
}