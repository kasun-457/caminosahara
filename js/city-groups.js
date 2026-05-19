// ── 도시 그룹 기능 ──────────────────────────────────────────────────────────
import { state } from './state.js';
import { db } from './firebase.js';
import { escapeHtml, showToast } from './utils.js';

export const CITY_COLORS = [
  '#60a0f0', '#f0a060', '#c8f060', '#f060a0',
  '#c060f0', '#60f0c8', '#f0d060', '#f06060',
  '#a0d0a0', '#d0a060',
];

// Firestore의 해당 날짜 day에 city 저장
export async function saveDayCity(tripId, date, city) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  const updatedDays = structuredClone(trip.days);
  let dayData = updatedDays.find(d => d.date === date);
  if (!dayData) { dayData = { date, activities: [] }; updatedDays.push(dayData); }
  if (city) {
    dayData.city = city;         // { name, color }
  } else {
    delete dayData.city;
  }
  try {
    await db.collection('trips').doc(tripId).update({ days: updatedDays });
  } catch (err) {
    console.error(err);
    showToast('저장에 실패했습니다.');
  }
}

// ── 도시 팝오버 ──────────────────────────────────────────────────────────────
let _popover = null;

export function openCityPopover(anchorEl, currentCity, existingCities, onSave) {
  closeCityPopover();

  const name  = currentCity?.name  || '';
  const color = currentCity?.color || CITY_COLORS[0];

  const el = document.createElement('div');
  el.className = 'city-popover';

  const prevHTML = existingCities.length > 0 ? `
    <div class="city-popover-prev-label">이전 도시</div>
    <div class="city-prev-chips">
      ${existingCities.map(c => `
        <button type="button" class="city-prev-chip" data-name="${escapeHtml(c.name)}" data-color="${c.color}"
                style="background:${c.color}20;border-color:${c.color};color:${c.color}">
          ${escapeHtml(c.name)}
        </button>`).join('')}
    </div>` : '';

  el.innerHTML = `
    <div class="city-popover-title">여행 도시</div>
    ${prevHTML}
    <input class="city-popover-input" id="city-name-input" type="text"
           placeholder="예: 바르셀로나" value="${escapeHtml(name)}" autocomplete="off">
    <div class="city-color-swatches">
      ${CITY_COLORS.map(c => `
        <button type="button" class="city-color-swatch${c === color ? ' active' : ''}"
                data-color="${c}" style="background:${c}" title="${c}"></button>
      `).join('')}
    </div>
    <div class="city-popover-actions">
      ${name ? `<button type="button" class="btn-outline btn-xs city-remove-btn">제거</button>` : ''}
      <button type="button" class="btn-primary btn-xs city-save-btn">확인</button>
    </div>`;
  document.body.appendChild(el);
  _popover = el;

  // 색상 선택
  let selectedColor = color;
  function selectColor(c) {
    selectedColor = c;
    el.querySelectorAll('.city-color-swatch').forEach(b =>
      b.classList.toggle('active', b.dataset.color === c)
    );
  }

  el.querySelectorAll('.city-color-swatch').forEach(btn => {
    btn.addEventListener('click', () => selectColor(btn.dataset.color));
  });

  // 이전 도시 칩 클릭 → 이름·색상 자동 입력
  el.querySelectorAll('.city-prev-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      el.querySelector('#city-name-input').value = chip.dataset.name;
      selectColor(chip.dataset.color);
    });
  });

  // 저장
  el.querySelector('.city-save-btn').addEventListener('click', () => {
    const cityName = el.querySelector('#city-name-input').value.trim();
    if (!cityName) { el.querySelector('#city-name-input').focus(); return; }
    onSave({ name: cityName, color: selectedColor });
    closeCityPopover();
  });

  // 제거
  el.querySelector('.city-remove-btn')?.addEventListener('click', () => {
    onSave(null);
    closeCityPopover();
  });

  // 위치 계산
  positionPopover(el, anchorEl);

  // 외부 클릭 닫기
  setTimeout(() => {
    document.addEventListener('click', _onDocClick);
    document.addEventListener('keydown', _onEsc);
  }, 0);

  el.querySelector('#city-name-input').focus();
}

function positionPopover(el, anchor) {
  const r = anchor.getBoundingClientRect();
  el.style.position = 'fixed';
  el.style.left = r.left + 'px';
  el.style.top  = (r.bottom + 6) + 'px';
  requestAnimationFrame(() => {
    const er = el.getBoundingClientRect();
    if (er.right > window.innerWidth - 8)
      el.style.left = (window.innerWidth - er.width - 8) + 'px';
    if (er.bottom > window.innerHeight - 8)
      el.style.top = (r.top - er.height - 6) + 'px';
  });
}

function _onDocClick(e) {
  if (_popover && !_popover.contains(e.target)) closeCityPopover();
}
function _onEsc(e) {
  if (e.key === 'Escape') closeCityPopover();
}

export function closeCityPopover() {
  _popover?.remove();
  _popover = null;
  document.removeEventListener('click', _onDocClick);
  document.removeEventListener('keydown', _onEsc);
}
