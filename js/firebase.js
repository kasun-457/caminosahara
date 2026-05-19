// Firebase compat SDK는 firebase-config.js에서 초기화되어 window.firebase로 노출됨
export const db = firebase.firestore();
export const auth = firebase.auth();
export const storage = firebase.storage();
export const googleProvider = new firebase.auth.GoogleAuthProvider();
export const appleProvider = new firebase.auth.OAuthProvider('apple.com');
