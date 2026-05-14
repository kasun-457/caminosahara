import { state } from './state.js';
import { closeModal } from './utils.js';
import { DatePicker } from './date-picker.js';
import {
  setAuthMode, signInWithGoogle, submitAuthForm, signOutUser,
  openDeleteAccountModal, submitDeleteAccount,
  toggleUserMenu, closeUserMenu, initAuthStateListener,
} from './auth.js';
import {
  openTripModal, saveTripForm, copyShareLink,
} from './trips.js';
import {
  openActivityModal, saveActivityForm, deleteActivity,
  confirmAction, goBack, deleteTrip,
} from './activities.js';
import {
  closeDetailPanel, saveDetailPanel,
  renderDetailPanelFields, updateDetailPanelMap,
} from './detail-panel.js';
import { renderActivityFormFields } from './activity-fields.js';
import { switchCalView, calNavigate } from './calendar.js';

// 이전 버전 localStorage 잔여 데이터 정리
localStorage.removeItem('trips');
localStorage.setItem('migrated', 'true');

// ── 뷰 파티얼 로드 ────────────────────────────────────────────────────────────
async function loadViews() {
  const parts = ['login', 'header', 'home', 'trip', 'modals', 'detail-panel'];
  const htmls = await Promise.all(
    parts.map(p => fetch(`views/${p}.html`).then(r => r.text()))
  );
  document.getElementById('app-root').innerHTML = htmls.join('\n');
}

// ── 앱 초기화 ─────────────────────────────────────────────────────────────────
async function init() {
  await loadViews();

  // DatePicker 초기화
  state.startPicker = new DatePicker(
    document.getElementById('trip-start'),
    document.getElementById('cal-btn-start'),
    { isEnd: false, getPartner: () => document.getElementById('trip-end').value }
  );
  state.endPicker = new DatePicker(
    document.getElementById('trip-end'),
    document.getElementById('cal-btn-end'),
    { isEnd: true, getPartner: () => document.getElementById('trip-start').value }
  );
  state.startPicker.options.partnerPicker = state.endPicker;
  state.endPicker.options.partnerPicker   = state.startPicker;

  // ── 이벤트 리스너 ───────────────────────────────────────────────────────────

  // Auth
  document.getElementById('btn-google-login').addEventListener('click', signInWithGoogle);
  document.getElementById('form-auth').addEventListener('submit', submitAuthForm);
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => setAuthMode(tab.dataset.tab));
  });

  // 사용자 메뉴
  document.getElementById('user-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleUserMenu();
  });
  document.addEventListener('click', e => {
    const menu = document.getElementById('user-menu');
    if (menu.classList.contains('active') && !e.target.closest('.user-info')) closeUserMenu();
  });
  document.getElementById('btn-delete-account').addEventListener('click', openDeleteAccountModal);
  document.getElementById('form-delete-account').addEventListener('submit', submitDeleteAccount);
  document.getElementById('btn-logout').addEventListener('click', signOutUser);

  // 여행
  document.getElementById('btn-new-trip').addEventListener('click', () => openTripModal());
  document.getElementById('btn-new-trip-empty').addEventListener('click', () => openTripModal());
  document.getElementById('nav-back').addEventListener('click', goBack);
  document.getElementById('nav-logo').addEventListener('click', () => { if (state.currentTripId) goBack(); });
  document.getElementById('btn-share-trip').addEventListener('click', () => copyShareLink(state.currentTripId));
  document.getElementById('btn-edit-trip').addEventListener('click', () => openTripModal(state.currentTripId));
  document.getElementById('btn-delete-trip').addEventListener('click', () => {
    confirmAction('이 여행을 삭제할까요? 모든 일정도 함께 삭제됩니다.', () => deleteTrip(state.currentTripId));
  });

  // 폼
  document.getElementById('form-trip').addEventListener('submit', saveTripForm);
  document.getElementById('form-activity').addEventListener('submit', saveActivityForm);
  document.getElementById('activity-category').addEventListener('change', e => {
    renderActivityFormFields(e.target.value, {});
  });

  // 캘린더
  document.getElementById('cal-prev-btn').addEventListener('click', () => calNavigate(-1));
  document.getElementById('cal-next-btn').addEventListener('click', () => calNavigate(1));
  document.querySelectorAll('.cal-view-tab').forEach(tab => {
    tab.addEventListener('click', () => switchCalView(tab.dataset.view));
  });

  // 상세 패널
  document.getElementById('dp-close').addEventListener('click', closeDetailPanel);
  document.getElementById('dp-save').addEventListener('click', saveDetailPanel);
  document.getElementById('dp-category').addEventListener('change', e => {
    renderDetailPanelFields(e.target.value, {});
    updateDetailPanelMap(e.target.value, {});
  });
  document.getElementById('dp-title').addEventListener('input', () => {
    document.getElementById('dp-title').classList.remove('invalid');
  });
  document.getElementById('dp-delete').addEventListener('click', () => {
    const ctx = { ...state.detailContext };
    confirmAction('이 일정을 삭제할까요?', async () => {
      closeDetailPanel();
      await deleteActivity(state.currentTripId, ctx.date, ctx.activityId);
    });
  });
  document.getElementById('detail-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('detail-overlay')) closeDetailPanel();
  });

  // 확인 모달
  document.getElementById('btn-confirm-ok').addEventListener('click', async () => {
    if (state.confirmCallback) { await state.confirmCallback(); state.confirmCallback = null; }
    closeModal('modal-confirm');
  });

  // 공통 모달 닫기
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
  });

  // 색상 선택
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedColor = btn.dataset.color;
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 폼 invalid 클래스 제거
  ['trip-name', 'trip-destination', 'trip-start', 'trip-end', 'activity-title'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      document.getElementById(id).classList.remove('invalid');
    });
  });

  // ESC 키
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('detail-overlay').classList.contains('active')) {
      closeDetailPanel(); return;
    }
    ['modal-confirm', 'modal-activity', 'modal-trip', 'modal-delete-account'].forEach(id => {
      if (document.getElementById(id).classList.contains('active')) closeModal(id);
    });
  });

  // Auth 상태 감지 시작
  initAuthStateListener();
}

init();
