// ══════════════════════════════════════════════════════════════════════════════
//  여행 코어 모듈
//  - Firestore 구독 / 여행 목록 렌더
//  - 정렬 (자동/수동) + 드롭다운
//  - 우클릭 컨텍스트 메뉴 (편집/삭제)
//  - 드래그 정렬
//  - 권한 헬퍼 (isOwner / canEdit / getRole / memberDisplayName)
//  - openTrip / leaveTrip / getTripCurrencies
//  ※ 모든 모달 UI는 trip-modals.js 로 분리
// ══════════════════════════════════════════════════════════════════════════════
import { state } from './state.js';
import { db } from './firebase.js';
import { getDays, fmtShort, showToast } from './utils.js';
import { renderDayTabs } from './day-list.js';
import { renderGridView } from './calendar.js';
import { goBack, confirmAction, deleteTrip } from './activities.js';
import { DEFAULT_CURRENCY, getCurrency } from './currencies.js';
import { openTripModal } from './trip-modals.js';

// ── 정렬 방식 저장/불러오기 (localStorage, 계정별) ───────────────────────────
function loadSortPref() {
  const uid = state.currentUser?.uid;
  if (!uid) return;
  const saved = localStorage.getItem(`tripSort_${uid}`);
  if (saved && ['recent', 'startDate', 'name', 'manual'].includes(saved)) {
    state.tripSort = saved;
  } else {
    state.tripSort = 'startDate'; // 계정 최초 접속 기본값
  }
  // 드롭다운 라벨 동기화
  const label = document.getElementById('sort-label');
  if (label) label.textContent = SORT_LABELS[state.tripSort];
  document.querySelectorAll('.sort-option').forEach(o => {
    o.classList.toggle('active', o.dataset.sort === state.tripSort);
  });
}

function saveSortPref(sort) {
  const uid = state.currentUser?.uid;
  if (uid) localStorage.setItem(`tripSort_${uid}`, sort);
}

// ── 수동 정렬 순서 (localStorage) ─────────────────────────────────────────────
function getManualOrder() {
  try { return JSON.parse(localStorage.getItem(`tripOrder_${state.currentUser?.uid}`) || '[]'); }
  catch { return []; }
}
function saveManualOrder(ids) {
  localStorage.setItem(`tripOrder_${state.currentUser?.uid}`, JSON.stringify(ids));
}

const SORT_LABELS = {
  recent:    '최신 등록순',
  startDate: '여행 날짜순',
  name:      '이름순',
  manual:    '직접 정렬',
};

function sortedTrips() {
  const trips = [...state.trips];
  if (state.tripSort === 'name') {
    return trips.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  }
  if (state.tripSort === 'startDate') {
    return trips.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  }
  if (state.tripSort === 'manual') {
    const order = getManualOrder();
    return trips.sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }
  // 'recent': createdAt 내림차순 (기본)
  return trips.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
}

export function initSortDropdown() {
  const btn  = document.getElementById('sort-dropdown-btn');
  const menu = document.getElementById('sort-dropdown-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });

  menu.querySelectorAll('.sort-option').forEach(opt => {
    opt.addEventListener('click', () => {
      state.tripSort = opt.dataset.sort;
      saveSortPref(state.tripSort);
      document.getElementById('sort-label').textContent = SORT_LABELS[state.tripSort];
      menu.querySelectorAll('.sort-option').forEach(o => o.classList.toggle('active', o === opt));
      menu.classList.remove('open');
      renderTripList();
    });
  });

  document.addEventListener('click', () => menu.classList.remove('open'));
}

export function applySortPref() {
  loadSortPref(); // state.tripSort 를 내부에서 설정 (반환값 없음)
  const label = document.getElementById('sort-label');
  if (label) label.textContent = SORT_LABELS[state.tripSort] ?? SORT_LABELS.startDate;
  const menu = document.getElementById('sort-dropdown-menu');
  if (menu) {
    menu.querySelectorAll('.sort-option').forEach(o =>
      o.classList.toggle('active', o.dataset.sort === state.tripSort)
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Firestore 구독
// ══════════════════════════════════════════════════════════════════════════════
export function subscribeToTrips() {
  if (state.unsubscribeTrips) state.unsubscribeTrips();
  let _firstLoad = true;
  state.unsubscribeTrips = db.collection('trips')
    .where('memberIds', 'array-contains', state.currentUser.uid)
    .onSnapshot(snapshot => {
      state.trips = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      renderTripList();

      // 첫 로드 시 해시에서 여행 ID 복원
      if (_firstLoad) {
        _firstLoad = false;
        const hashId = window.location.hash.slice(1);
        if (hashId && !state.currentTripId) {
          const trip = state.trips.find(t => t.id === hashId);
          if (trip) { openTrip(hashId); return; }
          else window.history.replaceState(null, '', location.pathname + location.search);
        }
      }

      if (state.currentTripId) {
        const trip = state.trips.find(t => t.id === state.currentTripId);
        if (trip) {
          if (state.calView === 'list') renderDayTabs(trip);
          else renderGridView(trip);
        } else {
          goBack();
        }
      }

      // 채팅 모듈 등 다른 모듈이 트립 데이터 변경(읽음 상태 등)에 반응할 수 있도록
      document.dispatchEvent(new CustomEvent('trips-updated'));
    }, err => console.error('Firestore 오류:', err));
}

// ══════════════════════════════════════════════════════════════════════════════
//  여행 카드 목록 렌더
// ══════════════════════════════════════════════════════════════════════════════
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

function tripCardHTML(trip, { isManual, isPast }) {
  const days = getDays(trip.startDate, trip.endDate);
  const totalActs = days.reduce((n, date) => {
    const day = trip.days.find(d => d.date === date);
    return n + (day ? day.activities.length : 0);
  }, 0);
  const members = trip.memberIds?.length ?? 1;
  const pastCls = isPast ? ' trip-card-past' : '';
  const draggable = isManual && !isPast; // 지난 여행은 수동 정렬 대상에서 제외
  return `
    <div class="trip-card${draggable ? ' draggable' : ''}${pastCls}" data-id="${trip.id}"
         style="--trip-color:${trip.color}" ${draggable ? 'draggable="true"' : ''}>
      ${draggable ? '<div class="trip-drag-handle">⠿</div>' : ''}
      <div class="trip-card-top">
        <div class="trip-card-deco"></div>
        <p class="trip-card-dest">${trip.destination}</p>
        <h2 class="trip-card-name">${trip.title}</h2>
      </div>
      <div class="trip-card-bottom">
        <span class="trip-meta">${fmtShort(trip.startDate)} – ${fmtShort(trip.endDate)} · ${days.length}일 · ${totalActs}개</span>
        <span class="trip-members">👥 ${members}</span>
      </div>
    </div>`;
}

function bindTripCardEvents(grid) {
  // 클릭 → 여행 열기
  grid.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.trip-drag-handle')) return;
      openTrip(card.dataset.id);
    });
    card.addEventListener('contextmenu', e => {
      e.preventDefault();
      const trip = state.trips.find(t => t.id === card.dataset.id);
      if (!isOwner(trip)) return;
      showContextMenu(e.clientX, e.clientY, card.dataset.id);
    });
  });
}

export function renderTripList() {
  const grid     = document.getElementById('trip-grid');
  const pastGrid = document.getElementById('trip-grid-past');
  const pastSec  = document.getElementById('trip-past-section');
  const pastCnt  = document.getElementById('trip-past-count');
  const empty    = document.getElementById('empty-state');

  document.querySelectorAll('.trip-sort-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === state.tripSort);
  });

  const trips = sortedTrips();

  if (trips.length === 0) {
    grid.innerHTML = '';
    pastGrid.innerHTML = '';
    pastSec.style.display = 'none';
    pastGrid.style.display = 'none';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  const isManual = state.tripSort === 'manual';

  // 오늘 이전에 끝난 여행을 분리 (종료일 < 오늘)
  const today = todayStr();
  const active = [];
  const past   = [];
  for (const t of trips) {
    if (t.endDate && t.endDate < today) past.push(t);
    else active.push(t);
  }

  // 지난 여행은 항상 최근 종료일순으로 표시
  past.sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''));

  grid.innerHTML = active.map(trip => tripCardHTML(trip, { isManual, isPast: false })).join('');
  bindTripCardEvents(grid);
  if (isManual) setupDragSort(grid);

  if (past.length > 0) {
    pastGrid.innerHTML = past.map(trip => tripCardHTML(trip, { isManual, isPast: true })).join('');
    pastCnt.textContent = `(${past.length})`;
    pastSec.style.display = '';
    pastGrid.style.display = '';
    bindTripCardEvents(pastGrid);
  } else {
    pastGrid.innerHTML = '';
    pastSec.style.display = 'none';
    pastGrid.style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  컨텍스트 메뉴 (우클릭으로 편집/삭제)
// ══════════════════════════════════════════════════════════════════════════════
let _ctxTripId = null;

function showContextMenu(x, y, tripId) {
  _ctxTripId = tripId;
  const menu = document.getElementById('trip-ctx-menu');
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';
  menu.classList.add('active');

  // 뷰포트 밖으로 나가면 위로 펼침
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if (r.bottom > window.innerHeight) menu.style.top = (y - r.height) + 'px';
    if (r.right  > window.innerWidth)  menu.style.left = (x - r.width)  + 'px';
  });
}

function hideContextMenu() {
  document.getElementById('trip-ctx-menu')?.classList.remove('active');
  _ctxTripId = null;
}

export function initContextMenu() {
  document.getElementById('ctx-edit')?.addEventListener('click', () => {
    if (_ctxTripId) { openTripModal(_ctxTripId); hideContextMenu(); }
  });
  document.getElementById('ctx-delete')?.addEventListener('click', () => {
    if (_ctxTripId) {
      const id = _ctxTripId;
      hideContextMenu();
      confirmAction('이 여행을 삭제할까요? 모든 일정도 함께 삭제됩니다.', () => deleteTrip(id));
    }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#trip-ctx-menu')) hideContextMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hideContextMenu();
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  직접정렬 드래그
// ══════════════════════════════════════════════════════════════════════════════
function setupDragSort(grid) {
  let dragSrc = null;

  grid.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragSrc = card;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      grid.querySelectorAll('.trip-card').forEach(c => c.classList.remove('drag-over'));
      // 현재 순서 저장
      const ids = [...grid.querySelectorAll('.trip-card')].map(c => c.dataset.id);
      saveManualOrder(ids);
      dragSrc = null;
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (card === dragSrc) return;
      grid.querySelectorAll('.trip-card').forEach(c => c.classList.remove('drag-over'));
      card.classList.add('drag-over');
    });
    card.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === card) return;
      const cards = [...grid.querySelectorAll('.trip-card')];
      const srcIdx = cards.indexOf(dragSrc);
      const tgtIdx = cards.indexOf(card);
      if (srcIdx < tgtIdx) card.after(dragSrc);
      else card.before(dragSrc);
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  권한 헬퍼 (trip-modals.js 와 detail-panel/calendar/day-list 에서 import)
// ══════════════════════════════════════════════════════════════════════════════
export function isOwner(trip) {
  return trip?.ownerId === state.currentUser?.uid;
}

// 편집 권한: 관리자(owner) 또는 memberRoles[uid] === 'editor'
export function canEdit(trip) {
  if (!trip) return false;
  if (isOwner(trip)) return true;
  const role = trip.memberRoles?.[state.currentUser?.uid];
  return role === 'editor';
}

export function getRole(trip, uid) {
  if (!trip || !uid) return 'viewer';
  if (trip.ownerId === uid) return 'owner';
  return trip.memberRoles?.[uid] || 'viewer';
}

export function memberDisplayName(trip, uid) {
  const p = trip?.memberProfiles?.[uid] || {};
  return p.nickname || p.name || p.email || (uid ? uid.slice(0, 8) + '…' : '');
}

// ══════════════════════════════════════════════════════════════════════════════
//  여행 열기 / 나가기
// ══════════════════════════════════════════════════════════════════════════════
function openTrip(tripId) {
  state.currentTripId = tripId;
  window.history.replaceState(null, '', '#' + tripId);
  state.currentDayIndex = 0;
  state.calDateOffset = 0;
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;

  document.getElementById('nav-breadcrumb').textContent = trip.title;
  document.getElementById('nav-back').style.display = 'inline-flex';
  document.getElementById('trip-dest-label').textContent = trip.destination;
  document.getElementById('trip-title-label').textContent = trip.title;
  document.getElementById('trip-dates-label').textContent =
    `${fmtShort(trip.startDate)} → ${fmtShort(trip.endDate)}  ·  ${getDays(trip.startDate, trip.endDate).length}일`;
  document.getElementById('trip-hero').style.setProperty('--trip-color', trip.color);
  document.getElementById('day-tabs').style.setProperty('--trip-color', trip.color);

  // 버튼 표시 (초대·닉네임·수정·삭제는 참여자/설정 모달로 통합)
  // btn-members, btn-budget, btn-settings 는 항상 표시

  state.calView = 'list';
  document.querySelectorAll('.cal-view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'list'));
  document.getElementById('list-view-tabs').style.display   = '';
  document.getElementById('trip-content-row').style.display = '';
  document.getElementById('cal-view').style.display          = 'none';
  document.getElementById('cal-toolbar-nav').style.display   = 'none';

  renderDayTabs(trip);
  document.getElementById('view-list').classList.remove('active');
  document.getElementById('view-trip').classList.add('active');
}

export function leaveTrip(tripId) {
  confirmAction('이 여행에서 나갈까요? 다시 초대 링크를 받아야 재참여할 수 있습니다.', async () => {
    try {
      await db.collection('trips').doc(tripId).update({
        memberIds: firebase.firestore.FieldValue.arrayRemove(state.currentUser.uid),
        [`memberProfiles.${state.currentUser.uid}`]: firebase.firestore.FieldValue.delete(),
      });
      goBack();
      showToast('여행에서 나갔습니다.');
    } catch (err) {
      console.error(err);
      showToast('오류가 발생했습니다.');
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  여행 통화 헬퍼 (외부에서 import)
// ══════════════════════════════════════════════════════════════════════════════
export function getTripCurrencies(trip) {
  if (!trip) return [DEFAULT_CURRENCY];
  const list = Array.isArray(trip.currencies) ? trip.currencies.filter(c => getCurrency(c)) : [];
  return list.length ? list : [DEFAULT_CURRENCY];
}
