
import React, { useState } from 'react';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError('구글 로그인에 실패했어요.');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCred.user, { displayName: name });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(isSignUp ? '회원가입 실패' : '로그인 실패. 이메일과 비밀번호를 확인하세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-pink-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border-t-8 border-pink-500 pop-in">
        <div className="text-center mb-8">
          <div className="inline-block bg-pink-100 p-4 rounded-full mb-4">
            <i className="fas fa-gamepad text-5xl text-pink-500"></i>
          </div>
          <h1 className="text-4xl font-bold text-pink-600 mb-2">Super Bingo!</h1>
          <p className="text-gray-500">친구들과 함께 즐기는 신나는 숫자 빙고!</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-4 text-sm flex items-center gap-2">
            <i className="fas fa-exclamation-circle"></i>
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">별명</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-300"
                placeholder="어떤 이름으로 불리고 싶나요?"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-300"
              placeholder="example@bingo.com"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-300"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-pink-500 hover:bg-pink-600 text-white rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:translate-y-0"
          >
            {loading ? <i className="fas fa-spinner fa-spin"></i> : (isSignUp ? '빙고 시작하기!' : '로그인')}
          </button>
        </form>

        <div className="relative my-8 text-center">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
          <span className="relative bg-white px-4 text-gray-400 text-sm">또는</span>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-4 bg-white border-2 border-gray-100 hover:border-pink-200 text-gray-700 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all hover:bg-gray-50 active:scale-95 shadow-sm"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/layout/google.svg" className="w-6 h-6" alt="google" />
          구글로 로그인
        </button>

        <p className="text-center mt-6 text-gray-500">
          {isSignUp ? '이미 계정이 있나요?' : '처음 오셨나요?'}
          <button 
            onClick={() => setIsSignUp(!isSignUp)}
            className="ml-2 text-pink-600 font-bold hover:underline"
          >
            {isSignUp ? '로그인하기' : '회원가입하기'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;
