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
  apiKey: "AIzaSyBYT9LWeL_7bsxRz3QpdZJ-YZQRDHqj6DE",
  authDomain: "signal-sync-c3681.firebaseapp.com",
  databaseURL: "https://signal-sync-c3681-default-rtdb.firebaseio.com",
  projectId: "signal-sync-c3681",
  storageBucket: "signal-sync-c3681.firebasestorage.app",
  messagingSenderId: "492313662329",
  appId: "1:492313662329:web:439b6ea5e17b31ba7615a8",
  measurementId: "G-34XPB0HHYP"
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

// Get Firebase ID token for backend authentication
export const getIdToken = async () => {
  const user = auth.currentUser;
  console.log('Current user:', user ? user.email : 'No user');
  
  if (user) {
    try {
      const token = await user.getIdToken();
      console.log('Token generated successfully');
      return token;
    } catch (error) {
      console.error('Error getting ID token:', error);
      return null;
    }
  }
  console.log('No current user found');
  return null;
};

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