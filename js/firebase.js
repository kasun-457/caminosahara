// Firebase compat SDK는 firebase-config.js에서 초기화되어 window.firebase로 노출됨
export const db = firebase.firestore();
export const auth = firebase.auth();
export const googleProvider = new firebase.auth.GoogleAuthProvider();
