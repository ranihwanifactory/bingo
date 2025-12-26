
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, User } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
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

export const loginAnonymously = async () => {
  return await signInAnonymously(auth);
};

export const updateUserInfo = async (uid: string, nickname: string) => {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    await setDoc(userRef, {
      nickname: nickname,
      wins: 0,
      lastLogin: new Date()
    });
  } else {
    await updateDoc(userRef, {
      nickname: nickname,
      lastLogin: new Date()
    });
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
      nickname: data.nickname || "익명 친구",
      wins: data.wins || 0
    });
  });
  return rankings;
};
