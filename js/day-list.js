import { state } from './state.js';
import { CATEGORIES } from './constants.js';
import { getDays, fmtDate, fmtTab } from './utils.js';
import { closeDetailPanel, openDetailPanel } from './detail-panel.js';
import { openActivityModal, deleteActivity, confirmAction } from './activities.js';

export function renderDayTabs(trip) {
  const days = getDays(trip.startDate, trip.endDate);
  const tabsEl = document.getElementById('day-tabs');

  tabsEl.innerHTML = days.map((date, i) => {
    const dayData = trip.days.find(d => d.date === date);
    const count = dayData ? dayData.activities.length : 0;
    return `
      <button class="day-tab${i === state.currentDayIndex ? ' active' : ''}" data-day="${i}">
        <span class="day-num">Day ${i + 1}</span>
        <span class="day-date">${fmtTab(date)}</span>
        ${count > 0 ? `<span class="day-count">${count}</span>` : ''}
      </button>`;
  }).join('');

  tabsEl.querySelectorAll('.day-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.currentDayIndex = parseInt(tab.dataset.day);
      closeDetailPanel();
      renderDayTabs(trip);
    });
  });

  renderActivities(trip, days[state.currentDayIndex]);
}

export function renderActivities(trip, date) {
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

  panel.querySelectorAll('.activity-body').forEach(body => {
    body.addEventListener('click', e => {
      if (e.target.closest('.icon-btn')) return;
      const item = body.closest('.activity-item');
      openDetailPanel(item.dataset.id, date);
    });
  });

  panel.querySelectorAll('.btn-edit-act').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openDetailPanel(btn.dataset.id, date, 'edit'); });
  });

  panel.querySelectorAll('.btn-del-act').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      confirmAction('이 일정을 삭제할까요?', () => deleteActivity(trip.id, date, btn.dataset.id));
    });
  });
}
