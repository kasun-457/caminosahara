// ── 도시 그룹 기능 ──────────────────────────────────────────────────────────
import { state } from './state.js';
import { db } from './firebase.js';
import { escapeHtml, showToast } from './utils.js';

const CITY_COLORS = [
  '#60a0f0', '#f0a060', '#c8f060', '#f060a0',
  '#c060f0', '#60f0c8', '#f0d060', '#f06060',
  '#a0d0a0', '#d0a060',
];

// 날짜 데이터를 cities 배열로 마이그레이션 (호환성)
function migrateDayCity(dayData) {
  if (dayData.city && !dayData.cities) {
    dayData.cities = [dayData.city];
    delete dayData.city;
  }
  if (!dayData.cities) dayData.cities = [];
  return dayData;
}

// 도시 추가
export async function addDayCity(tripId, date, city) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  const updatedDays = structuredClone(trip.days);
  let dayData = updatedDays.find(d => d.date === date);
  if (!dayData) { dayData = { date, activities: [] }; updatedDays.push(dayData); }

  migrateDayCity(dayData);
  // 중복 방지 (같은 이름의 도시는 추가 안 함)
  if (!dayData.cities.some(c => c.name === city.name)) {
    dayData.cities.push(city);
  }

  try {
    await db.collection('trips').doc(tripId).update({ days: updatedDays });
  } catch (err) {
    console.error(err);
    showToast('저장에 실패했습니다.');
  }
}

// 도시 제거
export async function removeDayCity(tripId, date, cityName) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  const updatedDays = structuredClone(trip.days);
  let dayData = updatedDays.find(d => d.date === date);
  if (!dayData) return;

  migrateDayCity(dayData);
  dayData.cities = dayData.cities.filter(c => c.name !== cityName);

  try {
    await db.collection('trips').doc(tripId).update({ days: updatedDays });
  } catch (err) {
    console.error(err);
    showToast('저장에 실패했습니다.');
  }
}

// ── 도시 팝오버 ──────────────────────────────────────────────────────────────
let _popover = null;

export function openCityPopover(anchorEl, currentCities = [], existingCities = [], onAddCity, onRemoveCity) {
  closeCityPopover();

  const el = document.createElement('div');
  el.className = 'city-popover';

  // 현재 추가된 도시들
  const citiesHTML = currentCities.length > 0 ? `
    <div class="city-popover-current-label">이날의 도시</div>
    <div class="city-current-pills">
      ${currentCities.map(c => `
        <div class="city-current-pill" style="background:${c.color}20;border-color:${c.color};color:${c.color}">
          <span>${escapeHtml(c.name)}</span>
          <button type="button" class="city-pill-remove" data-name="${escapeHtml(c.name)}" title="제거">✕</button>
        </div>`).join('')}
    </div>` : '';

  // 이전에 사용한 도시들
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
    <div class="city-popover-title">여행 도시 추가</div>
    ${citiesHTML}
    <input class="city-popover-input" id="city-name-input" type="text"
           placeholder="예: 바르셀로나" autocomplete="off">
    <div class="city-color-swatches">
      ${CITY_COLORS.map(c => `
        <button type="button" class="city-color-swatch${c === CITY_COLORS[0] ? ' active' : ''}"
                data-color="${c}" style="background:${c}" title="${c}"></button>
      `).join('')}
    </div>
    ${prevHTML}
    <div class="city-popover-actions">
      <button type="button" class="btn-primary btn-xs city-add-btn">추가</button>
    </div>`;
  document.body.appendChild(el);
  _popover = el;

  // 색상 선택
  let selectedColor = CITY_COLORS[0];
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

  // 도시 제거 (현재 도시 목록에서)
  el.querySelectorAll('.city-pill-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const cityName = btn.dataset.name;
      onRemoveCity(cityName);
      openCityPopover(anchorEl, currentCities.filter(c => c.name !== cityName), existingCities, onAddCity, onRemoveCity);
    });
  });

  // 도시 추가
  el.querySelector('.city-add-btn').addEventListener('click', () => {
    const cityName = el.querySelector('#city-name-input').value.trim();
    if (!cityName) { el.querySelector('#city-name-input').focus(); return; }
    onAddCity({ name: cityName, color: selectedColor });
    // 입력 필드 초기화하고 팝오버 다시 열기 (사용자가 계속 추가할 수 있도록)
    openCityPopover(anchorEl, [...currentCities, { name: cityName, color: selectedColor }], existingCities, onAddCity, onRemoveCity);
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
