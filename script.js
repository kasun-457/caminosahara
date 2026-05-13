// State
let trips = JSON.parse(localStorage.getItem('trips') || '[]');
let currentTripId = null;
let currentDayIndex = 0;
let editingTripId = null;
let editingActivityId = null;
let editingActivityDate = null;
let confirmCallback = null;
let selectedColor = '#c8f060';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function saveTrips() {
  localStorage.setItem('trips', JSON.stringify(trips));
}

function getDays(start, end) {
  const days = [];
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function fmtDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
}

function fmtShort(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ko-KR', {
    month: 'numeric', day: 'numeric',
  });
}

function fmtTab(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ko-KR', {
    month: 'numeric', day: 'numeric', weekday: 'short',
  });
}

const CATEGORIES = {
  '관광': { icon: '🏛️', color: '#c8f060' },
  '식사': { icon: '🍽️', color: '#f0a060' },
  '교통': { icon: '🚌', color: '#60a0f0' },
  '숙박': { icon: '🏨', color: '#c060f0' },
  '쇼핑': { icon: '🛍️', color: '#f060a0' },
  '기타': { icon: '📌', color: '#7a7a82' },
};

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function renderTripList() {
  const grid = document.getElementById('trip-grid');
  const empty = document.getElementById('empty-state');

  if (trips.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = trips.map(trip => {
    const days = getDays(trip.startDate, trip.endDate);
    const totalActs = days.reduce((n, date) => {
      const day = trip.days.find(d => d.date === date);
      return n + (day ? day.activities.length : 0);
    }, 0);
    return `
      <div class="trip-card" data-id="${trip.id}" style="--trip-color:${trip.color}">
        <div class="trip-card-top">
          <div class="trip-card-deco"></div>
          <p class="trip-card-dest">${trip.destination}</p>
          <h2 class="trip-card-name">${trip.title}</h2>
        </div>
        <div class="trip-card-bottom">
          <span class="trip-meta">${fmtShort(trip.startDate)} – ${fmtShort(trip.endDate)}</span>
          <span class="trip-meta">${days.length}일 · ${totalActs}개 일정</span>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('click', () => openTrip(card.dataset.id));
  });
}

function openTrip(tripId) {
  currentTripId = tripId;
  currentDayIndex = 0;
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return;

  document.getElementById('nav-breadcrumb').textContent = trip.title;
  document.getElementById('nav-back').style.display = 'inline-flex';
  document.getElementById('trip-dest-label').textContent = trip.destination;
  document.getElementById('trip-title-label').textContent = trip.title;
  document.getElementById('trip-dates-label').textContent =
    `${fmtShort(trip.startDate)} → ${fmtShort(trip.endDate)}  ·  ${getDays(trip.startDate, trip.endDate).length}일`;
  document.getElementById('trip-hero').style.setProperty('--trip-color', trip.color);
  document.getElementById('day-tabs').style.setProperty('--trip-color', trip.color);

  renderDayTabs(trip);
  document.getElementById('view-list').classList.remove('active');
  document.getElementById('view-trip').classList.add('active');
}

function renderDayTabs(trip) {
  const days = getDays(trip.startDate, trip.endDate);
  const tabsEl = document.getElementById('day-tabs');

  tabsEl.innerHTML = days.map((date, i) => {
    const dayData = trip.days.find(d => d.date === date);
    const count = dayData ? dayData.activities.length : 0;
    return `
      <button class="day-tab${i === currentDayIndex ? ' active' : ''}" data-day="${i}">
        <span class="day-num">Day ${i + 1}</span>
        <span class="day-date">${fmtTab(date)}</span>
        ${count > 0 ? `<span class="day-count">${count}</span>` : ''}
      </button>`;
  }).join('');

  tabsEl.querySelectorAll('.day-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentDayIndex = parseInt(tab.dataset.day);
      renderDayTabs(trip);
    });
  });

  renderActivities(trip, days[currentDayIndex]);
}

function renderActivities(trip, date) {
  const panel = document.getElementById('activities-panel');
  const dayData = trip.days.find(d => d.date === date) || { date, activities: [] };
  const sorted = [...dayData.activities].sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });

  panel.innerHTML = `
    <div class="activities-header">
      <h2 class="activities-date">${fmtDate(date)}</h2>
      <button class="btn-primary btn-sm" id="btn-add-activity">+ 일정 추가</button>
    </div>
    <div class="timeline" id="timeline">
      ${sorted.length === 0
        ? `<div class="day-empty"><p>이 날의 일정이 없어요. 일정을 추가해보세요!</p></div>`
        : sorted.map(act => {
            const cat = CATEGORIES[act.category] || CATEGORIES['기타'];
            return `
              <div class="activity-item" data-id="${act.id}">
                <div class="activity-time">${act.time || '—'}</div>
                <div class="activity-dot" style="background:${cat.color}"></div>
                <div class="activity-body">
                  <div class="activity-header">
                    <span class="activity-cat" style="color:${cat.color}">${cat.icon} ${act.category}</span>
                    <div class="activity-btns">
                      <button class="icon-btn btn-edit-act" data-id="${act.id}" title="수정">✎</button>
                      <button class="icon-btn btn-del-act" data-id="${act.id}" title="삭제">✕</button>
                    </div>
                  </div>
                  <h3 class="activity-title">${act.title}</h3>
                  ${act.notes ? `<p class="activity-notes">${act.notes}</p>` : ''}
                </div>
              </div>`;
          }).join('')
      }
    </div>`;

  document.getElementById('btn-add-activity').addEventListener('click', () => openActivityModal(null, date));

  panel.querySelectorAll('.btn-edit-act').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openActivityModal(btn.dataset.id, date); });
  });

  panel.querySelectorAll('.btn-del-act').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      confirmAction('이 일정을 삭제할까요?', () => deleteActivity(trip.id, date, btn.dataset.id));
    });
  });
}

function openTripModal(tripId = null) {
  editingTripId = tripId;
  clearTripErrors();

  if (tripId) {
    const trip = trips.find(t => t.id === tripId);
    document.getElementById('modal-trip-heading').textContent = '여행 수정';
    document.getElementById('trip-name').value = trip.title;
    document.getElementById('trip-destination').value = trip.destination;
    document.getElementById('trip-start').value = trip.startDate;
    document.getElementById('trip-end').value = trip.endDate;
    selectedColor = trip.color;
  } else {
    document.getElementById('modal-trip-heading').textContent = '새 여행 추가';
    document.getElementById('form-trip').reset();
    selectedColor = '#c8f060';
  }

  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === selectedColor);
  });

  openModal('modal-trip');
  document.getElementById('trip-name').focus();
}

function clearTripErrors() {
  ['err-trip-name', 'err-trip-dest', 'err-trip-start', 'err-trip-end'].forEach(id => {
    document.getElementById(id).textContent = '';
  });
  ['trip-name', 'trip-destination', 'trip-start', 'trip-end'].forEach(id => {
    document.getElementById(id).classList.remove('invalid');
  });
}

function saveTripForm(e) {
  e.preventDefault();
  clearTripErrors();

  const name = document.getElementById('trip-name').value.trim();
  const dest = document.getElementById('trip-destination').value.trim();
  const start = document.getElementById('trip-start').value;
  const end = document.getElementById('trip-end').value;

  let valid = true;
  if (!name) { showFieldError('trip-name', 'err-trip-name', '여행 이름을 입력해주세요'); valid = false; }
  if (!dest) { showFieldError('trip-destination', 'err-trip-dest', '목적지를 입력해주세요'); valid = false; }
  if (!start) { showFieldError('trip-start', 'err-trip-start', '출발일을 선택해주세요'); valid = false; }
  if (!end) { showFieldError('trip-end', 'err-trip-end', '도착일을 선택해주세요'); valid = false; }
  if (start && end && end < start) {
    showFieldError('trip-end', 'err-trip-end', '도착일은 출발일 이후여야 해요'); valid = false;
  }
  if (!valid) return;

  if (editingTripId) {
    const trip = trips.find(t => t.id === editingTripId);
    trip.title = name; trip.destination = dest;
    trip.startDate = start; trip.endDate = end; trip.color = selectedColor;
  } else {
    trips.push({ id: uid(), title: name, destination: dest, startDate: start, endDate: end, color: selectedColor, days: [] });
  }

  saveTrips();
  closeModal('modal-trip');
  renderTripList();
  if (editingTripId && currentTripId === editingTripId) openTrip(editingTripId);
}

function showFieldError(inputId, errId, msg) {
  document.getElementById(inputId).classList.add('invalid');
  document.getElementById(errId).textContent = msg;
}

function openActivityModal(activityId, date) {
  editingActivityId = activityId;
  editingActivityDate = date;
  document.getElementById('err-activity-title').textContent = '';
  document.getElementById('activity-title').classList.remove('invalid');

  if (activityId) {
    const trip = trips.find(t => t.id === currentTripId);
    const dayData = trip.days.find(d => d.date === date);
    const act = dayData?.activities.find(a => a.id === activityId);
    if (act) {
      document.getElementById('modal-activity-heading').textContent = '일정 수정';
      document.getElementById('activity-time').value = act.time || '';
      document.getElementById('activity-category').value = act.category;
      document.getElementById('activity-title').value = act.title;
      document.getElementById('activity-notes').value = act.notes || '';
    }
  } else {
    document.getElementById('modal-activity-heading').textContent = '일정 추가';
    document.getElementById('form-activity').reset();
  }

  openModal('modal-activity');
  document.getElementById('activity-title').focus();
}

function saveActivityForm(e) {
  e.preventDefault();
  const title = document.getElementById('activity-title').value.trim();
  if (!title) {
    document.getElementById('activity-title').classList.add('invalid');
    document.getElementById('err-activity-title').textContent = '제목을 입력해주세요';
    return;
  }

  const time = document.getElementById('activity-time').value;
  const category = document.getElementById('activity-category').value;
  const notes = document.getElementById('activity-notes').value.trim();
  const date = editingActivityDate;

  const trip = trips.find(t => t.id === currentTripId);
  let dayData = trip.days.find(d => d.date === date);
  if (!dayData) { dayData = { date, activities: [] }; trip.days.push(dayData); }

  if (editingActivityId) {
    const act = dayData.activities.find(a => a.id === editingActivityId);
    if (act) { act.time = time; act.category = category; act.title = title; act.notes = notes; }
  } else {
    dayData.activities.push({ id: uid(), time, category, title, notes });
  }

  saveTrips();
  closeModal('modal-activity');
  renderDayTabs(trip);
}

function deleteActivity(tripId, date, actId) {
  const trip = trips.find(t => t.id === tripId);
  const dayData = trip.days.find(d => d.date === date);
  if (dayData) dayData.activities = dayData.activities.filter(a => a.id !== actId);
  saveTrips();
  renderDayTabs(trip);
}

function deleteTrip(tripId) {
  trips = trips.filter(t => t.id !== tripId);
  saveTrips();
  goBack();
  renderTripList();
}

function confirmAction(message, callback) {
  confirmCallback = callback;
  document.getElementById('confirm-msg').textContent = message;
  openModal('modal-confirm');
}

function goBack() {
  currentTripId = null;
  document.getElementById('nav-breadcrumb').textContent = '';
  document.getElementById('nav-back').style.display = 'none';
  document.getElementById('view-trip').classList.remove('active');
  document.getElementById('view-list').classList.add('active');
}

document.getElementById('btn-new-trip').addEventListener('click', () => openTripModal());
document.getElementById('btn-new-trip-empty').addEventListener('click', () => openTripModal());
document.getElementById('nav-back').addEventListener('click', goBack);
document.getElementById('nav-logo').addEventListener('click', () => { if (currentTripId) goBack(); });
document.getElementById('form-trip').addEventListener('submit', saveTripForm);
document.getElementById('form-activity').addEventListener('submit', saveActivityForm);
document.getElementById('btn-edit-trip').addEventListener('click', () => openTripModal(currentTripId));
document.getElementById('btn-delete-trip').addEventListener('click', () => {
  confirmAction('이 여행을 삭제할까요? 모든 일정도 함께 삭제됩니다.', () => deleteTrip(currentTripId));
});

document.getElementById('btn-confirm-ok').addEventListener('click', () => {
  if (confirmCallback) { confirmCallback(); confirmCallback = null; }
  closeModal('modal-confirm');
});

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['modal-confirm', 'modal-activity', 'modal-trip'].forEach(id => {
    if (document.getElementById(id).classList.contains('active')) closeModal(id);
  });
});

document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedColor = btn.dataset.color;
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

['trip-name', 'trip-destination', 'trip-start', 'trip-end', 'activity-title'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => {
    document.getElementById(id).classList.remove('invalid');
  });
});

renderTripList();