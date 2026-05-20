import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCntVnew9yfmqcUc2XFUVVCBzbOqx6AqAo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "heliosync.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "heliosync",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "heliosync.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "55135390908",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:55135390908:web:e91cf4a5cd38bc390b14b9",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-6NCTTY7DTG",
};

export const isFirebaseMockConfig =
  firebaseConfig.apiKey === "dummy_api_key" ||
  firebaseConfig.authDomain === "dummy_domain";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
