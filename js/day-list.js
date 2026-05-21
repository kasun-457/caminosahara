import { state } from './state.js';
import { CATEGORIES } from './constants.js';
import { getDays, fmtDate, fmtTab } from './utils.js';
import { closeDetailPanel, openDetailPanel } from './detail-panel.js';
import { openActivityModal, deleteActivity, confirmAction } from './activities.js';
import { addDayCity, removeDayCity, openCityPopover, closeCityPopover } from './city-groups.js';
import { canEdit } from './trips.js';

let _scrollObserver = null;
let _programmaticScroll = false;
let _programmaticScrollTimer = null;
let _firstRender = true;

function buildActivityHTML(act, date, editable) {
  const cat = CATEGORIES[act.category] || CATEGORIES['기타'];
  const btns = editable ? `
          <div class="activity-btns">
            <button class="icon-btn btn-edit-act" data-id="${act.id}" data-date="${date}" title="수정">✎</button>
            <button class="icon-btn btn-del-act" data-id="${act.id}" data-date="${date}" title="삭제">✕</button>
          </div>` : '';

  const notesHTML = act.notes
    ? `<span class="activity-notes-inline">${act.notes.replace(/\s+/g, ' ').trim()}</span>`
    : '';

  return `
    <div class="activity-item" data-id="${act.id}">
      <div class="activity-time">${act.time || '—'}</div>
      <div class="activity-dot" style="background:${cat.color}"></div>
      <div class="activity-body">
        <div class="activity-header">
          <span class="activity-cat" style="color:${cat.color}">${cat.icon} ${act.category}</span>${btns}
        </div>
        <div class="activity-title-row">
          <h3 class="activity-title">${act.title}</h3>
          ${notesHTML}
        </div>
      </div>
    </div>`;
}

function buildDaySectionHTML(date, dayData, idx, editable) {
  const sorted = [...(dayData?.activities || [])].sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });

  // 마이그레이션 지원 (이전 단일 city → cities 배열)
  const cities = dayData?.cities || [];
  if (!dayData?.cities && dayData?.city) {
    cities.push(dayData.city);
  }

  const citiesHTML = cities.length > 0
    ? cities.map(c => `<button class="city-pill ${editable ? 'btn-city-edit' : ''}" data-date="${date}" style="background:${c.color}20;border-color:${c.color};color:${c.color}">${c.name}</button>`).join('')
    : '';
  const addCityBtnHTML = editable
    ? `<button class="city-pill city-pill-add btn-city-edit" data-date="${date}">＋ 도시</button>`
    : '';

  const addBtnHTML = editable
    ? `<button class="btn-primary btn-sm btn-add-activity" data-date="${date}">+ 일정 추가</button>`
    : '';

  const emptyMsg = editable
    ? `이 날의 일정이 없어요. 일정을 추가해보세요!`
    : `이 날의 일정이 없어요.`;

  return `
    <section class="day-section" id="day-section-${idx}" data-day="${idx}" data-date="${date}">
      <div class="activities-header">
        <div class="activities-date-group">
          <span class="activities-day-badge">Day ${idx + 1}</span>
          <h2 class="activities-date">${fmtDate(date)}</h2>
          <div class="cities-group">
            ${citiesHTML}
            ${addCityBtnHTML}
          </div>
        </div>
        ${addBtnHTML}
      </div>
      <div class="timeline">
        ${sorted.length === 0
          ? `<div class="day-empty"><p>${emptyMsg}</p></div>`
          : sorted.map(act => buildActivityHTML(act, date, editable)).join('')}
      </div>
    </section>`;
}

function scrollTabTo(tabsEl, idx) {
  const tab = tabsEl.querySelector(`.day-tab[data-day="${idx}"]`);
  if (!tab) return;
  tabsEl.querySelectorAll('.day-tab').forEach(t => t.classList.toggle('active', t === tab));

  const wrapper = tabsEl.closest('.day-tabs-wrapper');
  const wrapperCenter = wrapper.clientWidth / 2;
  const tabCenter = tab.offsetLeft + tab.offsetWidth / 2;
  const tx = wrapperCenter - tabCenter;
  tabsEl.style.transform = `translateX(${tx}px)`;
}

export function renderDayTabs(trip) {
  const days = getDays(trip.startDate, trip.endDate);
  const tabsEl = document.getElementById('day-tabs');
  const panel  = document.getElementById('activities-panel');

  // ── 탭 렌더 ──────────────────────────────────────────────────────────────
  tabsEl.innerHTML = days.map((date, i) => {
    const dayData = trip.days.find(d => d.date === date);
    const count = dayData?.activities.length || 0;
    return `
      <button class="day-tab${i === state.currentDayIndex ? ' active' : ''}" data-day="${i}">
        <span class="day-num">Day ${i + 1}</span>
        <span class="day-date">${fmtTab(date)}</span>
        ${count > 0 ? `<span class="day-count">${count}</span>` : ''}
      </button>`;
  }).join('');

  // 탭 클릭 → 해당 섹션으로 점프 (스크롤 중 Observer 차단)
  tabsEl.querySelectorAll('.day-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const idx = parseInt(tab.dataset.day);
      state.currentDayIndex = idx;
      closeDetailPanel();
      scrollTabTo(tabsEl, idx);

      // Observer가 스크롤 중에 탭을 바꾸지 못하도록 차단
      _programmaticScroll = true;
      clearTimeout(_programmaticScrollTimer);
      _programmaticScrollTimer = setTimeout(() => { _programmaticScroll = false; }, 900);

      const section = document.getElementById(`day-section-${idx}`);
      if (section) {
        const headerH  = document.querySelector('header')?.offsetHeight || 60;
        const stickyH  = document.querySelector('.trip-sticky-bar')?.offsetHeight || 100;
        const gap = 16;
        const top = section.getBoundingClientRect().top + window.scrollY - headerH - stickyH - gap;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // 선택된 탭 가운데 정렬 — 레이아웃 완료 후 실행
  requestAnimationFrame(() => requestAnimationFrame(() => {
    scrollTabTo(tabsEl, state.currentDayIndex);
  }));

  // ── 전체 일정 렌더 (도시 그룹 헤더 포함) ────────────────────────────────
  const editable = canEdit(trip);
  let html = '';
  let lastCityKey = null;
  days.forEach((date, i) => {
    const dayData = trip.days.find(d => d.date === date);
    // 마이그레이션: 이전 city → cities 배열
    const cities = dayData?.cities || (dayData?.city ? [dayData.city] : []);
    const primaryCity = cities[0];
    const cityKey = primaryCity ? `${primaryCity.name}__${primaryCity.color}` : null;

    // 도시가 바뀌었을 때만 그룹 헤더 삽입 (첫 도시 기준)
    if (cityKey && cityKey !== lastCityKey) {
      html += `<div class="city-group-header" style="--city-color:${primaryCity.color}">
        <span class="city-group-dot"></span>
        <span class="city-group-name">${primaryCity.name}</span>
      </div>`;
    }
    lastCityKey = cityKey || null;
    html += buildDaySectionHTML(date, dayData, i, editable);
  });
  panel.innerHTML = html;
  if (_firstRender) {
    panel.classList.add('first-render');
    _firstRender = false;
    setTimeout(() => panel.classList.remove('first-render'), 600);
  }

  // + 일정 추가 버튼
  panel.querySelectorAll('.btn-add-activity').forEach(btn => {
    btn.addEventListener('click', () => openActivityModal(null, btn.dataset.date));
  });

  // 활동 카드 클릭 → 상세 패널
  panel.querySelectorAll('.activity-body').forEach(body => {
    body.addEventListener('click', e => {
      if (e.target.closest('.icon-btn')) return;
      const item = body.closest('.activity-item');
      const section = body.closest('.day-section');
      openDetailPanel(item.dataset.id, section.dataset.date);
    });
  });

  // 수정 버튼
  panel.querySelectorAll('.btn-edit-act').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openDetailPanel(btn.dataset.id, btn.dataset.date, 'edit');
    });
  });

  // 삭제 버튼
  panel.querySelectorAll('.btn-del-act').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      confirmAction('이 일정을 삭제할까요?', () => deleteActivity(trip.id, btn.dataset.date, btn.dataset.id));
    });
  });

  // 도시 버튼
  panel.querySelectorAll('.btn-city-edit').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const date = btn.dataset.date;
      const dayData = trip.days.find(d => d.date === date);

      // 마이그레이션: 이전 city → cities 배열
      let currentCities = dayData?.cities || [];
      if (!dayData?.cities && dayData?.city) {
        currentCities = [dayData.city];
      }

      // 이 여행에서 사용 중인 모든 도시 (현재 날짜 제외, 중복 제거)
      const seen = new Set();
      const existingCities = [];
      trip.days.forEach(d => {
        const citiesToCheck = d.cities || (d.city ? [d.city] : []);
        citiesToCheck.forEach(c => {
          if (!seen.has(c.name)) {
            existingCities.push(c);
            seen.add(c.name);
          }
        });
      });

      openCityPopover(
        btn,
        currentCities,
        existingCities,
        async (city) => {
          await addDayCity(trip.id, date, city);
        },
        async (cityName) => {
          await removeDayCity(trip.id, date, cityName);
        }
      );
    });
  });

  // ── IntersectionObserver: 스크롤에 따라 탭 자동 업데이트 ─────────────────
  if (_scrollObserver) _scrollObserver.disconnect();

  // sticky bar 높이만큼 rootMargin 위쪽 여백 제거
  _scrollObserver = new IntersectionObserver(entries => {
    if (_programmaticScroll) return; // 탭 클릭 스크롤 중엔 무시

    // 화면에 가장 많이 보이는 섹션을 active로
    let best = null;
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        if (!best || entry.intersectionRatio > best.intersectionRatio) best = entry;
      }
    });
    if (best) {
      const idx = parseInt(best.target.dataset.day);
      if (idx !== state.currentDayIndex) {
        state.currentDayIndex = idx;
        scrollTabTo(tabsEl, idx);
      }
    }
  }, {
    threshold: Array.from({ length: 11 }, (_, i) => i * 0.1),
    rootMargin: '-120px 0px -40% 0px',
  });

  panel.querySelectorAll('.day-section').forEach(sec => _scrollObserver.observe(sec));

  // 초기 위치: 선택된 날짜로 즉시 이동
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const section = document.getElementById(`day-section-${state.currentDayIndex}`);
    if (section && state.currentDayIndex > 0) {
      const headerH = document.querySelector('header')?.offsetHeight || 60;
      const stickyH = document.querySelector('.trip-sticky-bar')?.offsetHeight || 100;
      const top = section.getBoundingClientRect().top + window.scrollY - headerH - stickyH - 16;
      window.scrollTo({ top, behavior: 'instant' });
    }
  }));
}

<<<<<<< HEAD
// 호환성 유지용 (calendar.js 등에서 호출하는 경우)
export function renderActivities(trip, date) {
  renderDayTabs(trip);
}

// 새 여행을 열 때 슬라이드인 애니메이션을 한 번 재생하기 위한 리셋
export function resetDayListFirstRender() {
  _firstRender = true;
}
=======
>>>>>>> be77099bc3fc8e485b27eb4c4947ddfb60d0e91a
