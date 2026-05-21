import { state } from './state.js';
import { db } from './firebase.js';
import { getDays, fmtShort, showToast, generateShareCode, openModal, closeModal, sha256Hex, escapeHtml } from './utils.js';
import { renderDayTabs } from './day-list.js';
import { renderGridView } from './calendar.js';
import { goBack, confirmAction, deleteTrip } from './activities.js';
import { CURRENCIES, DEFAULT_CURRENCY, getCurrency, filterCurrencies, currencyShortLabel } from './currencies.js';

// ── 여행 모달의 통화 선택 상태 ────────────────────────────────────────────────
let _selectedCurrencies = [];
let _currencyDropdownIdx = -1;

// ── 수동 정렬 순서 (localStorage) ─────────────────────────────────────────────
function getManualOrder() {
  try { return JSON.parse(localStorage.getItem(`tripOrder_${state.currentUser?.uid}`) || '[]'); }
  catch { return []; }
}
function saveManualOrder(ids) {
  localStorage.setItem(`tripOrder_${state.currentUser?.uid}`, JSON.stringify(ids));
}

// ── 정렬 기준 저장/불러오기 (계정별) ──────────────────────────────────────────
function loadSortPref() {
  return localStorage.getItem(`tripSort_${state.currentUser?.uid}`) || 'startDate';
}
function saveSortPref(sort) {
  localStorage.setItem(`tripSort_${state.currentUser?.uid}`, sort);
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
  state.tripSort = loadSortPref();
  const label = document.getElementById('sort-label');
  if (label) label.textContent = SORT_LABELS[state.tripSort] ?? SORT_LABELS.startDate;
  const menu = document.getElementById('sort-dropdown-menu');
  if (menu) {
    menu.querySelectorAll('.sort-option').forEach(o =>
      o.classList.toggle('active', o.dataset.sort === state.tripSort)
    );
  }
}

export function subscribeToTrips() {
  if (state.unsubscribeTrips) state.unsubscribeTrips();
  let _firstLoad = true;
  let _lastTripsHash = '';
  let _lastCurrentTripHash = '';
  state.unsubscribeTrips = db.collection('trips')
    .where('memberIds', 'array-contains', state.currentUser.uid)
    .onSnapshot(snapshot => {
      // 로컬에서 발생한 보류 중 쓰기로 인한 스냅샷은 무시 (서버 확정본만 처리)
      if (snapshot.metadata.hasPendingWrites) return;

      state.trips = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));

      // 목록이 실제로 바뀌었을 때만 렌더
      const tripsHash = JSON.stringify(state.trips.map(t => ({
        id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate,
        memberIds: t.memberIds, role: t.role,
      })));
      if (tripsHash !== _lastTripsHash) {
        _lastTripsHash = tripsHash;
        renderTripList();
      }

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
          const currentHash = JSON.stringify({ days: trip.days, name: trip.name, startDate: trip.startDate, endDate: trip.endDate });
          if (currentHash !== _lastCurrentTripHash) {
            _lastCurrentTripHash = currentHash;
            if (state.calView === 'list') renderDayTabs(trip);
            else renderGridView(trip);
          }
        } else {
          goBack();
        }
      }
    }, err => console.error('Firestore 오류:', err));
}

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

// ── 컨텍스트 메뉴 ─────────────────────────────────────────────────────────────
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

export function hideContextMenu() {
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

// ── 직접정렬 드래그 ───────────────────────────────────────────────────────────
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

export function openTrip(tripId) {
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

  // 관리자 전용 버튼 / 멤버 전용 버튼 표시 제어
  const owner = isOwner(trip);
  document.getElementById('btn-share-trip').style.display       = owner ? '' : 'none';
  document.getElementById('btn-members').style.display          = owner ? '' : 'none';
  document.getElementById('btn-edit-trip').style.display        = owner ? '' : 'none';
  document.getElementById('btn-delete-trip').style.display      = owner ? '' : 'none';
  document.getElementById('btn-leave-trip').style.display       = owner ? 'none' : '';

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

// ── 초대 설정 모달 (관리자) ───────────────────────────────────────────────────
export function openInviteModal(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip || !isOwner(trip)) return;

  state.inviteTripId = tripId;
  const isPrivate = trip.roomType === 'private';

  document.querySelectorAll('input[name="room-type"]').forEach(r => {
    r.checked = r.value === (isPrivate ? 'private' : 'public');
  });
  document.getElementById('invite-password').value = '';
  document.getElementById('err-invite-password').textContent = '';
  updateInviteTypeUI(isPrivate ? 'private' : 'public', isPrivate);

  document.getElementById('invite-link-output').value =
    `${location.origin}${location.pathname}?tripId=${trip.id}&join=${trip.shareCode}`;

  openModal('modal-invite');
}

function updateInviteTypeUI(type, alreadyHasPassword) {
  const hint   = document.getElementById('invite-type-hint');
  const pwGrp  = document.getElementById('invite-password-group');
  const pwIn   = document.getElementById('invite-password');
  if (type === 'private') {
    hint.textContent = '초대 링크와 암호를 모두 알아야 참여할 수 있어요.';
    pwGrp.classList.remove('hidden');
    pwIn.placeholder = alreadyHasPassword ? '비워두면 기존 암호 유지' : '참여자가 입력할 암호 (4자 이상)';
  } else {
    hint.textContent = '초대 링크만 있으면 누구나 참여할 수 있어요.';
    pwGrp.classList.add('hidden');
  }
}

export function initInviteModal() {
  document.querySelectorAll('input[name="room-type"]').forEach(r => {
    r.addEventListener('change', () => {
      const trip = state.trips.find(t => t.id === state.inviteTripId);
      const has  = !!trip?.roomPassword;
      updateInviteTypeUI(r.value, has);
    });
  });

  document.getElementById('btn-copy-invite-link').addEventListener('click', async () => {
    const url = document.getElementById('invite-link-output').value;
    try {
      await navigator.clipboard.writeText(url);
      showToast('초대 링크가 복사되었습니다!');
    } catch {
      prompt('아래 링크를 복사하세요:', url);
    }
  });

  document.getElementById('btn-save-invite').addEventListener('click', saveInviteSettings);
}

async function saveInviteSettings() {
  const tripId = state.inviteTripId;
  if (!tripId) return;
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip || !isOwner(trip)) return;

  const type   = document.querySelector('input[name="room-type"]:checked')?.value || 'public';
  const pwIn   = document.getElementById('invite-password');
  const errEl  = document.getElementById('err-invite-password');
  errEl.textContent = '';

  const update = { roomType: type };
  if (type === 'public') {
    update.roomPassword = '';
  } else {
    const raw = pwIn.value;
    const hasExisting = !!trip.roomPassword;
    if (!raw && !hasExisting) {
      errEl.textContent = '암호를 입력해주세요.';
      pwIn.focus();
      return;
    }
    if (raw) {
      if (raw.length < 4) {
        errEl.textContent = '암호는 4자 이상이어야 해요.';
        pwIn.focus();
        return;
      }
      update.roomPassword = await sha256Hex(raw);
    }
  }

  const btn = document.getElementById('btn-save-invite');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = '저장 중…';
  try {
    await db.collection('trips').doc(tripId).update(update);
    showToast(type === 'private' ? '사설 방으로 설정됐습니다.' : '공개 방으로 설정됐습니다.');
    closeModal('modal-invite');
  } catch (err) {
    console.error(err);
    showToast('저장에 실패했습니다.');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ── 방 입장 플로우 (암호 + 닉네임) ────────────────────────────────────────────
export async function beginJoinFlow(tripId, joinCode) {
  try {
    const docSnap = await db.collection('trips').doc(tripId).get();
    if (!docSnap.exists) { showToast('유효하지 않은 여행입니다.'); return; }
    const trip = docSnap.data();
    if (trip.shareCode !== joinCode) { showToast('초대 코드가 올바르지 않습니다.'); return; }
    if (trip.memberIds.includes(state.currentUser.uid)) {
      showToast('이미 참여 중인 여행입니다.');
      closeModal('modal-trip');
      return;
    }

    state.pendingJoin = { tripId, joinCode, trip };
    const isPrivate = trip.roomType === 'private' && !!trip.roomPassword;

    document.getElementById('join-room-title-line').textContent = `"${trip.title}" 여행에 참여합니다.`;
    document.getElementById('join-password-input').value = '';
    document.getElementById('join-nickname-input').value =
      state.currentUser.displayName || (state.currentUser.email ? state.currentUser.email.split('@')[0] : '');
    document.getElementById('err-join-password').textContent = '';
    document.getElementById('err-join-nickname').textContent = '';
    document.getElementById('join-password-group').classList.toggle('hidden', !isPrivate);

    closeModal('modal-trip');
    openModal('modal-join-room');
    setTimeout(() => {
      (isPrivate
        ? document.getElementById('join-password-input')
        : document.getElementById('join-nickname-input')).focus();
    }, 50);
  } catch (err) {
    console.error(err);
    showToast('초대 처리 중 오류가 발생했습니다.');
  }
}

async function confirmJoinTrip() {
  const pj = state.pendingJoin;
  if (!pj) return;
  const errPw = document.getElementById('err-join-password');
  const errNk = document.getElementById('err-join-nickname');
  errPw.textContent = '';
  errNk.textContent = '';

  const nickname = document.getElementById('join-nickname-input').value.trim();
  if (!nickname) {
    errNk.textContent = '닉네임을 입력해주세요.';
    document.getElementById('join-nickname-input').focus();
    return;
  }

  const isPrivate = pj.trip.roomType === 'private' && !!pj.trip.roomPassword;
  if (isPrivate) {
    const raw = document.getElementById('join-password-input').value;
    if (!raw) {
      errPw.textContent = '암호를 입력해주세요.';
      document.getElementById('join-password-input').focus();
      return;
    }
    const hash = await sha256Hex(raw);
    if (hash !== pj.trip.roomPassword) {
      errPw.textContent = '암호가 올바르지 않아요.';
      document.getElementById('join-password-input').focus();
      return;
    }
  }

  const btn = document.getElementById('btn-confirm-join');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = '처리 중…';

  try {
    const u = state.currentUser;
    await db.collection('trips').doc(pj.tripId).update({
      memberIds: firebase.firestore.FieldValue.arrayUnion(u.uid),
      [`memberProfiles.${u.uid}`]: {
        name: u.displayName || '',
        email: u.email || '',
        nickname,
      },
      [`memberRoles.${u.uid}`]: 'viewer',
    });
    closeModal('modal-join-room');
    state.pendingJoin = null;
    showToast(`"${pj.trip.title}" 여행에 참여했습니다!`);
  } catch (err) {
    console.error(err);
    errPw.textContent = '참여 처리 중 오류가 발생했습니다.';
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

export function initJoinRoomModal() {
  document.getElementById('btn-confirm-join').addEventListener('click', confirmJoinTrip);
  document.getElementById('join-password-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmJoinTrip();
  });
  document.getElementById('join-nickname-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmJoinTrip();
  });
}

// ── 참여자 관리 모달 (관리자) ─────────────────────────────────────────────────
export function openMembersModal(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip || !isOwner(trip)) return;
  renderMembersModal(trip);
  openModal('modal-members');
}

function renderMembersModal(trip) {
  const list = document.getElementById('member-list');
  const me   = state.currentUser?.uid;
  const ownerId = trip.ownerId;

  // 소유자 먼저, 그 다음 나머지
  const ordered = [ownerId, ...trip.memberIds.filter(uid => uid !== ownerId)];

  list.innerHTML = ordered.map(uid => {
    const p        = trip.memberProfiles?.[uid] || {};
    const nickname = p.nickname || '';
    const name     = p.name || '';
    const email    = p.email || '';
    const display  = escapeHtml(nickname || name || email || uid.slice(0, 8) + '…');
    const sub      = nickname && (name || email)
      ? `<span class="member-sub">${escapeHtml(name || email)}</span>`
      : (email && !nickname ? `<span class="member-sub">${escapeHtml(email)}</span>` : '');

    if (uid === ownerId) {
      return `
      <div class="member-row member-row-owner">
        <div class="member-info">
          <span class="member-name">👑 ${display}${uid === me ? ' (나)' : ''}</span>
          ${sub}
        </div>
        <span class="member-badge member-badge-owner">관리자</span>
      </div>`;
    }

    const role = trip.memberRoles?.[uid] || 'viewer';
    return `
      <div class="member-row" data-uid="${uid}">
        <div class="member-info">
          <span class="member-name">${display}</span>
          ${sub}
        </div>
        <div class="member-controls">
          <select class="member-role-select" data-uid="${uid}">
            <option value="viewer"  ${role === 'viewer'  ? 'selected' : ''}>뷰어</option>
            <option value="editor"  ${role === 'editor'  ? 'selected' : ''}>편집자</option>
          </select>
          <button class="btn-outline btn-sm member-promote" data-uid="${uid}" title="관리자로 위임">👑 위임</button>
          <button class="btn-danger btn-sm member-kick" data-uid="${uid}" title="추방">추방</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.member-role-select').forEach(sel => {
    sel.addEventListener('change', () => setMemberRole(trip.id, sel.dataset.uid, sel.value));
  });
  list.querySelectorAll('.member-promote').forEach(btn => {
    btn.addEventListener('click', () => promptTransferOwner(trip.id, btn.dataset.uid));
  });
  list.querySelectorAll('.member-kick').forEach(btn => {
    btn.addEventListener('click', () => promptKickMember(trip.id, btn.dataset.uid));
  });
}

async function setMemberRole(tripId, uid, role) {
  try {
    await db.collection('trips').doc(tripId).update({
      [`memberRoles.${uid}`]: role,
    });
    showToast(`권한이 ${role === 'editor' ? '편집자' : '뷰어'}(으)로 변경됐습니다.`);
  } catch (err) {
    console.error(err);
    showToast('권한 변경에 실패했습니다.');
  }
}

function promptTransferOwner(tripId, newOwnerUid) {
  const trip = state.trips.find(t => t.id === tripId);
  const name = memberDisplayName(trip, newOwnerUid);
  confirmAction(`"${name}" 님에게 관리자 권한을 위임할까요? 본인은 편집자가 됩니다.`, async () => {
    try {
      const oldOwner = state.currentUser.uid;
      await db.collection('trips').doc(tripId).update({
        ownerId: newOwnerUid,
        [`memberRoles.${oldOwner}`]: 'editor',
        [`memberRoles.${newOwnerUid}`]: firebase.firestore.FieldValue.delete(),
      });
      closeModal('modal-members');
      showToast('관리자 권한이 양도됐습니다.');
    } catch (err) {
      console.error(err);
      showToast('관리자 위임에 실패했습니다.');
    }
  });
}

function promptKickMember(tripId, uid) {
  const trip = state.trips.find(t => t.id === tripId);
  const name = memberDisplayName(trip, uid);
  confirmAction(`"${name}" 님을 이 여행에서 추방할까요?`, async () => {
    try {
      await db.collection('trips').doc(tripId).update({
        memberIds: firebase.firestore.FieldValue.arrayRemove(uid),
        [`memberProfiles.${uid}`]: firebase.firestore.FieldValue.delete(),
        [`memberRoles.${uid}`]: firebase.firestore.FieldValue.delete(),
      });
      showToast('멤버가 추방됐습니다.');
    } catch (err) {
      console.error(err);
      showToast('추방에 실패했습니다.');
    }
  });
}

// ── 닉네임 수정 ───────────────────────────────────────────────────────────────
export function openEditNicknameModal() {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (!trip) return;
  const uid = state.currentUser?.uid;
  const current = trip.memberProfiles?.[uid]?.nickname || '';
  document.getElementById('nickname-edit-input').value = current;
  document.getElementById('err-nickname-edit').textContent = '';
  openModal('modal-nickname');
  setTimeout(() => {
    const input = document.getElementById('nickname-edit-input');
    input.focus();
    input.select();
  }, 50);
}

async function saveNickname() {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (!trip) return;
  const uid = state.currentUser.uid;
  const input = document.getElementById('nickname-edit-input');
  const errEl = document.getElementById('err-nickname-edit');
  errEl.textContent = '';

  const nickname = input.value.trim();
  if (!nickname) {
    errEl.textContent = '닉네임을 입력해주세요.';
    input.focus();
    return;
  }

  const btn = document.getElementById('btn-save-nickname');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = '저장 중…';

  try {
    await db.collection('trips').doc(trip.id).update({
      [`memberProfiles.${uid}.nickname`]: nickname,
    });
    closeModal('modal-nickname');
    showToast('닉네임이 변경됐습니다.');
  } catch (err) {
    console.error(err);
    errEl.textContent = '저장에 실패했습니다.';
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

export function initNicknameModal() {
  document.getElementById('btn-save-nickname').addEventListener('click', saveNickname);
  document.getElementById('nickname-edit-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveNickname();
  });
}

// 멤버 모달이 열려있는 동안 trip 데이터가 갱신되면 다시 그림
export function refreshMembersModalIfOpen() {
  const overlay = document.getElementById('modal-members');
  if (!overlay?.classList.contains('active')) return;
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (trip) renderMembersModal(trip);
}

export function openTripModal(tripId = null) {
  state.editingTripId = tripId;
  clearTripErrors();

  const tabs    = document.getElementById('trip-modal-tabs');
  const form    = document.getElementById('form-trip');
  const panel   = document.getElementById('trip-join-panel');

  if (tripId) {
    const trip = state.trips.find(t => t.id === tripId);
    document.getElementById('modal-trip-heading').textContent = '여행 수정';
    document.getElementById('trip-name').value = trip.title;
    document.getElementById('trip-destination').value = trip.destination;
    document.getElementById('trip-start').value = trip.startDate;
    document.getElementById('trip-end').value = trip.endDate;
    state.selectedColor = trip.color;
    _selectedCurrencies = Array.isArray(trip.currencies) && trip.currencies.length
      ? [...trip.currencies] : [];
    // 수정 모드: 탭 숨기고 새 여행 폼만 표시
    tabs.style.display = 'none';
    form.style.display = '';
    panel.classList.add('hidden');
  } else {
    document.getElementById('modal-trip-heading').textContent = '새 여행 추가';
    document.getElementById('form-trip').reset();
    state.selectedColor = '#c8f060';
    _selectedCurrencies = [];
    // 추가 모드: 탭 표시, 새 여행 탭으로 초기화
    tabs.style.display = '';
    setTripModalTab('new');
  }
  renderCurrencyChips();
  renderCurrencyDropdown('');

  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === state.selectedColor);
  });

  openModal('modal-trip');
  if (!tripId) document.getElementById('trip-name').focus();
}

function setTripModalTab(tab) {
  const form  = document.getElementById('form-trip');
  const panel = document.getElementById('trip-join-panel');
  document.querySelectorAll('.trip-modal-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tripTab === tab)
  );
  if (tab === 'new') {
    form.style.display = '';
    panel.classList.add('hidden');
    document.getElementById('trip-name').focus();
  } else {
    form.style.display = 'none';
    panel.classList.remove('hidden');
    document.getElementById('join-link-input').value = '';
    document.getElementById('err-join-link').textContent = '';
    document.getElementById('join-link-input').focus();
  }
}

export function initTripModalTabs() {
  document.querySelectorAll('.trip-modal-tab').forEach(tab => {
    tab.addEventListener('click', () => setTripModalTab(tab.dataset.tripTab));
  });

  document.getElementById('btn-join-trip').addEventListener('click', submitJoinTrip);
}

async function submitJoinTrip() {
  const input   = document.getElementById('join-link-input');
  const errEl   = document.getElementById('err-join-link');
  const raw     = input.value.trim();
  errEl.textContent = '';

  if (!raw) {
    errEl.textContent = '초대 링크를 붙여넣어 주세요';
    input.focus();
    return;
  }

  let tripId, joinCode;
  try {
    const url    = new URL(raw);
    tripId   = url.searchParams.get('tripId');
    joinCode = url.searchParams.get('join');
  } catch {
    // URL 파싱 실패
  }

  if (!tripId || !joinCode) {
    errEl.textContent = '올바른 초대 링크가 아닙니다';
    input.focus();
    return;
  }

  const btn = document.getElementById('btn-join-trip');
  btn.disabled = true;
  btn.textContent = '처리 중…';

  try {
    await beginJoinFlow(tripId, joinCode);
  } catch (err) {
    console.error(err);
    errEl.textContent = '참여 처리 중 오류가 발생했습니다';
  } finally {
    btn.disabled = false;
    btn.textContent = '참여하기';
  }
}

// ── 여행 모달 통화 선택 UI ────────────────────────────────────────────────────
function renderCurrencyChips() {
  const wrap = document.getElementById('trip-currency-chips');
  if (!wrap) return;
  if (_selectedCurrencies.length === 0) {
    wrap.innerHTML = `<span class="currency-chip-empty">선택된 통화 없음 · 기본 ₩ KRW</span>`;
    return;
  }
  wrap.innerHTML = _selectedCurrencies.map(code => {
    const label = currencyShortLabel(code);
    return `<span class="currency-chip" data-code="${code}">
      ${escapeHtml(label)}
      <button type="button" class="currency-chip-x" data-code="${code}" aria-label="제거">✕</button>
    </span>`;
  }).join('');
  wrap.querySelectorAll('.currency-chip-x').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedCurrencies = _selectedCurrencies.filter(c => c !== btn.dataset.code);
      renderCurrencyChips();
      renderCurrencyDropdown(document.getElementById('trip-currency-search')?.value || '');
    });
  });
}

function renderCurrencyDropdown(query) {
  const dd = document.getElementById('trip-currency-dropdown');
  if (!dd) return;
  const q = (query || '').trim();
  const results = filterCurrencies(q).slice(0, 60);
  _currencyDropdownIdx = -1;
  if (results.length === 0) {
    dd.innerHTML = `<div class="currency-opt currency-opt-empty">검색 결과 없음</div>`;
    return;
  }
  dd.innerHTML = results.map(c => {
    const picked = _selectedCurrencies.includes(c.code);
    return `<div class="currency-opt${picked ? ' picked' : ''}" data-code="${c.code}">
      <span class="currency-opt-sym">${escapeHtml(c.symbol)}</span>
      <span class="currency-opt-code">${c.code}</span>
      <span class="currency-opt-name">${escapeHtml(c.ko)}</span>
      ${picked ? '<span class="currency-opt-check">✓</span>' : ''}
    </div>`;
  }).join('');
  dd.querySelectorAll('.currency-opt[data-code]').forEach(el => {
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      toggleCurrency(el.dataset.code);
    });
  });
}

function toggleCurrency(code) {
  if (!getCurrency(code)) return;
  if (_selectedCurrencies.includes(code)) {
    _selectedCurrencies = _selectedCurrencies.filter(c => c !== code);
  } else {
    _selectedCurrencies.push(code);
  }
  renderCurrencyChips();
  renderCurrencyDropdown(document.getElementById('trip-currency-search')?.value || '');
}

export function initTripCurrencyPicker() {
  const search = document.getElementById('trip-currency-search');
  const dd     = document.getElementById('trip-currency-dropdown');
  const wrap   = document.getElementById('trip-currency-picker');
  if (!search || !dd || !wrap) return;

  search.addEventListener('focus', () => {
    renderCurrencyDropdown(search.value);
    dd.classList.add('open');
  });
  search.addEventListener('input', () => {
    renderCurrencyDropdown(search.value);
    dd.classList.add('open');
  });
  search.addEventListener('keydown', e => {
    const opts = [...dd.querySelectorAll('.currency-opt[data-code]')];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _currencyDropdownIdx = Math.min(_currencyDropdownIdx + 1, opts.length - 1);
      updateDropdownHighlight(opts);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _currencyDropdownIdx = Math.max(_currencyDropdownIdx - 1, 0);
      updateDropdownHighlight(opts);
    } else if (e.key === 'Enter') {
      if (_currencyDropdownIdx >= 0 && opts[_currencyDropdownIdx]) {
        e.preventDefault();
        toggleCurrency(opts[_currencyDropdownIdx].dataset.code);
      }
    } else if (e.key === 'Escape') {
      dd.classList.remove('open');
    } else if (e.key === 'Backspace' && !search.value && _selectedCurrencies.length) {
      _selectedCurrencies.pop();
      renderCurrencyChips();
      renderCurrencyDropdown('');
    }
  });
  document.addEventListener('mousedown', e => {
    if (!wrap.contains(e.target)) dd.classList.remove('open');
  });
}

function updateDropdownHighlight(opts) {
  opts.forEach((el, i) => el.classList.toggle('active', i === _currencyDropdownIdx));
  if (_currencyDropdownIdx >= 0 && opts[_currencyDropdownIdx]) {
    opts[_currencyDropdownIdx].scrollIntoView({ block: 'nearest' });
  }
}

// 외부에서 trip의 통화 목록(기본 [KRW]) 조회
export function getTripCurrencies(trip) {
  if (!trip) return [DEFAULT_CURRENCY];
  const list = Array.isArray(trip.currencies) ? trip.currencies.filter(c => getCurrency(c)) : [];
  return list.length ? list : [DEFAULT_CURRENCY];
}

export function clearTripErrors() {
  ['err-trip-name', 'err-trip-dest', 'err-trip-start', 'err-trip-end'].forEach(id => {
    document.getElementById(id).textContent = '';
  });
  ['trip-name', 'trip-destination', 'trip-start', 'trip-end'].forEach(id => {
    document.getElementById(id).classList.remove('invalid');
  });
}

export async function saveTripForm(e) {
  e.preventDefault();
  clearTripErrors();

  const name  = document.getElementById('trip-name').value.trim();
  const dest  = document.getElementById('trip-destination').value.trim();
  const start = document.getElementById('trip-start').value;
  const end   = document.getElementById('trip-end').value;

  let valid = true;
  if (!name)  { showFieldError('trip-name', 'err-trip-name', '여행 이름을 입력해주세요'); valid = false; }
  if (!dest)  { showFieldError('trip-destination', 'err-trip-dest', '목적지를 입력해주세요'); valid = false; }
  if (!start) { showFieldError('trip-start', 'err-trip-start', '출발일을 선택해주세요'); valid = false; }
  if (!end)   { showFieldError('trip-end', 'err-trip-end', '도착일을 선택해주세요'); valid = false; }
  if (start && end && end < start) {
    showFieldError('trip-end', 'err-trip-end', '도착일은 출발일 이후여야 해요'); valid = false;
  }
  if (!valid) return;

  const currencies = _selectedCurrencies.length ? [..._selectedCurrencies] : [DEFAULT_CURRENCY];

  try {
    if (state.editingTripId) {
      await db.collection('trips').doc(state.editingTripId).update({
        title: name, destination: dest, startDate: start, endDate: end, color: state.selectedColor,
        currencies,
      });
    } else {
      const u = state.currentUser;
      await db.collection('trips').add({
        title: name, destination: dest, startDate: start, endDate: end, color: state.selectedColor,
        currencies,
        ownerId: u.uid,
        memberIds: [u.uid],
        memberProfiles: { [u.uid]: { name: u.displayName || '', email: u.email || '' } },
        shareCode: generateShareCode(),
        days: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    closeModal('modal-trip');
  } catch (err) {
    console.error(err);
    showToast('저장에 실패했습니다. 다시 시도해주세요.');
  }
}

export function showFieldError(inputId, errId, msg) {
  document.getElementById(inputId).classList.add('invalid');
  document.getElementById(errId).textContent = msg;
}

export async function copyShareLink(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  const url = `${location.origin}${location.pathname}?tripId=${trip.id}&join=${trip.shareCode}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast('초대 링크가 복사되었습니다!');
  } catch {
    prompt('아래 링크를 복사하세요:', url);
  }
}
