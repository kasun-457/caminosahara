import { state } from './state.js';
import { db } from './firebase.js';
import { CATEGORY_FIELDS, PLACE_AC_KEYS } from './constants.js';
import { escapeHtml, showToast, mapEmbedUrl, mapSearchUrl, mapDirectionsUrl } from './utils.js';
import { PlaceAutocomplete } from './place-autocomplete.js';

// ── 보기 / 수정 모드 전환 ─────────────────────────────────────────────────────
//  mode: 'view' | 'edit'
export function setDetailMode(mode) {
  const panel = document.getElementById('detail-panel');
  if (!panel) return;
  panel.dataset.mode = mode;
  const ro = mode === 'view';

  document.getElementById('dp-title').readOnly    = ro;
  document.getElementById('dp-notes').readOnly    = ro;
  document.getElementById('dp-time').readOnly     = ro;
  document.getElementById('dp-end-time').readOnly = ro;
  document.getElementById('dp-category').disabled = ro;

  document.querySelectorAll('#dp-dynamic-fields .dp-field-input').forEach(el => {
    el.readOnly = ro;
  });
}

export function getDetailMode() {
  return document.getElementById('detail-panel')?.dataset.mode || 'view';
}

export function renderDetailPanelFields(category, details = {}) {
  state.dpAutocompletes.forEach(ac => ac.destroy());
  state.dpAutocompletes = [];

  const container = document.getElementById('dp-dynamic-fields');
  const fields = CATEGORY_FIELDS[category] || [];
  container.innerHTML = fields.map(f => `
    <div class="dp-field-row">
      <span class="dp-field-icon">${f.icon}</span>
      <div class="dp-field-content">
        <span class="dp-field-label">${f.label}</span>
        <div class="${PLACE_AC_KEYS.has(f.key) ? 'place-ac-wrap' : ''}">
          <input type="text" class="dp-field-input" id="dpf-${f.key}" data-key="${f.key}"
                 placeholder="${escapeHtml(f.placeholder || '')}"
                 value="${escapeHtml(details[f.key] || '')}" autocomplete="off">
        </div>
      </div>
    </div>`).join('');

  const isViewMode = getDetailMode() === 'view';
  container.querySelectorAll('.dp-field-input').forEach(inp => {
    if (isViewMode) inp.readOnly = true;
    inp.addEventListener('input', () => {
      updateDetailPanelMap(document.getElementById('dp-category').value, gatherDetailPanelFields());
    });
    if (PLACE_AC_KEYS.has(inp.dataset.key)) {
      const ac = new PlaceAutocomplete(inp, () => {
        updateDetailPanelMap(document.getElementById('dp-category').value, gatherDetailPanelFields());
      });
      state.dpAutocompletes.push(ac);
    }
  });
}

export function gatherDetailPanelFields() {
  const details = {};
  document.querySelectorAll('#dp-dynamic-fields .dp-field-input').forEach(el => {
    const v = el.value.trim();
    if (v) details[el.dataset.key] = v;
  });
  return details;
}

export function updateDetailPanelMap(category, details) {
  const mapWrap = document.getElementById('dp-map-wrap');
  const mapFrame = document.getElementById('dp-map-frame');
  const mapLink = document.getElementById('dp-map-link');
  let mapQuery = null, openUrl = null;
  if (category === '교통' && details.fromLocation && details.toLocation) {
    mapQuery = `${details.fromLocation} to ${details.toLocation}`;
    openUrl = mapDirectionsUrl(details.fromLocation, details.toLocation);
  } else if (details.address) {
    mapQuery = details.address;
    openUrl = mapSearchUrl(details.address);
  } else if (details.fromLocation || details.toLocation) {
    mapQuery = details.fromLocation || details.toLocation;
    openUrl = mapSearchUrl(mapQuery);
  }
  if (mapQuery) {
    mapWrap.style.display = 'block';
    mapFrame.src = mapEmbedUrl(mapQuery);
    mapLink.href = openUrl;
  } else {
    mapWrap.style.display = 'none';
  }
}

export function openDetailPanel(activityId, date, mode = 'view') {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  const dayData = trip?.days.find(d => d.date === date);
  const act = dayData?.activities.find(a => a.id === activityId);
  if (!act) return;
  state.detailContext = { activityId, date };

  // 모드를 먼저 지정 (이후 렌더링·readOnly 적용에 사용됨)
  setDetailMode(mode);

  document.getElementById('dp-category').value = act.category;
  document.getElementById('dp-time').value = act.time || '';
  document.getElementById('dp-end-time').value = act.endTime || '';
  document.getElementById('dp-title').value = act.title;
  document.getElementById('dp-title').classList.remove('invalid');
  document.getElementById('dp-notes').value = act.notes || '';
  renderDetailPanelFields(act.category, act.details || {});
  updateDetailPanelMap(act.category, act.details || {});

  // 동적 필드까지 그린 뒤 readOnly 상태 확정
  setDetailMode(mode);

  document.querySelectorAll('.activity-item.dp-active').forEach(el => el.classList.remove('dp-active'));
  const activeItem = document.querySelector(`.activity-item[data-id="${activityId}"]`);
  if (activeItem) activeItem.classList.add('dp-active');

  document.getElementById('detail-overlay').classList.add('active');
}

export function closeDetailPanel() {
  document.getElementById('detail-overlay').classList.remove('active');
  document.querySelectorAll('.activity-item.dp-active').forEach(el => el.classList.remove('dp-active'));
  state.dpAutocompletes.forEach(ac => ac.destroy());
  state.dpAutocompletes = [];
  state.detailContext = { activityId: null, date: null };
}

export async function saveDetailPanel() {
  const { activityId, date } = state.detailContext;
  if (!activityId) return;

  const title = document.getElementById('dp-title').value.trim();
  if (!title) {
    document.getElementById('dp-title').classList.add('invalid');
    showToast('제목을 입력해주세요');
    return;
  }

  const time = document.getElementById('dp-time').value;
  const category = document.getElementById('dp-category').value;
  const notes = document.getElementById('dp-notes').value.trim();
  const details = gatherDetailPanelFields();

  const trip = state.trips.find(t => t.id === state.currentTripId);
  const updatedDays = structuredClone(trip.days);
  const dayData = updatedDays.find(d => d.date === date);
  if (!dayData) return;
  const act = dayData.activities.find(a => a.id === activityId);
  if (!act) return;

  const endTime = document.getElementById('dp-end-time').value || null;
  act.time = time; act.endTime = endTime; act.category = category;
  act.title = title; act.notes = notes; act.details = details;

  const btn = document.getElementById('dp-save');
  btn.disabled = true;
  try {
    await db.collection('trips').doc(state.currentTripId).update({ days: updatedDays });
    showToast('저장됐습니다 ✓');
    setDetailMode('view');  // 저장 성공 → 보기 모드로 복귀
  } catch (err) {
    console.error(err);
    showToast('저장에 실패했습니다.');
  } finally {
    btn.disabled = false;
  }
}
