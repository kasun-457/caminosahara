import { state } from './state.js';
import { db } from './firebase.js';
import { getDays, fmtShort, showToast, generateShareCode, openModal, closeModal } from './utils.js';
import { renderDayTabs } from './day-list.js';
import { renderGridView } from './calendar.js';
import { goBack, confirmAction, deleteTrip } from './activities.js';

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
  state.unsubscribeTrips = db.collection('trips')
    .where('memberIds', 'array-contains', state.currentUser.uid)
    .onSnapshot(snapshot => {
      state.trips = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      renderTripList();
      if (state.currentTripId) {
        const trip = state.trips.find(t => t.id === state.currentTripId);
        if (trip) {
          if (state.calView === 'list') renderDayTabs(trip);
          else renderGridView(trip);
        } else {
          goBack();
        }
      }
    }, err => console.error('Firestore 오류:', err));
}

export function renderTripList() {
  const grid  = document.getElementById('trip-grid');
  const empty = document.getElementById('empty-state');

  // 정렬 탭 active 표시
  document.querySelectorAll('.trip-sort-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === state.tripSort);
  });

  const trips = sortedTrips();

  if (trips.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  const isManual = state.tripSort === 'manual';

  grid.innerHTML = trips.map(trip => {
    const days = getDays(trip.startDate, trip.endDate);
    const totalActs = days.reduce((n, date) => {
      const day = trip.days.find(d => d.date === date);
      return n + (day ? day.activities.length : 0);
    }, 0);
    const members = trip.memberIds?.length ?? 1;
    return `
      <div class="trip-card${isManual ? ' draggable' : ''}" data-id="${trip.id}"
           style="--trip-color:${trip.color}" ${isManual ? 'draggable="true"' : ''}>
        ${isManual ? '<div class="trip-drag-handle">⠿</div>' : ''}
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
  }).join('');

  // 클릭 → 여행 열기
  grid.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.trip-drag-handle')) return;
      openTrip(card.dataset.id);
    });
  });

  // 우클릭 → 컨텍스트 메뉴
  grid.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('contextmenu', e => {
      e.preventDefault();
      const trip = state.trips.find(t => t.id === card.dataset.id);
      if (!isOwner(trip)) return;
      showContextMenu(e.clientX, e.clientY, card.dataset.id);
    });
  });

  // 직접정렬 드래그
  if (isManual) setupDragSort(grid);
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

export function openTrip(tripId) {
  state.currentTripId = tripId;
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
  document.getElementById('btn-edit-trip').style.display        = owner ? '' : 'none';
  document.getElementById('btn-delete-trip').style.display      = owner ? '' : 'none';
  document.getElementById('btn-transfer-owner').style.display   = owner && trip.memberIds.length > 1 ? '' : 'none';
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

export async function openTransferOwnerModal(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;

  const profiles = trip.memberProfiles || {};
  const others   = trip.memberIds.filter(uid => uid !== state.currentUser.uid);

  const list = document.getElementById('transfer-member-list');
  list.innerHTML = others.map(uid => {
    const p    = profiles[uid] || {};
    const name = p.name || p.email || uid.slice(0, 8) + '…';
    const sub  = p.email && p.name ? `<span class="transfer-member-email">${p.email}</span>` : '';
    return `<button class="transfer-member-btn" data-uid="${uid}">
      <span class="transfer-member-name">${name}</span>${sub}
    </button>`;
  }).join('');

  list.querySelectorAll('.transfer-member-btn').forEach(btn => {
    btn.addEventListener('click', () => transferOwner(tripId, btn.dataset.uid));
  });

  openModal('modal-transfer-owner');
}

async function transferOwner(tripId, newOwnerUid) {
  confirmAction('정말 관리자 권한을 넘기시겠어요? 본인은 일반 멤버가 됩니다.', async () => {
    try {
      await db.collection('trips').doc(tripId).update({ ownerId: newOwnerUid });
      closeModal('modal-transfer-owner');
      showToast('관리자 권한이 양도됐습니다.');
    } catch (err) {
      console.error(err);
      showToast('오류가 발생했습니다.');
    }
  });
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
    // 수정 모드: 탭 숨기고 새 여행 폼만 표시
    tabs.style.display = 'none';
    form.style.display = '';
    panel.classList.add('hidden');
  } else {
    document.getElementById('modal-trip-heading').textContent = '새 여행 추가';
    document.getElementById('form-trip').reset();
    state.selectedColor = '#c8f060';
    // 추가 모드: 탭 표시, 새 여행 탭으로 초기화
    tabs.style.display = '';
    setTripModalTab('new');
  }

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
    const docRef  = db.collection('trips').doc(tripId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      errEl.textContent = '유효하지 않은 여행입니다';
      return;
    }

    const trip = docSnap.data();
    if (trip.shareCode !== joinCode) {
      errEl.textContent = '초대 코드가 올바르지 않습니다';
      return;
    }
    if (trip.memberIds.includes(state.currentUser.uid)) {
      closeModal('modal-trip');
      showToast('이미 참여 중인 여행입니다');
      return;
    }

    const u = state.currentUser;
    await docRef.update({
      memberIds: firebase.firestore.FieldValue.arrayUnion(u.uid),
      [`memberProfiles.${u.uid}`]: { name: u.displayName || '', email: u.email || '' },
    });
    closeModal('modal-trip');
    showToast(`"${trip.title}" 여행에 참여했습니다!`);
  } catch (err) {
    console.error(err);
    errEl.textContent = '참여 처리 중 오류가 발생했습니다';
  } finally {
    btn.disabled = false;
    btn.textContent = '참여하기';
  }
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

  try {
    if (state.editingTripId) {
      await db.collection('trips').doc(state.editingTripId).update({
        title: name, destination: dest, startDate: start, endDate: end, color: state.selectedColor,
      });
    } else {
      const u = state.currentUser;
      await db.collection('trips').add({
        title: name, destination: dest, startDate: start, endDate: end, color: state.selectedColor,
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
