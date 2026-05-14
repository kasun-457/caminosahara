import { state } from './state.js';
import { db } from './firebase.js';
import { uid, showToast, openModal, closeModal } from './utils.js';
import { renderActivityFormFields, gatherActivityDetails } from './activity-fields.js';
import { closeDetailPanel } from './detail-panel.js';

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
      document.getElementById('activity-time').value = act.time || '';
      document.getElementById('activity-category').value = act.category;
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

  const time = document.getElementById('activity-time').value;
  const category = document.getElementById('activity-category').value;
  const notes = document.getElementById('activity-notes').value.trim();
  const details = gatherActivityDetails(category);
  const date = state.editingActivityDate;

  const trip = state.trips.find(t => t.id === state.currentTripId);
  const updatedDays = structuredClone(trip.days);
  let dayData = updatedDays.find(d => d.date === date);
  if (!dayData) { dayData = { date, activities: [] }; updatedDays.push(dayData); }

  if (state.editingActivityId) {
    const act = dayData.activities.find(a => a.id === state.editingActivityId);
    if (act) { act.time = time; act.category = category; act.title = title; act.notes = notes; act.details = details; }
  } else {
    dayData.activities.push({ id: uid(), time, category, title, notes, details });
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
  if (dayData) dayData.activities = dayData.activities.filter(a => a.id !== actId);
  try {
    await db.collection('trips').doc(tripId).update({ days: updatedDays });
  } catch (err) {
    console.error(err);
    showToast('삭제에 실패했습니다.');
  }
}

export async function deleteTrip(tripId) {
  try {
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
  state.currentTripId = null;
  document.getElementById('nav-breadcrumb').textContent = '';
  document.getElementById('nav-back').style.display = 'none';
  document.getElementById('view-trip').classList.remove('active');
  document.getElementById('view-list').classList.add('active');
}
