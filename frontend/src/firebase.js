// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {

  apiKey: "AIzaSyD3BjTsjU0bZobvEYkSmci5FwvydC3EhA8",

  authDomain: "n8napp-f254f.firebaseapp.com",

  projectId: "n8napp-f254f",

  storageBucket: "n8napp-f254f.firebasestorage.app",

  messagingSenderId: "915121081343",

  appId: "1:915121081343:web:2d865767464191f23675ca"

};



const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

