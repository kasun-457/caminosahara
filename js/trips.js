import { state } from './state.js';
import { db } from './firebase.js';
import { getDays, fmtShort, showToast, generateShareCode, openModal, closeModal } from './utils.js';
import { renderDayTabs } from './day-list.js';
import { renderGridView } from './calendar.js';
import { goBack } from './activities.js';

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
  const grid = document.getElementById('trip-grid');
  const empty = document.getElementById('empty-state');

  if (state.trips.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = state.trips.map(trip => {
    const days = getDays(trip.startDate, trip.endDate);
    const totalActs = days.reduce((n, date) => {
      const day = trip.days.find(d => d.date === date);
      return n + (day ? day.activities.length : 0);
    }, 0);
    const members = trip.memberIds?.length ?? 1;
    return `
      <div class="trip-card" data-id="${trip.id}" style="--trip-color:${trip.color}">
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

  grid.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('click', () => openTrip(card.dataset.id));
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
