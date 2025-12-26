
import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        setUser(authUser);
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
      } else {
        setUser(null);
        setProfile(null);
        setCurrentRoomId(null);
      }
    });
    return unsubscribe;
  }, []);

  if (!user) {
    return <Login />;
  }

  if (currentRoomId) {
    return (
      <GameRoom 
        roomId={currentRoomId} 
        user={profile!} 
        onExit={() => setCurrentRoomId(null)} 
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar 
        profile={profile!} 
        onShowLobby={() => setView('lobby')}
        onShowLeaderboard={() => setView('leaderboard')}
      />
      
      <main className="flex-grow container mx-auto px-4 py-8">
        {view === 'lobby' ? (
          <Lobby onJoinRoom={setCurrentRoomId} user={profile!} />
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
