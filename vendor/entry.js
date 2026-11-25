export { initializeApp } from "firebase/app";
export { initializeAuth, browserLocalPersistence, signInAnonymously, onAuthStateChanged } from "firebase/auth";
export {
  getDatabase, ref, child, get, set, update, remove, push, onValue, onChildAdded, onChildChanged, off,
  onDisconnect, serverTimestamp, runTransaction, query, orderByKey, startAt, goOffline, goOnline,
} from "firebase/database";
