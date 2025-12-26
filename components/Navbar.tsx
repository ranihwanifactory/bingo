
import React from 'react';
import { auth } from '../firebase';
import { UserProfile } from '../types';

interface NavbarProps {
  profile: UserProfile;
  onShowLobby: () => void;
  onShowLeaderboard: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ profile, onShowLobby, onShowLeaderboard }) => {
  return (
    <nav className="bg-white shadow-md px-6 py-4 flex items-center justify-between sticky top-0 z-50 border-b-4 border-pink-300">
      <div 
        className="flex items-center gap-2 cursor-pointer"
        onClick={onShowLobby}
      >
        <div className="bg-pink-500 text-white w-10 h-10 flex items-center justify-center rounded-xl shadow-lg transform -rotate-6">
          <i className="fas fa-dice-five text-xl"></i>
        </div>
        <h1 className="text-2xl font-bold text-pink-600 hidden sm:block">Super Bingo!</h1>
      </div>

      <div className="flex items-center gap-4 sm:gap-8">
        <button 
          onClick={onShowLobby}
          className="text-gray-600 hover:text-pink-500 transition-colors flex items-center gap-1"
        >
          <i className="fas fa-home"></i>
          <span className="hidden sm:inline">로비</span>
        </button>
        <button 
          onClick={onShowLeaderboard}
          className="text-gray-600 hover:text-pink-500 transition-colors flex items-center gap-1"
        >
          <i className="fas fa-trophy text-yellow-500"></i>
          <span className="hidden sm:inline">랭킹</span>
        </button>
        
        <div className="flex items-center gap-2 border-l pl-4 sm:pl-8">
          <img 
            src={profile.photoURL || `https://picsum.photos/seed/${profile.uid}/40`} 
            alt="profile" 
            className="w-8 h-8 rounded-full border-2 border-pink-200"
          />
          <div className="hidden md:block">
            <p className="text-sm font-bold leading-tight">{profile.displayName}</p>
            <p className="text-xs text-pink-500">{profile.wins}승 {profile.losses}패</p>
          </div>
          <button 
            onClick={() => auth.signOut()}
            className="ml-2 p-2 text-gray-400 hover:text-red-500 transition-colors"
            title="로그아웃"
          >
            <i className="fas fa-sign-out-alt"></i>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
