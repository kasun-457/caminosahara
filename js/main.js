import { state } from './state.js';
import { closeModal } from './utils.js';
import { DatePicker } from './date-picker.js';
import { attachTimePickers } from './time-picker.js';
import {
  setAuthMode, signInWithGoogle, submitAuthForm, signOutUser,
  openDeleteAccountModal, submitDeleteAccount,
  toggleUserMenu, closeUserMenu, initAuthStateListener,
} from './auth.js';
import {
  openTripModal, saveTripForm,
  renderTripList, initContextMenu, initSortDropdown, initTripModalTabs,
  leaveTrip, initInviteModal, initMembersInviteEvents, initJoinRoomModal,
  openMembersModal, openSettingsModal,
  initNicknameModal, initTripCurrencyPicker,
} from './trips.js';
import {
  openActivityModal, saveActivityForm, deleteActivity,
  confirmAction, goBack, deleteTrip,
} from './activities.js';
import {
  closeDetailPanel, saveDetailPanel,
  renderDetailPanelFields, updateDetailPanelMap,
  setDetailMode, openDetailPanel, autoSaveAndClose,
} from './detail-panel.js';
import { renderActivityFormFields } from './activity-fields.js';
import { switchCalView, calNavigate } from './calendar.js';
import { openBudgetModal } from './budget.js';
import { openChatModal, closeChatModal, initChatModal } from './chat.js';

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

  // TimePicker 부착 (일정 모달 + 상세 패널)
  attachTimePickers(
    document.getElementById('activity-time'),
    document.getElementById('dp-time'),
    document.getElementById('dp-end-time'),
  );

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

  // 정렬 드롭다운
  initSortDropdown();
  initTripModalTabs();

  // 우클릭 컨텍스트 메뉴
  initContextMenu();

  // 여행
  document.getElementById('btn-new-trip').addEventListener('click', () => openTripModal());
  document.getElementById('btn-new-trip-empty').addEventListener('click', () => openTripModal());
  document.getElementById('nav-back').addEventListener('click', goBack);
  document.getElementById('nav-logo').addEventListener('click', () => { if (state.currentTripId) goBack(); });
  document.getElementById('btn-members').addEventListener('click', () => openMembersModal(state.currentTripId));
  document.getElementById('btn-chat').addEventListener('click', () => openChatModal(state.currentTripId));
  document.getElementById('btn-budget').addEventListener('click', () => openBudgetModal());
  document.getElementById('btn-settings').addEventListener('click', () => openSettingsModal(state.currentTripId));

  // 초대 / 방 참여 / 모달 초기화
  initInviteModal();
  initMembersInviteEvents();
  initJoinRoomModal();
  initNicknameModal();
  initTripCurrencyPicker();
  initChatModal();

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
  document.getElementById('dp-view-close').addEventListener('click', closeDetailPanel);
  document.getElementById('dp-save').addEventListener('click', saveDetailPanel);
  document.getElementById('dp-edit').addEventListener('click', () => setDetailMode('edit'));
  document.getElementById('dp-cancel').addEventListener('click', () => {
    // 취소 → 원본 데이터로 다시 로드 후 보기 모드 전환
    const { activityId, date } = state.detailContext;
    if (activityId) openDetailPanel(activityId, date, 'view');
  });
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
    if (e.target === document.getElementById('detail-overlay')) autoSaveAndClose();
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
      autoSaveAndClose(); return;
    }
    // 채팅은 닫을 때 구독 해제가 필요해서 먼저 분기
    if (document.getElementById('modal-chat')?.classList.contains('active')) {
      closeChatModal();
      return;
    }
    ['modal-confirm', 'modal-activity', 'modal-trip', 'modal-delete-account',
     'modal-invite', 'modal-join-room', 'modal-members', 'modal-nickname',
     'modal-budget', 'modal-settings'].forEach(id => {
      if (document.getElementById(id).classList.contains('active')) closeModal(id);
    });
  });

  // Auth 상태 감지 시작
  initAuthStateListener();
}

init();
