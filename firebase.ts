
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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
export const googleProvider = new GoogleAuthProvider();
