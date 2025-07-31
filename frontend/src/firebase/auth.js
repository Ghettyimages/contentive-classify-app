import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc 
} from 'firebase/firestore';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBx4nhEmWA4KtRAz2Dlv5ksHXAl28PD204h",
  authDomain: "signal-sync-c3681.firebaseapp.com",
  projectId: "signal-sync-c3681",
  storageBucket: "signal-sync-c3681.appspot.com",
  messagingSenderId: "102367435033860368343",
  appId: "1:102367435033860368343:web:your-app-id"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Firestore
export const db = getFirestore(app);

// Google provider
export const googleProvider = new GoogleAuthProvider();

// Auth functions
export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

export const signUpWithEmail = (email, password) => 
  createUserWithEmailAndPassword(auth, email, password);

export const signInWithEmail = (email, password) => 
  signInWithEmailAndPassword(auth, email, password);

export const signOutUser = () => signOut(auth);

export const onAuthStateChange = (callback) => onAuthStateChanged(auth, callback);

// User management in Firestore
export const createUserProfile = async (user) => {
  if (!user) return;

  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    const { displayName, email, photoURL } = user;
    const createdAt = new Date();

    try {
      await setDoc(userRef, {
        displayName,
        email,
        photoURL,
        createdAt,
        uid: user.uid
      });
    } catch (error) {
      console.error('Error creating user profile:', error);
    }
  }
};

export const getUserProfile = async (uid) => {
  if (!uid) return null;
  
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  
  if (userSnap.exists()) {
    return userSnap.data();
  }
  return null;
};