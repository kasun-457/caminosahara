import { state } from './state.js';
import { CATEGORIES } from './constants.js';
import { getDays, fmtDate, fmtTab } from './utils.js';
import { closeDetailPanel, openDetailPanel } from './detail-panel.js';
import { openActivityModal, deleteActivity, confirmAction } from './activities.js';

let _scrollObserver = null;

function buildActivityHTML(act, date) {
  const cat = CATEGORIES[act.category] || CATEGORIES['기타'];
  return `
    <div class="activity-item" data-id="${act.id}">
      <div class="activity-time">${act.time || '—'}</div>
      <div class="activity-dot" style="background:${cat.color}"></div>
      <div class="activity-body">
        <div class="activity-header">
          <span class="activity-cat" style="color:${cat.color}">${cat.icon} ${act.category}</span>
          <div class="activity-btns">
            <button class="icon-btn btn-edit-act" data-id="${act.id}" data-date="${date}" title="수정">✎</button>
            <button class="icon-btn btn-del-act" data-id="${act.id}" data-date="${date}" title="삭제">✕</button>
          </div>
        </div>
        <h3 class="activity-title">${act.title}</h3>
        ${act.notes ? `<p class="activity-notes">${act.notes}</p>` : ''}
      </div>
    </div>`;
}

function buildDaySectionHTML(date, dayData, idx) {
  const sorted = [...(dayData?.activities || [])].sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
  return `
    <section class="day-section" id="day-section-${idx}" data-day="${idx}" data-date="${date}">
      <div class="activities-header">
        <h2 class="activities-date">${fmtDate(date)}</h2>
        <button class="btn-primary btn-sm btn-add-activity" data-date="${date}">+ 일정 추가</button>
      </div>
      <div class="timeline">
        ${sorted.length === 0
          ? `<div class="day-empty"><p>이 날의 일정이 없어요. 일정을 추가해보세요!</p></div>`
          : sorted.map(act => buildActivityHTML(act, date)).join('')}
      </div>
    </section>`;
}

function scrollTabTo(tabsEl, idx) {
  const tab = tabsEl.querySelector(`.day-tab[data-day="${idx}"]`);
  if (!tab) return;
  tabsEl.querySelectorAll('.day-tab').forEach(t => t.classList.toggle('active', t === tab));
  const tabCenter = tab.offsetLeft + tab.offsetWidth / 2;
  tabsEl.scrollLeft = tabCenter - tabsEl.clientWidth / 2;
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

  // 탭 클릭 → 해당 섹션으로 점프
  tabsEl.querySelectorAll('.day-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const idx = parseInt(tab.dataset.day);
      state.currentDayIndex = idx;
      closeDetailPanel();
      const section = document.getElementById(`day-section-${idx}`);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // 선택된 탭 가운데 정렬
  scrollTabTo(tabsEl, state.currentDayIndex);

  // ── 전체 일정 렌더 ────────────────────────────────────────────────────────
  panel.innerHTML = days.map((date, i) => {
    const dayData = trip.days.find(d => d.date === date);
    return buildDaySectionHTML(date, dayData, i);
  }).join('');

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

  // ── IntersectionObserver: 스크롤에 따라 탭 자동 업데이트 ─────────────────
  if (_scrollObserver) _scrollObserver.disconnect();

  // sticky bar 높이만큼 rootMargin 위쪽 여백 제거
  _scrollObserver = new IntersectionObserver(entries => {
    // 화면에 가장 많이 보이는 섹션을 active로
    let best = null;
    entries.forEach(entry => {
      if (!best || entry.intersectionRatio > best.intersectionRatio) best = entry;
    });
    if (best?.isIntersecting) {
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

  // 초기 위치: 선택된 날짜로 스크롤 (렌더 직후 부드럽게)
  requestAnimationFrame(() => {
    const section = document.getElementById(`day-section-${state.currentDayIndex}`);
    if (section && state.currentDayIndex > 0) {
      section.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  });
}

// 호환성 유지용 (calendar.js 등에서 호출하는 경우)
export function renderActivities(trip, date) {
  renderDayTabs(trip);
}
