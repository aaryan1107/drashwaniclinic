// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDaCeic9USWtEZ_nevc9xxvrWwJlyEIox0",
  authDomain: "dr-ashwani-metabolic-care.firebaseapp.com",
  projectId: "dr-ashwani-metabolic-care",
  storageBucket: "dr-ashwani-metabolic-care.firebasestorage.app",
  messagingSenderId: "99224245337",
  appId: "1:99224245337:web:9c57c6a4e6682ce53ecd48",
  measurementId: "G-DDL8F4SJR5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email");
googleProvider.setCustomParameters({
  prompt: "select_account"
});

if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) getAnalytics(app);
  }).catch(() => {});
}

export { app, auth, googleProvider };
