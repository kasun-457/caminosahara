import { state } from './state.js';
import { db } from './firebase.js';
import { uid, showToast, openModal, closeModal } from './utils.js';
import { renderActivityFormFields, gatherActivityDetails } from './activity-fields.js';
import { closeDetailPanel } from './detail-panel.js';
import { purgeActivityAttachments } from './attachments.js';

export function openActivityModal(activityId, date, presetTime) {
  state.editingActivityId = activityId;
  state.editingActivityDate = date;
  document.getElementById('err-activity-title').textContent = '';
  document.getElementById('activity-title').classList.remove('invalid');

  let category = '관광';
  let details = {};

  if (activityId) {
    const trip = state.trips.find(t => t.id === state.currentTripId);
    const dayData = trip.days.find(d => d.date === date);
    const act = dayData?.activities.find(a => a.id === activityId);
    if (act) {
      document.getElementById('modal-activity-heading').textContent = '일정 수정';
      document.getElementById('activity-category').value = act.category;
      document.getElementById('activity-time').value = act.time || '';
      document.getElementById('activity-end-time').value = act.endTime || '';
      document.getElementById('activity-title').value = act.title;
      document.getElementById('activity-notes').value = act.notes || '';
      category = act.category;
      details = act.details || {};
    }
  } else {
    document.getElementById('modal-activity-heading').textContent = '일정 추가';
    document.getElementById('form-activity').reset();
    if (presetTime) document.getElementById('activity-time').value = presetTime;
  }

  renderActivityFormFields(category, details);
  openModal('modal-activity');
  document.getElementById('activity-title').focus();
}

export async function saveActivityForm(e) {
  e.preventDefault();
  const title = document.getElementById('activity-title').value.trim();
  if (!title) {
    document.getElementById('activity-title').classList.add('invalid');
    document.getElementById('err-activity-title').textContent = '제목을 입력해주세요';
    return;
  }

  const category = document.getElementById('activity-category').value;
  const notes    = document.getElementById('activity-notes').value.trim();
  const details  = gatherActivityDetails(category);
  const date     = state.editingActivityDate;

  // 동적 필드에서 시간 추출 (모든 카테고리가 startTime/endTime 또는 교통의 departTime/arriveTime 사용)
  let time = category === '교통' ? details.departTime : details.startTime;
  let endTime = category === '교통' ? details.arriveTime : details.endTime;
  time = time || '';
  endTime = endTime || '';

  // 시작 시간만 있고 종료 시간 없으면 → 1시간 후 기본값
  if (time && !endTime) {
    const [h, m] = time.split(':').map(Number);
    const end = h * 60 + m + 60;
    endTime = `${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
  }
  // 시작 시간 없으면 종료 시간도 제거
  if (!time) endTime = '';

  const trip = state.trips.find(t => t.id === state.currentTripId);
  const updatedDays = structuredClone(trip.days);
  let dayData = updatedDays.find(d => d.date === date);
  if (!dayData) { dayData = { date, activities: [] }; updatedDays.push(dayData); }

  if (state.editingActivityId) {
    const act = dayData.activities.find(a => a.id === state.editingActivityId);
    if (act) { act.time = time; act.endTime = endTime; act.category = category; act.title = title; act.notes = notes; act.details = details; }
  } else {
    dayData.activities.push({ id: uid(), time, endTime, category, title, notes, details });
  }

  try {
    await db.collection('trips').doc(state.currentTripId).update({ days: updatedDays });
    closeModal('modal-activity');
  } catch (err) {
    console.error(err);
    showToast('저장에 실패했습니다. 다시 시도해주세요.');
  }
}

export async function deleteActivity(tripId, date, actId) {
  const trip = state.trips.find(t => t.id === tripId);
  const updatedDays = structuredClone(trip.days);
  const dayData = updatedDays.find(d => d.date === date);
  let removedAttachments = [];
  if (dayData) {
    const removed = dayData.activities.find(a => a.id === actId);
    if (removed?.attachments) removedAttachments = removed.attachments;
    dayData.activities = dayData.activities.filter(a => a.id !== actId);
  }
  try {
    await db.collection('trips').doc(tripId).update({ days: updatedDays });
    if (removedAttachments.length) purgeActivityAttachments(removedAttachments);
  } catch (err) {
    console.error(err);
    showToast('삭제에 실패했습니다.');
  }
}

export async function deleteTrip(tripId) {
  try {
    // 모든 활동의 첨부파일 수집 → Storage에서 삭제
    const trip = state.trips.find(t => t.id === tripId);
    const allAttachments = [];
    trip?.days?.forEach(d => d.activities?.forEach(a => {
      if (a.attachments?.length) allAttachments.push(...a.attachments);
    }));
    if (allAttachments.length) purgeActivityAttachments(allAttachments);

    await db.collection('trips').doc(tripId).delete();
    goBack();
  } catch (err) {
    console.error(err);
    showToast('삭제에 실패했습니다.');
  }
}

export function confirmAction(message, callback) {
  state.confirmCallback = callback;
  document.getElementById('confirm-msg').textContent = message;
  openModal('modal-confirm');
}

export function goBack() {
  closeDetailPanel();
  // 채팅 패널이 열려있으면 함께 닫음 (구독 해제 포함)
  if (state.unsubscribeChat) {
    state.unsubscribeChat();
    state.unsubscribeChat = null;
  }
  document.getElementById('chat-panel')?.classList.remove('active');
  document.getElementById('btn-chat-fab')?.classList.remove('chat-fab-open');
  document.body.classList.remove('chat-open');

  state.currentTripId = null;
  window.history.replaceState(null, '', location.pathname + location.search);
  document.getElementById('nav-breadcrumb').textContent = '';
  document.getElementById('nav-back').style.display = 'none';
  document.getElementById('view-trip').classList.remove('active');
  document.getElementById('view-list').classList.add('active');
}
