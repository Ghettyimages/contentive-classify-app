// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyD4ktRFIjsLE5hdI2E_Vm28f3YDlFIuEjQ",
  authDomain: "signal-sync-c3681.firebaseapp.com",
  projectId: "signal-sync-c3681",
  storageBucket: "signal-sync-c3681.appspot.com",
  messagingSenderId: "492313662329",
  appId: "1:492313662329:web:f88e6e8ada90e0af7615a8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
