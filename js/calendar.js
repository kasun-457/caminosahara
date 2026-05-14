import { state } from './state.js';
import { db } from './firebase.js';
import { CATEGORIES, HOUR_PX } from './constants.js';
import { getDays, fmtTab, fmtShort, fmtDate, escapeHtml, showToast } from './utils.js';
import { openDetailPanel, closeDetailPanel } from './detail-panel.js';
import { openActivityModal } from './activities.js';
import { renderDayTabs } from './day-list.js';

// ── 시간 변환 유틸 ────────────────────────────────────────────────────────────
export function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToPx(min) { return (min / 60) * HOUR_PX; }
export function pxToMinutes(px) { return (px / HOUR_PX) * 60; }

export function minutesToTimeStr(min) {
  const h = Math.floor(Math.max(0, min) / 60) % 24;
  const m = Math.round(Math.max(0, min) % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── 활동 필드 업데이트 (드래그/리사이즈 후 Firestore 반영) ────────────────────
export async function updateActivityFields(actId, date, updates) {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (!trip) return;
  const updatedDays = structuredClone(trip.days);
  const dayData = updatedDays.find(d => d.date === date);
  if (!dayData) return;
  const act = dayData.activities.find(a => a.id === actId);
  if (!act) return;
  Object.assign(act, updates);
  try {
    await db.collection('trips').doc(state.currentTripId).update({ days: updatedDays });
  } catch (err) { console.error(err); showToast('저장에 실패했습니다.'); }
}

// ── 그리드 뷰 렌더링 ──────────────────────────────────────────────────────────
export function renderGridView(trip) {
  const calEl = document.getElementById('cal-view');
  const allDates = getDays(trip.startDate, trip.endDate);

  let visibleDates;
  if (state.calView === 'all') {
    visibleDates = allDates;
  } else {
    const count = state.calView === '3day' ? 3 : 1;
    state.calDateOffset = Math.max(0, Math.min(state.calDateOffset, allDates.length - count));
    visibleDates = allDates.slice(state.calDateOffset, state.calDateOffset + count);
  }

  updateCalPeriodLabel(trip, visibleDates, allDates);

  const totalH = HOUR_PX * 24;
  let gutterHTML = '';
  let linesHTML = '';
  for (let h = 0; h < 24; h++) {
    gutterHTML += `<div class="cal-hour-label" style="top:${h * HOUR_PX}px">${String(h).padStart(2, '0')}:00</div>`;
    linesHTML  += `<div class="cal-hour-line" style="top:${h * HOUR_PX}px"></div>`;
    linesHTML  += `<div class="cal-half-line" style="top:${h * HOUR_PX + HOUR_PX / 2}px"></div>`;
  }

  const headerHTML = visibleDates.map(date => {
    const idx = allDates.indexOf(date);
    return `<div class="cal-col-header">
      <div class="cal-col-day-num">Day ${idx + 1}</div>
      <div class="cal-col-date">${fmtTab(date)}</div>
    </div>`;
  }).join('');

  const alldayHTML = visibleDates.map(date => {
    const dayData = trip.days.find(d => d.date === date) || { activities: [] };
    const chips = dayData.activities.filter(a => !a.time).map(act => {
      const cat = CATEGORIES[act.category] || CATEGORIES['기타'];
      return `<div class="cal-allday-chip" data-id="${act.id}" data-date="${date}"
                   style="--ecolor:${cat.color};background:color-mix(in srgb,${cat.color} 18%,transparent);color:${cat.color};border:1px solid color-mix(in srgb,${cat.color} 35%,transparent)">
                ${cat.icon} ${escapeHtml(act.title)}
              </div>`;
    }).join('');
    return `<div class="cal-allday-col">${chips}</div>`;
  }).join('');

  const colsHTML = visibleDates.map(date => {
    const dayData = trip.days.find(d => d.date === date) || { activities: [] };
    const eventsHTML = dayData.activities.filter(a => a.time).map(act => {
      const startMin = timeToMinutes(act.time);
      const endMin   = act.endTime ? timeToMinutes(act.endTime) : startMin + 60;
      const dur  = Math.max(endMin - startMin, 15);
      const top  = minutesToPx(startMin);
      const h    = Math.max(minutesToPx(dur), 22);
      const cat  = CATEGORIES[act.category] || CATEGORIES['기타'];
      return `<div class="cal-event" data-id="${act.id}" data-date="${date}"
                   style="top:${top}px;height:${h}px;--ecolor:${cat.color}">
                <div class="cal-event-inner">
                  <div class="cal-event-title">${escapeHtml(act.title)}</div>
                  <div class="cal-event-time">${act.time}${act.endTime ? ' – ' + act.endTime : ''}</div>
                </div>
                <div class="cal-event-resize" data-id="${act.id}" data-date="${date}"></div>
              </div>`;
    }).join('');
    return `<div class="cal-column" data-date="${date}">${linesHTML}${eventsHTML}</div>`;
  }).join('');

  calEl.innerHTML = `
    <div class="cal-header-row">
      <div class="cal-header-gutter"></div>
      <div class="cal-header-cols" id="cal-hcols">${headerHTML}</div>
    </div>
    <div class="cal-allday-row">
      <div class="cal-allday-label">시간 미정</div>
      <div class="cal-allday-cols" id="cal-adcols">${alldayHTML}</div>
    </div>
    <div class="cal-body" id="cal-body">
      <div class="cal-gutter" style="height:${totalH}px">${gutterHTML}</div>
      <div class="cal-cols-wrap" id="cal-cols-wrap">
        <div class="cal-columns" id="cal-columns" style="height:${totalH}px">${colsHTML}</div>
      </div>
    </div>`;

  const colsWrap = calEl.querySelector('#cal-cols-wrap');
  calEl.querySelector('#cal-hcols').style.overflow = 'hidden';
  calEl.querySelector('#cal-adcols').style.overflow = 'hidden';
  if (state.gridScrollController) state.gridScrollController.abort();
  state.gridScrollController = new AbortController();
  colsWrap.addEventListener('scroll', () => {
    calEl.querySelector('#cal-hcols').scrollLeft = colsWrap.scrollLeft;
    calEl.querySelector('#cal-adcols').scrollLeft = colsWrap.scrollLeft;
  }, { signal: state.gridScrollController.signal });

  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();
  if (visibleDates.includes(todayStr)) {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const nowLine = document.createElement('div');
    nowLine.className = 'cal-now-line';
    nowLine.style.top = minutesToPx(nowMin) + 'px';
    const todayCol = calEl.querySelector(`.cal-column[data-date="${todayStr}"]`);
    if (todayCol) todayCol.appendChild(nowLine);
  }

  const calBody = calEl.querySelector('#cal-body');
  requestAnimationFrame(() => { calBody.scrollTop = minutesToPx(7 * 60); });

  calEl.querySelectorAll('.cal-event').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.cal-event-resize')) return;
      openDetailPanel(el.dataset.id, el.dataset.date);
    });
    setupEventDrag(el, calBody);
  });
  calEl.querySelectorAll('.cal-event-resize').forEach(el => setupEventResize(el, calBody));
  calEl.querySelectorAll('.cal-allday-chip').forEach(el => {
    el.addEventListener('click', () => openDetailPanel(el.dataset.id, el.dataset.date));
  });

  calEl.querySelectorAll('.cal-column').forEach(col => {
    col.addEventListener('click', e => {
      if (e.target.closest('.cal-event') || e.target.closest('.cal-allday-chip')) return;
      const rect = col.getBoundingClientRect();
      const relY = e.clientY - rect.top + calBody.scrollTop;
      const min = Math.round(pxToMinutes(relY) / 15) * 15;
      openActivityModal(null, col.dataset.date, minutesToTimeStr(min));
    });
  });
}

export function updateCalPeriodLabel(trip, visibleDates, allDates) {
  const label = document.getElementById('cal-period-label');
  if (!label) return;
  if (state.calView === 'all') {
    label.textContent = `${fmtShort(trip.startDate)} – ${fmtShort(trip.endDate)}`;
  } else if (visibleDates.length === 1) {
    label.textContent = fmtDate(visibleDates[0]).slice(0, -5);
  } else {
    label.textContent = `${fmtShort(visibleDates[0])} – ${fmtShort(visibleDates[visibleDates.length - 1])}`;
  }
  const count = state.calView === '3day' ? 3 : 1;
  const prevBtn = document.getElementById('cal-prev-btn');
  const nextBtn = document.getElementById('cal-next-btn');
  if (prevBtn) prevBtn.disabled = state.calDateOffset <= 0 || state.calView === 'all';
  if (nextBtn) nextBtn.disabled = state.calDateOffset + count >= allDates.length || state.calView === 'all';
}

// ── 드래그 & 리사이즈 ─────────────────────────────────────────────────────────
export function setupEventDrag(eventEl, calBody) {
  let dragState = null;
  eventEl.addEventListener('mousedown', e => {
    if (e.target.closest('.cal-event-resize')) return;
    e.preventDefault();
    const rect = eventEl.getBoundingClientRect();
    const bodyRect = calBody.getBoundingClientRect();
    dragState = {
      actId: eventEl.dataset.id, date: eventEl.dataset.date,
      offsetY: e.clientY - rect.top,
      height: eventEl.offsetHeight,
      bodyRect,
    };
    eventEl.classList.add('cal-dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  function onMove(e) {
    if (!dragState) return;
    const relY = e.clientY - dragState.bodyRect.top + calBody.scrollTop - dragState.offsetY;
    const snapped = Math.round(relY / (HOUR_PX / 4)) * (HOUR_PX / 4);
    const clamped = Math.max(0, Math.min(snapped, HOUR_PX * 24 - dragState.height));
    eventEl.style.top = clamped + 'px';
    const timeEl = eventEl.querySelector('.cal-event-time');
    if (timeEl) timeEl.textContent = minutesToTimeStr(pxToMinutes(clamped));
  }

  async function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (!dragState) return;
    eventEl.classList.remove('cal-dragging');
    const newMin = pxToMinutes(parseInt(eventEl.style.top));
    const newTime = minutesToTimeStr(newMin);
    const trip = state.trips.find(t => t.id === state.currentTripId);
    const act = trip?.days.find(d => d.date === dragState.date)?.activities.find(a => a.id === dragState.actId);
    const updates = { time: newTime };
    if (act?.endTime) {
      const dur = timeToMinutes(act.endTime) - timeToMinutes(act.time);
      updates.endTime = minutesToTimeStr(newMin + dur);
    }
    await updateActivityFields(dragState.actId, dragState.date, updates);
    dragState = null;
  }
}

export function setupEventResize(resizeEl, calBody) {
  let resizeState = null;
  resizeEl.addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    const eventEl = resizeEl.closest('.cal-event');
    resizeState = {
      actId: resizeEl.dataset.id, date: resizeEl.dataset.date,
      eventEl, startH: eventEl.offsetHeight, startY: e.clientY,
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  function onMove(e) {
    if (!resizeState) return;
    const delta = e.clientY - resizeState.startY;
    const newH = Math.max(HOUR_PX / 4, resizeState.startH + delta);
    const snapped = Math.round(newH / (HOUR_PX / 4)) * (HOUR_PX / 4);
    resizeState.eventEl.style.height = snapped + 'px';
    const topMin = pxToMinutes(parseInt(resizeState.eventEl.style.top));
    const endMin = topMin + pxToMinutes(snapped);
    const timeEl = resizeState.eventEl.querySelector('.cal-event-time');
    if (timeEl) timeEl.textContent = `${minutesToTimeStr(topMin)} – ${minutesToTimeStr(endMin)}`;
  }

  async function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (!resizeState) return;
    const topMin = pxToMinutes(parseInt(resizeState.eventEl.style.top));
    const endMin = topMin + pxToMinutes(parseInt(resizeState.eventEl.style.height));
    await updateActivityFields(resizeState.actId, resizeState.date, { endTime: minutesToTimeStr(endMin) });
    resizeState = null;
  }
}

// ── 뷰 전환 & 탐색 ───────────────────────────────────────────────────────────
export function switchCalView(view) {
  state.calView = view;
  document.querySelectorAll('.cal-view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  const isList = view === 'list';
  document.getElementById('list-view-tabs').style.display   = isList ? '' : 'none';
  document.getElementById('trip-content-row').style.display = isList ? '' : 'none';
  document.getElementById('cal-view').style.display          = isList ? 'none' : '';
  document.getElementById('cal-toolbar-nav').style.display   = isList ? 'none' : 'flex';
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (!trip) return;
  if (isList) { renderDayTabs(trip); } else { closeDetailPanel(); renderGridView(trip); }
}

export function calNavigate(dir) {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (!trip) return;
  const allDates = getDays(trip.startDate, trip.endDate);
  const step = state.calView === '3day' ? 3 : 1;
  state.calDateOffset = Math.max(0, Math.min(state.calDateOffset + dir * step, allDates.length - step));
  renderGridView(trip);
}
