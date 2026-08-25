import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAAKCYzK56ZFnN2m97eiKDJlkG67arbh1k",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "yomiyomi-f33df.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "yomiyomi-f33df",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "yomiyomi-f33df.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "502197708411",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:502197708411:web:0ebbe71df0162053b9e4de"
};

let app;
try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
  console.error("Firebase Initialization Error:", e);
}

export const auth = app ? getAuth(app) : ({} as ReturnType<typeof getAuth>);
export const googleProvider = new GoogleAuthProvider();
export const db = app ? getFirestore(app) : ({} as ReturnType<typeof getFirestore>);