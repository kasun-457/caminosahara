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
function sortedTrips() {
  const trips = [...state.trips];
  if (state.tripSort === 'name') {
    return trips.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
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

export function openTripModal(tripId = null) {
  state.editingTripId = tripId;
  clearTripErrors();

  if (tripId) {
    const trip = state.trips.find(t => t.id === tripId);
    document.getElementById('modal-trip-heading').textContent = '여행 수정';
    document.getElementById('trip-name').value = trip.title;
    document.getElementById('trip-destination').value = trip.destination;
    document.getElementById('trip-start').value = trip.startDate;
    document.getElementById('trip-end').value = trip.endDate;
    state.selectedColor = trip.color;
  } else {
    document.getElementById('modal-trip-heading').textContent = '새 여행 추가';
    document.getElementById('form-trip').reset();
    state.selectedColor = '#c8f060';
  }

  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === state.selectedColor);
  });

  openModal('modal-trip');
  document.getElementById('trip-name').focus();
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
      await db.collection('trips').add({
        title: name, destination: dest, startDate: start, endDate: end, color: state.selectedColor,
        ownerId: state.currentUser.uid,
        memberIds: [state.currentUser.uid],
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
