import { state } from './state.js';
import { auth, googleProvider, db } from './firebase.js';
import { showToast, generateShareCode } from './utils.js';
import { subscribeToTrips, renderTripList, applySortPref } from './trips.js';
import { goBack } from './activities.js';

export function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === mode);
  });
  document.getElementById('auth-confirm-group').style.display = mode === 'signup' ? 'flex' : 'none';
  document.getElementById('auth-submit').textContent = mode === 'signup' ? '회원가입' : '로그인';
  document.getElementById('auth-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  document.getElementById('auth-error').textContent = '';
}

export function authErrorMessage(err) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-email': '올바른 이메일 형식이 아닙니다.',
    'auth/missing-password': '비밀번호를 입력해주세요.',
    'auth/missing-email': '이메일을 입력해주세요.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
    'auth/email-already-in-use': '이미 가입된 이메일입니다.',
    'auth/user-not-found': '가입되지 않은 이메일입니다.',
    'auth/wrong-password': '비밀번호가 일치하지 않습니다.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/too-many-requests': '시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
    'auth/popup-closed-by-user': '로그인 창이 닫혔습니다.',
    'auth/popup-blocked': '팝업이 차단되었습니다. 브라우저 설정을 확인해주세요.',
    'auth/network-request-failed': '네트워크 오류가 발생했습니다.',
    'auth/requires-recent-login': '보안을 위해 다시 로그인해주세요.',
    'auth/operation-not-allowed': '이메일/비밀번호 로그인이 Firebase 콘솔에서 비활성화되어 있어요. 콘솔 → Authentication → Sign-in method에서 활성화해주세요.',
    'auth/admin-restricted-operation': 'Firebase 관리자 설정으로 차단된 작업입니다.',
    'auth/unauthorized-domain': '현재 도메인이 Firebase 승인 도메인 목록에 없습니다. 콘솔 → Authentication → Settings → 승인된 도메인에 추가해주세요.',
  };
  if (map[code]) return map[code];
  if (code) return `[${code}] ${err?.message || ''}`.trim();
  return err?.message || '오류가 발생했습니다.';
}

export async function signInWithGoogle() {
  try {
    await auth.signInWithPopup(googleProvider);
  } catch (err) {
    console.error(err);
    document.getElementById('auth-error').textContent = authErrorMessage(err);
  }
}

export async function submitAuthForm(e) {
  e.preventDefault();
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const confirm  = document.getElementById('auth-password-confirm').value;
  const errEl    = document.getElementById('auth-error');
  errEl.textContent = '';

  if (!email)    { errEl.textContent = '이메일을 입력해주세요.'; return; }
  if (!password) { errEl.textContent = '비밀번호를 입력해주세요.'; return; }

  if (state.authMode === 'signup') {
    if (password.length < 6) { errEl.textContent = '비밀번호는 6자 이상이어야 합니다.'; return; }
    if (password !== confirm) { errEl.textContent = '비밀번호가 일치하지 않습니다.'; return; }
  }

  const btn = document.getElementById('auth-submit');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '...';

  try {
    if (state.authMode === 'signup') {
      await auth.createUserWithEmailAndPassword(email, password);
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
  } catch (err) {
    console.error(err);
    errEl.textContent = authErrorMessage(err);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

export async function signOutUser() {
  if (state.unsubscribeTrips) { state.unsubscribeTrips(); state.unsubscribeTrips = null; }
  closeUserMenu();
  await auth.signOut();
}

export function showLoginScreen() {
  document.getElementById('login-overlay').classList.add('active');
  document.getElementById('user-info').style.display = 'none';
  setAuthMode('login');
  document.getElementById('form-auth').reset();
}

export function showApp() {
  document.getElementById('login-overlay').classList.remove('active');
  document.getElementById('user-info').style.display = 'flex';
}

export function updateUserUI(user) {
  const btn     = document.getElementById('user-btn');
  const avatar  = document.getElementById('user-avatar');
  const initial = document.getElementById('user-initial');
  const name    = user.displayName || (user.email ? user.email.split('@')[0] : '사용자');

  if (user.photoURL) {
    avatar.src = user.photoURL;
    btn.classList.remove('no-avatar');
  } else {
    btn.classList.add('no-avatar');
    initial.textContent = name.charAt(0).toUpperCase();
  }

  document.getElementById('user-menu-name').textContent  = name;
  document.getElementById('user-menu-email').textContent = user.email || '';
}

export function toggleUserMenu() {
  document.getElementById('user-menu').classList.toggle('active');
}

export function closeUserMenu() {
  document.getElementById('user-menu').classList.remove('active');
}

export function openDeleteAccountModal() {
  closeUserMenu();
  document.getElementById('delete-error').textContent = '';
  document.getElementById('modal-delete-account').classList.add('active');
}

async function deleteOwnedTripsAndLeaveShared() {
  const uid = state.currentUser.uid;
  const [ownedSnap, sharedSnap] = await Promise.all([
    db.collection('trips').where('ownerId', '==', uid).get(),
    db.collection('trips').where('memberIds', 'array-contains', uid).get(),
  ]);

  const ownedIds = new Set(ownedSnap.docs.map(d => d.id));

  const deletes = ownedSnap.docs.map(doc => doc.ref.delete().catch(() => {}));
  const leaves  = sharedSnap.docs
    .filter(doc => !ownedIds.has(doc.id))
    .map(doc => doc.ref.update({
      memberIds: firebase.firestore.FieldValue.arrayRemove(uid),
      [`memberProfiles.${uid}`]: firebase.firestore.FieldValue.delete(),
    }).catch(() => {}));

  await Promise.all([...deletes, ...leaves]);
}

export async function submitDeleteAccount(e) {
  e.preventDefault();
  const errEl = document.getElementById('delete-error');
  const btn   = document.getElementById('btn-confirm-delete-account');
  errEl.textContent = '';
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = '처리 중...';

  try {
    if (state.unsubscribeTrips) { state.unsubscribeTrips(); state.unsubscribeTrips = null; }
    await deleteOwnedTripsAndLeaveShared().catch(() => {});
    await state.currentUser.delete();
    document.getElementById('modal-delete-account').classList.remove('active');
    showToast('회원탈퇴가 완료되었습니다.');
  } catch (err) {
    console.error(err);
    errEl.textContent = authErrorMessage(err);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

export async function migrateLegacyData(user) {
  const raw = localStorage.getItem('trips');
  if (!raw) return;
  let legacyTrips;
  try { legacyTrips = JSON.parse(raw); } catch { return; }
  if (!legacyTrips.length) return;

  const batch = db.batch();
  for (const trip of legacyTrips) {
    const ref = db.collection('trips').doc();
    batch.set(ref, {
      title: trip.title,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      color: trip.color,
      days: trip.days || [],
      ownerId: user.uid,
      memberIds: [user.uid],
      shareCode: generateShareCode(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  localStorage.removeItem('trips');
  localStorage.setItem('migrated', 'true');
  showToast(`${legacyTrips.length}개 여행을 클라우드로 이전했습니다 ✓`);
}

export async function handleJoinFromUrl() {
  const params   = new URLSearchParams(window.location.search);
  const tripId   = params.get('tripId');
  const joinCode = params.get('join');
  if (!tripId || !joinCode) return;
  window.history.replaceState({}, '', window.location.pathname);

  try {
    const docRef  = db.collection('trips').doc(tripId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) { showToast('유효하지 않은 여행입니다.'); return; }

    const trip = docSnap.data();
    if (trip.shareCode !== joinCode) { showToast('초대 코드가 올바르지 않습니다.'); return; }
    if (trip.memberIds.includes(state.currentUser.uid)) { showToast('이미 참여 중인 여행입니다.'); return; }

    const u = state.currentUser;
    await docRef.update({
      memberIds: firebase.firestore.FieldValue.arrayUnion(u.uid),
      [`memberProfiles.${u.uid}`]: { name: u.displayName || '', email: u.email || '' },
    });
    showToast(`"${trip.title}" 여행에 참여했습니다!`);
  } catch (err) {
    console.error(err);
    showToast('초대 링크 처리 중 오류가 발생했습니다.');
  }
}

// ── Auth 상태 감지 ─────────────────────────────────────────────────────────────
export function initAuthStateListener() {
  auth.onAuthStateChanged(async user => {
    if (user) {
      state.currentUser = user;
      showApp();
      updateUserUI(user);
      await migrateLegacyData(user);
      applySortPref();
      subscribeToTrips();
      await handleJoinFromUrl();
    } else {
      state.currentUser = null;
      state.trips = [];
      state.currentTripId = null;
      if (state.unsubscribeTrips) { state.unsubscribeTrips(); state.unsubscribeTrips = null; }
      if (document.getElementById('view-trip').classList.contains('active')) goBack();
      renderTripList();
      showLoginScreen();
    }
  });
}
