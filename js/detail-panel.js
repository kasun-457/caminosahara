import { state } from './state.js';
import { canEdit, getTripCurrencies } from './trips.js';
import { db } from './firebase.js';
import { CATEGORY_FIELDS, PLACE_AC_KEYS, CATEGORIES } from './constants.js';
import { escapeHtml, showToast, mapEmbedUrl, mapSearchUrl, mapDirectionsUrl, generateTimeOptions } from './utils.js';
import { currencyShortLabel } from './currencies.js';
import { PlaceAutocomplete } from './place-autocomplete.js';
import {
  renderAttachmentsSection, uploadAttachment, deleteAttachment, ATTACHABLE_CATEGORIES,
} from './attachments.js';

// 첨부 섹션 (보기/수정 모드 모두) 렌더 + 이벤트 바인딩
function renderAndBindAttachments() {
  const container = document.getElementById('dp-attachments');
  if (!container) return;
  const { activityId, date } = state.detailContext;
  const category = document.getElementById('dp-category').value;
  const trip = state.trips.find(t => t.id === state.currentTripId);
  const dayData = trip?.days.find(d => d.date === date);
  const act = dayData?.activities.find(a => a.id === activityId);
  const attachments = act?.attachments || [];

  const isViewMode = getDetailMode() === 'view';
  container.innerHTML = renderAttachmentsSection(category, attachments, isViewMode);

  if (!ATTACHABLE_CATEGORIES.has(category) || isViewMode) return;

  const btn = document.getElementById('dp-att-btn');
  const input = document.getElementById('dp-att-input');
  const progressWrap = document.getElementById('dp-att-progress');
  const progressBar = document.getElementById('dp-att-progress-bar');
  const section = document.getElementById('dp-att-section');
  const dropOverlay = document.getElementById('dp-att-drop-overlay');

  // 파일 목록 업로드 공통 로직
  async function handleFiles(files) {
    if (!files || files.length === 0) return;
    btn.disabled = true;
    progressWrap.style.display = 'block';
    try {
      for (const f of files) {
        progressBar.style.width = '0%';
        await uploadAttachment(f, state.currentTripId, date, activityId, pct => {
          progressBar.style.width = pct + '%';
        });
      }
      showToast('파일이 업로드됐습니다 ✓');
    } catch (err) {
      console.error(err);
      showToast('업로드에 실패했습니다.');
    } finally {
      btn.disabled = false;
      progressWrap.style.display = 'none';
      progressBar.style.width = '0%';
      renderAndBindAttachments();
    }
  }

  // 클릭 업로드
  if (btn && input) {
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      input.value = '';
      handleFiles(files);
    });
  }

  // 드래그&드롭 업로드
  if (section) {
    let depth = 0; // dragenter/leave가 자식 요소에서도 발생하므로 카운트
    section.addEventListener('dragenter', e => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      depth++;
      section.classList.add('dp-att-drag-over');
    });
    section.addEventListener('dragover', e => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    section.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) section.classList.remove('dp-att-drag-over');
    });
    section.addEventListener('drop', e => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      depth = 0;
      section.classList.remove('dp-att-drag-over');
      handleFiles(Array.from(e.dataTransfer.files));
    });
  }

  // 삭제 버튼
  container.querySelectorAll('.dp-att-del').forEach(b => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      const fileId = b.dataset.id;
      b.disabled = true;
      try {
        await deleteAttachment(state.currentTripId, date, activityId, fileId);
        renderAndBindAttachments();
      } catch (err) {
        console.error(err);
        showToast('삭제에 실패했습니다.');
        b.disabled = false;
      }
    });
  });
}

// ── 보기 / 수정 모드 전환 ─────────────────────────────────────────────────────
//  mode: 'view' | 'edit'
export function setDetailMode(mode) {
  const panel = document.getElementById('detail-panel');
  if (!panel) return;

  const trip    = state.trips.find(t => t.id === state.currentTripId);
  const owner   = canEdit(trip);
  // 뷰어는 수정 모드 진입 자체를 막음
  const safeMode = (!owner && mode === 'edit') ? 'view' : mode;
  panel.dataset.mode = safeMode;
  const ro = safeMode === 'view';

  document.getElementById('dp-title').readOnly    = ro;
  document.getElementById('dp-notes').readOnly    = ro;
  document.getElementById('dp-category').disabled = ro;

  // 카테고리 배지: 보기 모드 → 컬러 배지 표시 / 수정 모드 → select 표시
  const catVal   = document.getElementById('dp-category').value;
  const catMeta  = CATEGORIES[catVal] || CATEGORIES['기타'];
  const badge    = document.getElementById('dp-cat-badge');
  const select   = document.getElementById('dp-category');
  if (ro) {
    badge.textContent = `${catMeta.icon} ${catVal}`;
    badge.style.setProperty('--cat-color', catMeta.color);
    badge.style.display = '';
    select.style.display = 'none';
  } else {
    badge.style.display = 'none';
    select.style.display = '';
  }

  // 보기 모드 푸터: 관리자 → 삭제+수정, 멤버 → 읽기 전용 라벨, 공통 → 닫기
  if (ro) {
    const showOwner  = owner;
    document.getElementById('dp-delete').style.display         = showOwner ? '' : 'none';
    document.getElementById('dp-edit').style.display           = showOwner ? '' : 'none';
    document.getElementById('dp-readonly-label').style.display = showOwner ? 'none' : '';
    document.getElementById('dp-view-close').style.display     = '';
    document.getElementById('dp-cancel').style.display         = 'none';
    document.getElementById('dp-save').style.display           = 'none';
  } else {
    document.getElementById('dp-delete').style.display         = 'none';
    document.getElementById('dp-edit').style.display           = 'none';
    document.getElementById('dp-readonly-label').style.display = 'none';
    document.getElementById('dp-view-close').style.display     = 'none';
    document.getElementById('dp-cancel').style.display         = '';
    document.getElementById('dp-save').style.display           = '';
  }

  // 동적 필드는 모드에 따라 input ↔ 하이퍼링크 형태가 달라지므로 재렌더
  if (state.detailContext?.activityId) {
    const category = document.getElementById('dp-category').value;
    // 현재 화면(또는 원본)에서 details 수집
    const inMemoryDetails = gatherDetailPanelFields();
    const trip = state.trips.find(t => t.id === state.currentTripId);
    const dayData = trip?.days.find(d => d.date === state.detailContext.date);
    const act = dayData?.activities.find(a => a.id === state.detailContext.activityId);
    const sourceDetails = act?.details || {};
    // 입력이 없던 필드(URL 등)는 원본 details로 보완
    const merged = { ...sourceDetails, ...inMemoryDetails };
    renderDetailPanelFields(category, merged);
    renderAndBindAttachments();
  } else {
    document.querySelectorAll('#dp-dynamic-fields .dp-field-input').forEach(el => {
      el.readOnly = ro;
    });
  }
}

function getDetailMode() {
  return document.getElementById('detail-panel')?.dataset.mode || 'view';
}

export function renderDetailPanelFields(category, details = {}) {
  state.dpAutocompletes.forEach(ac => ac.destroy());
  state.dpAutocompletes = [];
  // 카테고리에 따라 첨부 가능 여부가 달라지므로 함께 갱신
  if (state.detailContext?.activityId) {
    queueMicrotask(() => renderAndBindAttachments());
  }

  const container = document.getElementById('dp-dynamic-fields');
  const fields = CATEGORY_FIELDS[category] || [];
  const isViewMode = getDetailMode() === 'view';

  container.innerHTML = fields.map(f => {
    const isUrl = f.key === 'url';
    const val = details[f.key] || '';
    // URL 필드 + 보기 모드: 하이퍼링크로 렌더링
    if (isUrl && isViewMode) {
      const linkContent = val
        ? `<a href="${escapeHtml(val)}" target="_blank" rel="noopener noreferrer" class="dp-field-link">${escapeHtml(val)}</a>`
        : `<span class="dp-field-empty">—</span>`;
      return `
    <div class="dp-field-row">
      <span class="dp-field-icon">${f.icon}</span>
      <div class="dp-field-content">
        <span class="dp-field-label">${f.label}</span>
        <div>${linkContent}</div>
      </div>
    </div>`;
    }
    // 시간 필드: 드롭다운으로 렌더링
    if (f.type === 'time') {
      if (isViewMode) {
        return `
    <div class="dp-field-row">
      <span class="dp-field-icon">${f.icon}</span>
      <div class="dp-field-content">
        <span class="dp-field-label">${f.label}</span>
        <div>${val || '—'}</div>
      </div>
    </div>`;
      }
      const times = generateTimeOptions();
      return `
    <div class="dp-field-row">
      <span class="dp-field-icon">${f.icon}</span>
      <div class="dp-field-content">
        <span class="dp-field-label">${f.label}</span>
        <select class="dp-field-input time-select" id="dpf-${f.key}" data-key="${f.key}">
          <option value="">선택 안함</option>
          ${times.map(t => `<option value="${t}" ${t === val ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
    </div>`;
    }
    // price 필드: trip 통화가 2개 이상이면 통화 셀렉트 동반
    if (f.key === 'price') {
      const trip = state.trips.find(t => t.id === state.currentTripId);
      const codes = getTripCurrencies(trip);
      const curSel = codes.includes(details.priceCurrency) ? details.priceCurrency : codes[0];
      if (isViewMode) {
        const display = val
          ? `${escapeHtml(val)}${codes.length >= 2 ? ` <span class="dp-price-currency-view">(${escapeHtml(currencyShortLabel(curSel))})</span>` : ''}`
          : '—';
        return `
    <div class="dp-field-row">
      <span class="dp-field-icon">${f.icon}</span>
      <div class="dp-field-content">
        <span class="dp-field-label">${f.label}</span>
        <div>${display}</div>
      </div>
    </div>`;
      }
      const curSelect = codes.length >= 2 ? `
        <select class="dp-field-input price-currency-select" id="dpf-priceCurrency" data-key="priceCurrency">
          ${codes.map(c => `<option value="${c}" ${c === curSel ? 'selected' : ''}>${currencyShortLabel(c)}</option>`).join('')}
        </select>` : '';
      return `
    <div class="dp-field-row">
      <span class="dp-field-icon">${f.icon}</span>
      <div class="dp-field-content">
        <span class="dp-field-label">${f.label}</span>
        <div class="price-input-row">
          <input type="text" class="dp-field-input" id="dpf-${f.key}" data-key="${f.key}"
                 placeholder="${escapeHtml(f.placeholder || '')}"
                 value="${escapeHtml(val)}" autocomplete="off">
          ${curSelect}
        </div>
      </div>
    </div>`;
    }
    return `
    <div class="dp-field-row">
      <span class="dp-field-icon">${f.icon}</span>
      <div class="dp-field-content">
        <span class="dp-field-label">${f.label}</span>
        <div class="${PLACE_AC_KEYS.has(f.key) ? 'place-ac-wrap' : ''}">
          <input type="text" class="dp-field-input" id="dpf-${f.key}" data-key="${f.key}"
                 placeholder="${escapeHtml(f.placeholder || '')}"
                 value="${escapeHtml(val)}" autocomplete="off">
        </div>
      </div>
    </div>`;
  }).join('');
  container.querySelectorAll('.dp-field-input:not(.time-select)').forEach(inp => {
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
  // 시간 선택 이벤트
  container.querySelectorAll('.dp-field-input.time-select').forEach(sel => {
    sel.addEventListener('change', () => {
      updateDetailPanelMap(document.getElementById('dp-category').value, gatherDetailPanelFields());
    });
  });
}

function gatherDetailPanelFields() {
  const details = {};
  document.querySelectorAll('#dp-dynamic-fields .dp-field-input').forEach(el => {
    const v = el.value.trim();
    if (v) details[el.dataset.key] = v;
  });
  // price가 없으면 priceCurrency도 의미 없음
  if (!details.price) delete details.priceCurrency;
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
  document.getElementById('dp-title').value = act.title;
  document.getElementById('dp-title').classList.remove('invalid');
  document.getElementById('dp-notes').value = act.notes || '';
  renderDetailPanelFields(act.category, act.details || {});
  updateDetailPanelMap(act.category, act.details || {});
  renderAndBindAttachments();

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

export async function saveDetailPanel(opts = {}) {
  const silent = !!opts.silent;
  const { activityId, date } = state.detailContext;
  if (!activityId) return false;

  const title = document.getElementById('dp-title').value.trim();
  if (!title) {
    if (silent) return false; // 자동 저장: 제목 비어있으면 조용히 스킵
    document.getElementById('dp-title').classList.add('invalid');
    showToast('제목을 입력해주세요');
    return false;
  }

  const category = document.getElementById('dp-category').value;
  const notes = document.getElementById('dp-notes').value.trim();
  const details = gatherDetailPanelFields();

  const trip = state.trips.find(t => t.id === state.currentTripId);
  const updatedDays = structuredClone(trip.days);
  const dayData = updatedDays.find(d => d.date === date);
  if (!dayData) return false;
  const act = dayData.activities.find(a => a.id === activityId);
  if (!act) return false;

  // 동적 필드에서 시간 추출
  let time = category === '교통' ? details.departTime : details.startTime;
  let endTime = category === '교통' ? details.arriveTime : details.endTime;
  time = time || '';
  endTime = endTime || null;
  act.time = time; act.endTime = endTime; act.category = category;
  act.title = title; act.notes = notes; act.details = details;

  const btn = document.getElementById('dp-save');
  if (btn) btn.disabled = true;
  try {
    await db.collection('trips').doc(state.currentTripId).update({ days: updatedDays });
    if (!silent) {
      showToast('저장됐습니다 ✓');
      setDetailMode('view');
    }
    return true;
  } catch (err) {
    console.error(err);
    if (!silent) showToast('저장에 실패했습니다.');
    return false;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// 바깥 클릭/ESC 등으로 패널을 닫을 때: 편집 모드면 조용히 저장 후 닫기
export async function autoSaveAndClose() {
  if (!state.detailContext?.activityId) {
    closeDetailPanel();
    return;
  }
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (canEdit(trip) && getDetailMode() === 'edit') {
    await saveDetailPanel({ silent: true });
  }
  closeDetailPanel();
}
