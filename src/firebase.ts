// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// TODO: Replace this with your own config object from the Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyD5MZe-ewwvzj4SlyJ6lknn6T9dPziYzVE",
  authDomain: "file-name-generator-auth.firebaseapp.com",
  projectId: "file-name-generator-auth",
  storageBucket: "file-name-generator-auth.firebasestorage.app",
  messagingSenderId: "85884208793",
  appId: "1:85884208793:web:130bd496e3f526e490da08"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
