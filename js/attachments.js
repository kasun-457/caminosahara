// ── 첨부파일 (예약 정보 PDF/이미지) 업로드·삭제 ─────────────────────────────
import { state } from './state.js';
import { db, storage } from './firebase.js';
import { uid, showToast, escapeHtml } from './utils.js';

// 첨부파일을 지원하는 카테고리
export const ATTACHABLE_CATEGORIES = new Set(['교통', '관광', '숙박']);

// 허용 파일 형식 / 최대 크기 (10MB)
const ACCEPT_TYPES = 'application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/heic';
const MAX_BYTES = 10 * 1024 * 1024;

export function fmtFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function fileIcon(type = '') {
  if (type.startsWith('image/')) return '🖼️';
  if (type === 'application/pdf') return '📄';
  return '📎';
}

// Storage 경로: trips/{tripId}/activities/{activityId}/{fileId}_{filename}
function storagePath(tripId, activityId, fileId, filename) {
  // 파일명에 슬래시 등 위험 문자 제거
  const safe = filename.replace(/[\\/:*?"<>|]/g, '_');
  return `trips/${tripId}/activities/${activityId}/${fileId}_${safe}`;
}

// 활동의 attachments 배열을 Firestore에 반영
async function updateActivityAttachments(tripId, date, activityId, newAttachments) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) throw new Error('trip not found');
  const updatedDays = structuredClone(trip.days);
  const dayData = updatedDays.find(d => d.date === date);
  if (!dayData) throw new Error('day not found');
  const act = dayData.activities.find(a => a.id === activityId);
  if (!act) throw new Error('activity not found');
  act.attachments = newAttachments;
  await db.collection('trips').doc(tripId).update({ days: updatedDays });
}

// 단일 파일 업로드 → attachments 배열에 추가
export async function uploadAttachment(file, tripId, date, activityId, onProgress) {
  if (file.size > MAX_BYTES) {
    showToast('파일이 너무 큽니다 (최대 10MB)');
    return null;
  }

  const fileId = uid();
  const path = storagePath(tripId, activityId, fileId, file.name);
  const ref = storage.ref(path);

  const task = ref.put(file, { contentType: file.type });
  if (onProgress) {
    task.on('state_changed', snap => {
      const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
      onProgress(pct);
    });
  }
  await task;
  const url = await ref.getDownloadURL();

  const meta = {
    id: fileId,
    name: file.name,
    size: file.size,
    type: file.type,
    path,
    url,
    uploadedAt: Date.now(),
  };

  // 최신 trip 데이터 기준으로 attachments 배열에 append
  const trip = state.trips.find(t => t.id === tripId);
  const dayData = trip?.days.find(d => d.date === date);
  const act = dayData?.activities.find(a => a.id === activityId);
  const current = act?.attachments || [];
  await updateActivityAttachments(tripId, date, activityId, [...current, meta]);

  return meta;
}

// 첨부파일 1개 삭제
export async function deleteAttachment(tripId, date, activityId, fileId) {
  const trip = state.trips.find(t => t.id === tripId);
  const dayData = trip?.days.find(d => d.date === date);
  const act = dayData?.activities.find(a => a.id === activityId);
  if (!act?.attachments) return;
  const target = act.attachments.find(a => a.id === fileId);
  if (!target) return;

  // Storage 먼저 삭제 (실패해도 메타데이터는 정리)
  try {
    await storage.ref(target.path).delete();
  } catch (err) {
    console.warn('storage delete failed:', err);
  }
  const next = act.attachments.filter(a => a.id !== fileId);
  await updateActivityAttachments(tripId, date, activityId, next);
}

// 활동이 통째로 삭제될 때, Storage의 파일들도 정리
export async function purgeActivityAttachments(attachments = []) {
  await Promise.allSettled(
    attachments.map(a => storage.ref(a.path).delete())
  );
}

// 첨부파일 섹션 HTML 렌더링 (보기/수정 모드 공용)
export function renderAttachmentsSection(category, attachments = [], isViewMode) {
  if (!ATTACHABLE_CATEGORIES.has(category)) return '';

  const items = attachments.map(a => `
    <li class="dp-att-item" data-id="${a.id}">
      <a class="dp-att-link" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">
        <span class="dp-att-icon">${fileIcon(a.type)}</span>
        <span class="dp-att-name">${escapeHtml(a.name)}</span>
        <span class="dp-att-size">${fmtFileSize(a.size)}</span>
      </a>
      ${isViewMode ? '' : `<button type="button" class="dp-att-del" data-id="${a.id}" title="삭제">✕</button>`}
    </li>`).join('');

  const emptyMsg = attachments.length === 0
    ? `<li class="dp-att-empty">${isViewMode ? '첨부된 파일이 없습니다.' : '예약 확인서·티켓 PDF나 이미지를 업로드하세요.'}</li>`
    : '';

  const uploadUi = isViewMode ? '' : `
    <div class="dp-att-upload">
      <input type="file" id="dp-att-input" accept="${ACCEPT_TYPES}" multiple style="display:none">
      <button type="button" class="btn-outline btn-sm" id="dp-att-btn">📎 파일 추가</button>
      <span class="dp-att-hint">클릭 또는 드래그&드롭 · PDF·이미지 (최대 10MB)</span>
      <div class="dp-att-progress" id="dp-att-progress" style="display:none">
        <div class="dp-att-progress-bar" id="dp-att-progress-bar"></div>
      </div>
      <div class="dp-att-drop-overlay" id="dp-att-drop-overlay">
        <div class="dp-att-drop-msg">📥 여기에 파일을 놓으세요</div>
      </div>
    </div>`;

  return `
    <div class="dp-att-section${isViewMode ? '' : ' dp-att-droppable'}" id="dp-att-section">
      <span class="dp-section-label">📎 예약 정보 파일</span>
      <ul class="dp-att-list">${items}${emptyMsg}</ul>
      ${uploadUi}
    </div>`;
}
