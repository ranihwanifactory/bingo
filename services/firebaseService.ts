
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInAnonymously, 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  onAuthStateChanged, 
  signOut,
  User 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  increment, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { UserRanking } from "../types";

const firebaseConfig = {
  apiKey: "AIzaSyA3pP5KlWjmVrCnvWN217IAejSxCBRgd0U",
  authDomain: "flutter-ai-playground-90882.firebaseapp.com",
  projectId: "flutter-ai-playground-90882",
  storageBucket: "flutter-ai-playground-90882.firebasestorage.app",
  messagingSenderId: "901403259928",
  appId: "1:901403259928:web:5b19a6b9e5bb45daea7f6d"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  return await signInWithPopup(auth, googleProvider);
};

export const loginWithEmail = async (email: string, pass: string) => {
  try {
    return await signInWithEmailAndPassword(auth, email, pass);
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      return await createUserWithEmailAndPassword(auth, email, pass);
    }
    throw error;
  }
};

export const logout = async () => {
  return await signOut(auth);
};

export const getUserProfile = async (uid: string): Promise<UserRanking | null> => {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    const data = userSnap.data();
    return {
      uid: userSnap.id,
      nickname: data.nickname || "신비한 빙고술사",
      wins: data.wins || 0,
      photoURL: data.photoURL
    };
  }
  return null;
};

export const updateUserInfo = async (uid: string, nickname: string, photoURL?: string) => {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  
  const userData = {
    nickname: nickname,
    photoURL: photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
    lastLogin: new Date()
  };

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      ...userData,
      wins: 0
    });
  } else {
    await updateDoc(userRef, userData);
  }
};

export const recordWin = async (uid: string) => {
  const userRef = doc(db, "users", uid);
  await updateDoc(userRef, {
    wins: increment(1)
  });
};

export const getTopRankings = async (count: number = 10): Promise<UserRanking[]> => {
  const usersRef = collection(db, "users");
  const q = query(usersRef, orderBy("wins", "desc"), limit(count));
  const querySnapshot = await getDocs(q);
  
  const rankings: UserRanking[] = [];
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    rankings.push({
      uid: doc.id,
      nickname: data.nickname || "신비한 빙고술사",
      wins: data.wins || 0,
      photoURL: data.photoURL
    });
  });
  return rankings;
};
