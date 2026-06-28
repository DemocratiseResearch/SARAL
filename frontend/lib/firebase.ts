import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const requiredConfigValues = Object.values(firebaseConfig);

export const isFirebaseConfigured = requiredConfigValues.every(
  (value) => typeof value === "string" && value.trim().length > 0,
);

// Prevent duplicate app initialization in Next.js dev (HMR).
export const app: FirebaseApp | null = isFirebaseConfigured
  ? getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0]
  : null;

export const auth: Auth | null = app ? getAuth(app) : null;
