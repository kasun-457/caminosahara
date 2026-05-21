import { state } from './state.js';
import { db } from './firebase.js';
import { CATEGORIES, HOUR_PX } from './constants.js';
import { getDays, fmtTab, fmtShort, fmtDate, escapeHtml, showToast } from './utils.js';
import { openDetailPanel, closeDetailPanel } from './detail-panel.js';
import { openActivityModal } from './activities.js';
import { renderDayTabs } from './day-list.js';
import { canEdit } from './trips.js';

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

// 일정 종료점이 다음날로 넘어가는지 계산
// startMin: 시작 시각(분), durationMin: 길이(분)
// 반환: { endTime: 'HH:MM', endsNextDay: boolean }
export function computeEnd(startMin, durationMin) {
  const absEnd = startMin + durationMin;
  if (absEnd <= 24 * 60) {
    return { endTime: minutesToTimeStr(absEnd), endsNextDay: false };
  }
  // 다음날 23:59까지 최대 허용
  const capped = Math.min(absEnd, 2 * 24 * 60 - 1);
  return { endTime: minutesToTimeStr(capped - 24 * 60), endsNextDay: true };
}

// 종료 시각(분, start 기준 상대값)
function actDurationMin(act) {
  if (!act.time || !act.endTime) return 60;
  const s = timeToMinutes(act.time);
  let e = timeToMinutes(act.endTime);
  if (act.endsNextDay) e += 24 * 60;
  return Math.max(15, e - s);
}

// 날짜 +/- 일
function shiftDate(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  // 전체 뷰는 월 단위 캘린더로 렌더
  if (state.calView === 'all') {
    renderMonthView(trip);
    return;
  }

  const calEl = document.getElementById('cal-view');
  const allDates = getDays(trip.startDate, trip.endDate);

  const count = 7;
  state.calDateOffset = Math.max(0, Math.min(state.calDateOffset, allDates.length - 1));
  const visibleDates = allDates.slice(state.calDateOffset, state.calDateOffset + count).filter(Boolean);

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
      return `<div class="cal-allday-chip" data-id="${act.id}" data-date="${date}" style="--ecolor:${cat.color};background:color-mix(in srgb,${cat.color} 18%,transparent);color:${cat.color};border:1px solid color-mix(in srgb,${cat.color} 35%,transparent)">${cat.icon} ${escapeHtml(act.title)}</div>`;
    }).join('');
    return `<div class="cal-allday-col">${chips}</div>`;
  }).join('');

  const MIN_EVENT_PX = 28; // 최소 카드 높이

  const colsHTML = visibleDates.map(date => {
    const dayData = trip.days.find(d => d.date === date) || { activities: [] };
    // 일반 일정 카드 (시간 있는 것)
    const eventsHTML = dayData.activities.filter(a => a.time).map(act => {
      const startMin = timeToMinutes(act.time);
      const absEnd   = act.endTime
        ? timeToMinutes(act.endTime) + (act.endsNextDay ? 24 * 60 : 0)
        : startMin + 60;
      const visEnd   = Math.min(absEnd, 24 * 60); // 오늘 날에는 24:00까지 표시
      const top      = minutesToPx(startMin);
      const height   = Math.max(MIN_EVENT_PX, minutesToPx(visEnd - startMin));
      const cat      = CATEGORIES[act.category] || CATEGORIES['기타'];
      const overflow = act.endsNextDay ? ' cal-event-overflow' : '';
      const timeLabel = act.endTime
        ? `${act.time} – ${act.endTime}${act.endsNextDay ? ' ⤵' : ''}`
        : act.time;
      return `<div class="cal-event${overflow}" data-id="${act.id}" data-date="${date}"
                   style="top:${top}px;height:${height}px;--ecolor:${cat.color}">
                <div class="cal-event-inner">
                  <div class="cal-event-title">${escapeHtml(act.title)}</div>
                  <div class="cal-event-time">${timeLabel}</div>
                </div>
                <div class="cal-event-resize" data-id="${act.id}" data-date="${date}"></div>
              </div>`;
    }).join('');

    // 전날에서 자정을 넘어 이어진 일정 (연속 칩, 클릭 시 원본 열기)
    const prevDate = shiftDate(date, -1);
    const prevDay  = trip.days.find(d => d.date === prevDate);
    const continuationsHTML = (prevDay?.activities || [])
      .filter(a => a.time && a.endsNextDay && a.endTime)
      .map(act => {
        const endMin = timeToMinutes(act.endTime);
        const height = Math.max(MIN_EVENT_PX, minutesToPx(endMin));
        const cat    = CATEGORIES[act.category] || CATEGORIES['기타'];
        return `<div class="cal-event cal-event-cont" data-id="${act.id}" data-date="${prevDate}"
                     style="top:0px;height:${height}px;--ecolor:${cat.color}"
                     title="전날부터 이어진 일정">
                  <div class="cal-event-inner">
                    <div class="cal-event-title">↳ ${escapeHtml(act.title)}</div>
                    <div class="cal-event-time">00:00 – ${act.endTime}</div>
                  </div>
                </div>`;
      }).join('');

    return `<div class="cal-column" data-date="${date}">${linesHTML}${continuationsHTML}${eventsHTML}</div>`;
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
    // 연속 칩은 원본이 아니므로 드래그/리사이즈 비활성
    if (!el.classList.contains('cal-event-cont')) {
      setupEventDrag(el, calBody);
    }
  });
  calEl.querySelectorAll('.cal-event-resize').forEach(el => setupEventResize(el, calBody));
  calEl.querySelectorAll('.cal-allday-chip').forEach(el => {
    setupAllDayDrag(el, calBody, calEl);
  });

  calEl.querySelectorAll('.cal-column').forEach(col => {
    col.addEventListener('click', e => {
      if (e.target.closest('.cal-event') || e.target.closest('.cal-allday-chip')) return;
      const trip = state.trips.find(t => t.id === state.currentTripId);
      if (!canEdit(trip)) return;
      const rect = col.getBoundingClientRect();
      const relY = e.clientY - rect.top + calBody.scrollTop;
      const min = Math.round(pxToMinutes(relY) / 15) * 15;
      openActivityModal(null, col.dataset.date, minutesToTimeStr(min));
    });
  });
}

// ── 월 단위 캘린더 뷰 (구글 캘린더 스타일) ────────────────────────────────────
function dateToStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function renderMonthView(trip) {
  const calEl = document.getElementById('cal-view');
  const allDates = getDays(trip.startDate, trip.endDate);
  const tripStart = new Date(trip.startDate + 'T00:00:00');
  const tripEnd   = new Date(trip.endDate   + 'T00:00:00');

  // 그리드 시작: 여행 시작일이 포함된 주의 일요일
  const gridStart = new Date(tripStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  // 그리드 끝: 여행 종료일이 포함된 주의 토요일
  const gridEnd = new Date(tripEnd);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  // 모든 셀 날짜 생성
  const cells = [];
  for (const d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    cells.push(dateToStr(d));
  }

  updateCalPeriodLabel(trip, allDates, allDates);

  const todayStr = dateToStr(new Date());

  const weekdaysHTML = ['일', '월', '화', '수', '목', '금', '토']
    .map((w, i) => {
      let cls = 'cal-month-weekday';
      if (i === 0) cls += ' sun';
      if (i === 6) cls += ' sat';
      return `<div class="${cls}">${w}</div>`;
    }).join('');

  // 도시 맵 구성 { date → {name, color} } (마이그레이션: cities 배열 → 첫 도시 사용)
  const cityMap = {};
  trip.days.forEach(d => {
    const cities = d.cities || (d.city ? [d.city] : []);
    if (cities.length > 0) cityMap[d.date] = cities[0];
  });

  function offsetDate(date, delta) {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    return dateToStr(d);
  }

  function sameCity(a, b) {
    return a && b && a.name === b.name && a.color === b.color;
  }

  const cellsHTML = cells.map(date => {
    const dateObj = new Date(date + 'T00:00:00');
    const inTrip = date >= trip.startDate && date <= trip.endDate;
    const isToday = date === todayStr;
    const dow = dateObj.getDay();

    let cls = 'cal-month-cell';
    if (!inTrip)  cls += ' out-of-range';
    if (isToday)  cls += ' is-today';
    if (dow === 0) cls += ' sun';
    if (dow === 6) cls += ' sat';

    const tripDayIdx = allDates.indexOf(date);
    const dayLabel = tripDayIdx >= 0
      ? `<span class="cal-month-trip-day">Day ${tripDayIdx + 1}</span>`
      : '';

    const dayData = trip.days.find(d => d.date === date) || { activities: [] };
    const sorted = [...dayData.activities].sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

    const eventsHTML = sorted.map(act => {
      const cat = CATEGORIES[act.category] || CATEGORIES['기타'];
      const timeLabel = act.time ? `<span class="cal-month-event-time">${act.time}</span>` : '';
      return `<div class="cal-month-event" data-id="${act.id}" data-date="${date}"
                   style="--ecolor:${cat.color}">
                <span class="cal-month-event-dot" style="background:${cat.color}"></span>
                ${timeLabel}
                <span class="cal-month-event-title">${escapeHtml(act.title)}</span>
              </div>`;
    }).join('');

    // 도시 스트라이프
    const city = cityMap[date];
    let stripeHTML = '';
    if (city && inTrip) {
      const prevCity = dow > 0 ? cityMap[offsetDate(date, -1)] : null;
      const nextCity = dow < 6 ? cityMap[offsetDate(date,  1)] : null;
      const hasPrev  = sameCity(city, prevCity);
      const hasNext  = sameCity(city, nextCity);
      let stripeCls  = 'city-month-stripe';
      if (hasPrev) stripeCls += ' stripe-cont-left';
      if (hasNext) stripeCls += ' stripe-cont-right';
      stripeHTML = `<div class="${stripeCls}" style="--stripe-color:${city.color}" title="${escapeHtml(city.name)}"></div>`;
    }

    return `<div class="${cls}" data-date="${date}">
      ${stripeHTML}
      <div class="cal-month-cell-header">
        <span class="cal-month-day-num">${dateObj.getDate()}</span>
        ${dayLabel}
      </div>
      <div class="cal-month-events">${eventsHTML}</div>
    </div>`;
  }).join('');

  calEl.innerHTML = `
    <div class="cal-month-view">
      <div class="cal-month-weekdays">${weekdaysHTML}</div>
      <div class="cal-month-grid">${cellsHTML}</div>
    </div>`;

  // 이벤트 클릭 → 상세 패널
  calEl.querySelectorAll('.cal-month-event').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      openDetailPanel(el.dataset.id, el.dataset.date);
    });
  });

  // 셀 클릭 → 해당 날짜의 목록 뷰로 이동 (여행 기간 내에서만)
  calEl.querySelectorAll('.cal-month-cell').forEach(cell => {
    if (cell.classList.contains('out-of-range')) return;
    cell.addEventListener('click', e => {
      if (e.target.closest('.cal-month-event')) return;
      const date = cell.dataset.date;
      const trip = state.trips.find(t => t.id === state.currentTripId);
      if (!trip) return;
      const allDates = getDays(trip.startDate, trip.endDate);
      const idx = allDates.indexOf(date);
      if (idx < 0) return;
      state.currentDayIndex = idx;
      switchCalView('list');
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
  const prevBtn = document.getElementById('cal-prev-btn');
  const nextBtn = document.getElementById('cal-next-btn');
  if (prevBtn) prevBtn.disabled = state.calDateOffset <= 0 || state.calView === 'all';
  if (nextBtn) nextBtn.disabled = state.calDateOffset + 7 >= allDates.length || state.calView === 'all';
}

// ── 드래그 & 리사이즈 ─────────────────────────────────────────────────────────
export function setupEventDrag(eventEl, calBody) {
  let dragState = null;
  eventEl.addEventListener('mousedown', e => {
    if (e.target.closest('.cal-event-resize')) return;
    const trip = state.trips.find(t => t.id === state.currentTripId);
    if (!canEdit(trip)) return;
    e.preventDefault();
    const rect = eventEl.getBoundingClientRect();
    const bodyRect = calBody.getBoundingClientRect();
    dragState = {
      actId: eventEl.dataset.id, date: eventEl.dataset.date,
      offsetY: e.clientY - rect.top,
      height: eventEl.offsetHeight,
      bodyRect,
      startX: e.clientX, startY: e.clientY,
      moved: false,
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  function onMove(e) {
    if (!dragState) return;
    if (!dragState.moved) {
      if (Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY) < 5) return;
      dragState.moved = true;
      eventEl.classList.add('cal-dragging');
    }
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
    const wasMoved = dragState.moved;
    if (wasMoved) {
      // 드래그 직후 발생할 click 이벤트 한 번 무시 → 상세 패널 안 열림
      eventEl.addEventListener('click', ev => {
        ev.stopPropagation(); ev.preventDefault();
      }, { capture: true, once: true });

      const newMin = pxToMinutes(parseInt(eventEl.style.top));
      const newTime = minutesToTimeStr(newMin);
      const trip = state.trips.find(t => t.id === state.currentTripId);
      const act = trip?.days.find(d => d.date === dragState.date)?.activities.find(a => a.id === dragState.actId);
      const updates = { time: newTime };
      if (act?.endTime) {
        const dur = actDurationMin(act);
        const { endTime, endsNextDay } = computeEnd(newMin, dur);
        updates.endTime = endTime;
        updates.endsNextDay = endsNextDay;
      }
      await updateActivityFields(dragState.actId, dragState.date, updates);
    }
    dragState = null;
  }
}

export function setupEventResize(resizeEl, calBody) {
  let resizeState = null;
  resizeEl.addEventListener('mousedown', e => {
    const trip = state.trips.find(t => t.id === state.currentTripId);
    if (!canEdit(trip)) return;
    e.preventDefault(); e.stopPropagation();
    const eventEl = resizeEl.closest('.cal-event');
    const topMin  = pxToMinutes(parseInt(eventEl.style.top));
    resizeState = {
      actId: resizeEl.dataset.id, date: resizeEl.dataset.date,
      eventEl, startH: eventEl.offsetHeight, startY: e.clientY,
      topMin,
      bodyRect: calBody.getBoundingClientRect(),
      calBody,
      curAbsEnd: topMin + pxToMinutes(eventEl.offsetHeight),
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  function onMove(e) {
    if (!resizeState) return;
    // 화면 기준 마우스 Y → cal-body 내부 Y로 변환
    const relY = e.clientY - resizeState.bodyRect.top + resizeState.calBody.scrollTop;
    let absEnd = Math.round(relY / (HOUR_PX / 4)) * (HOUR_PX / 4) / HOUR_PX * 60;
    // 최소 15분
    absEnd = Math.max(resizeState.topMin + 15, absEnd);
    // 최대 다음날 23:45 까지
    absEnd = Math.min(absEnd, 2 * 24 * 60 - 15);
    resizeState.curAbsEnd = absEnd;

    const visEnd = Math.min(absEnd, 24 * 60);
    const newH   = minutesToPx(visEnd - resizeState.topMin);
    resizeState.eventEl.style.height = Math.max(28, newH) + 'px';
    const overflow = absEnd > 24 * 60;
    resizeState.eventEl.classList.toggle('cal-event-overflow', overflow);

    const endTimeStr = minutesToTimeStr(absEnd);
    const timeEl = resizeState.eventEl.querySelector('.cal-event-time');
    if (timeEl) {
      timeEl.textContent = `${minutesToTimeStr(resizeState.topMin)} – ${endTimeStr}${overflow ? ' ⤵' : ''}`;
    }
  }

  async function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (!resizeState) return;
    // 리사이즈 직후 발생할 부모 click 무시
    resizeState.eventEl.addEventListener('click', ev => {
      ev.stopPropagation(); ev.preventDefault();
    }, { capture: true, once: true });
    const duration = resizeState.curAbsEnd - resizeState.topMin;
    const { endTime, endsNextDay } = computeEnd(resizeState.topMin, duration);
    await updateActivityFields(resizeState.actId, resizeState.date, { endTime, endsNextDay });
    resizeState = null;
  }
}

// ── 시간 미정 칩을 그리드로 드래그해 시간 설정 ────────────────────────────────
export function setupAllDayDrag(chipEl, calBody, calEl) {
  let dragState = null;

  chipEl.addEventListener('mousedown', e => {
    const trip = state.trips.find(t => t.id === state.currentTripId);
    if (!canEdit(trip)) {
      // 권한 없으면 클릭만 허용
      return;
    }
    e.preventDefault();
    dragState = {
      actId: chipEl.dataset.id,
      sourceDate: chipEl.dataset.date,
      startX: e.clientX, startY: e.clientY,
      dragging: false,
      ghost: null,
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // 권한 없는 사용자는 클릭만 가능 (drag 비활성)
  chipEl.addEventListener('click', e => {
    const trip = state.trips.find(t => t.id === state.currentTripId);
    if (!canEdit(trip)) openDetailPanel(chipEl.dataset.id, chipEl.dataset.date);
  });

  function onMove(e) {
    if (!dragState) return;
    if (!dragState.dragging) {
      if (Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY) < 5) return;
      dragState.dragging = true;
      const ghost = chipEl.cloneNode(true);
      ghost.classList.add('cal-allday-ghost');
      document.body.appendChild(ghost);
      dragState.ghost = ghost;
    }
    dragState.ghost.style.left = (e.clientX + 10) + 'px';
    dragState.ghost.style.top  = (e.clientY + 10) + 'px';

    calEl.querySelectorAll('.cal-column.drop-target').forEach(c => c.classList.remove('drop-target'));
    const targetCol = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cal-column');
    if (targetCol) targetCol.classList.add('drop-target');
  }

  async function onUp(e) {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (!dragState) return;
    if (dragState.ghost) dragState.ghost.remove();
    calEl.querySelectorAll('.cal-column.drop-target').forEach(c => c.classList.remove('drop-target'));

    const wasDragging = dragState.dragging;
    const st = dragState;
    dragState = null;
    if (!wasDragging) {
      // 드래그 아닌 클릭: 상세 패널 열기
      openDetailPanel(st.actId, st.sourceDate);
      return;
    }
    const targetCol = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cal-column');
    if (!targetCol) return;

    const rect = targetCol.getBoundingClientRect();
    const relY = e.clientY - rect.top + calBody.scrollTop;
    const min  = Math.max(0, Math.min(24 * 60 - 60, Math.round(pxToMinutes(relY) / 15) * 15));
    const time = minutesToTimeStr(min);
    const { endTime, endsNextDay } = computeEnd(min, 60);
    const targetDate = targetCol.dataset.date;

    if (targetDate === st.sourceDate) {
      await updateActivityFields(st.actId, st.sourceDate, { time, endTime, endsNextDay });
    } else {
      await moveActivityBetweenDays(st.actId, st.sourceDate, targetDate, { time, endTime, endsNextDay });
    }
  }
}

// 일정을 다른 날짜로 이동 (필드 갱신 + days 배열 재배치)
async function moveActivityBetweenDays(actId, fromDate, toDate, updates) {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (!trip) return;
  const updatedDays = structuredClone(trip.days);
  const fromDay = updatedDays.find(d => d.date === fromDate);
  if (!fromDay) return;
  const idx = fromDay.activities.findIndex(a => a.id === actId);
  if (idx < 0) return;
  const [act] = fromDay.activities.splice(idx, 1);
  Object.assign(act, updates);

  let toDay = updatedDays.find(d => d.date === toDate);
  if (!toDay) {
    toDay = { date: toDate, activities: [] };
    updatedDays.push(toDay);
  }
  toDay.activities.push(act);

  try {
    await db.collection('trips').doc(state.currentTripId).update({ days: updatedDays });
  } catch (err) { console.error(err); showToast('이동에 실패했습니다.'); }
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
  state.calDateOffset = Math.max(0, Math.min(state.calDateOffset + dir * 7, allDates.length - 1));
  renderGridView(trip);
}
