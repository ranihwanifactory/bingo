import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA3pP5KlWjmVrCnvWN217IAejSxCBRgd0U",
  authDomain: "flutter-ai-playground-90882.firebaseapp.com",
  projectId: "flutter-ai-playground-90882",
  storageBucket: "flutter-ai-playground-90882.firebasestorage.app",
  messagingSenderId: "901403259928",
  appId: "1:901403259928:web:5b19a6b9e5bb45daea7f6d"
};

// Initialize Firebase
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const googleProvider: GoogleAuthProvider = new GoogleAuthProvider();