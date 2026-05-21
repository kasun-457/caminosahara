// ══════════════════════════════════════════════════════════════════════════════
//  참여자 간 채팅 (trips/{tripId}/messages 서브컬렉션)
//  사이드 패널 형태로 우측에서 슬라이드 인하며 화면을 분할한다.
// ══════════════════════════════════════════════════════════════════════════════
import { state } from './state.js';
import { db } from './firebase.js';
import { showToast, escapeHtml } from './utils.js';

const MSG_MAX_LEN = 1000;

// ── 채팅 패널 열기/닫기/토글 ────────────────────────────────────────────────
export function openChatPanel() {
  const tripId = state.currentTripId;
  const trip   = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  if (!trip.memberIds?.includes(state.currentUser?.uid)) return;

  document.getElementById('chat-trip-title').textContent = trip.title;

  const panel = document.getElementById('chat-panel');
  const fab   = document.getElementById('btn-chat-fab');
  panel.classList.add('active');
  panel.setAttribute('aria-hidden', 'false');
  fab.classList.add('chat-fab-open');
  document.body.classList.add('chat-open');

  subscribeToChat(tripId);
  setTimeout(() => document.getElementById('chat-input')?.focus(), 200);
}

export function closeChatPanel() {
  const panel = document.getElementById('chat-panel');
  const fab   = document.getElementById('btn-chat-fab');
  panel?.classList.remove('active');
  panel?.setAttribute('aria-hidden', 'true');
  fab?.classList.remove('chat-fab-open');
  document.body.classList.remove('chat-open');
  unsubscribeFromChat();
}

export function toggleChatPanel() {
  const panel = document.getElementById('chat-panel');
  if (panel?.classList.contains('active')) closeChatPanel();
  else openChatPanel();
}

export function isChatPanelOpen() {
  return document.getElementById('chat-panel')?.classList.contains('active');
}

// ── Firestore 구독 ─────────────────────────────────────────────────────────
function subscribeToChat(tripId) {
  unsubscribeFromChat();
  state.chatMessages = [];

  state.unsubscribeChat = db.collection('trips').doc(tripId).collection('messages')
    .orderBy('createdAt', 'asc')
    .limitToLast(200)
    .onSnapshot(snap => {
      state.chatMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderChatMessages();
    }, err => {
      console.error('채팅 구독 오류:', err);
      showToast('채팅을 불러오지 못했습니다.');
    });
}

function unsubscribeFromChat() {
  if (state.unsubscribeChat) {
    state.unsubscribeChat();
    state.unsubscribeChat = null;
  }
}

// ── 메시지 렌더링 ──────────────────────────────────────────────────────────
function renderChatMessages() {
  const list = document.getElementById('chat-messages');
  if (!list) return;

  const me   = state.currentUser?.uid;
  const trip = state.trips.find(t => t.id === state.currentTripId);
  const profiles = trip?.memberProfiles || {};

  if (state.chatMessages.length === 0) {
    list.innerHTML = `<div class="chat-empty">아직 메시지가 없어요.<br>첫 메시지를 보내보세요!</div>`;
    return;
  }

  let prevSender = null;
  let prevDay    = null;

  list.innerHTML = state.chatMessages.map(msg => {
    const senderUid  = msg.senderUid;
    const isMine     = senderUid === me;
    const profile    = profiles[senderUid] || {};
    const displayName = escapeHtml(profile.nickname || profile.name || profile.email || (senderUid?.slice(0, 8) + '…'));
    const ts         = msg.createdAt?.toDate ? msg.createdAt.toDate() : null;
    const dayKey     = ts ? ts.toDateString() : '';
    const timeLabel  = ts ? ts.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';

    let dayDivider = '';
    if (ts && dayKey !== prevDay) {
      dayDivider = `<div class="chat-day-divider">${ts.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</div>`;
      prevDay = dayKey;
      prevSender = null;
    }

    const showHeader = senderUid !== prevSender;
    prevSender = senderUid;

    const header = showHeader && !isMine
      ? `<div class="chat-msg-sender">${displayName}</div>`
      : '';

    return `
      ${dayDivider}
      <div class="chat-msg ${isMine ? 'chat-msg-mine' : 'chat-msg-other'}">
        ${header}
        <div class="chat-msg-row">
          <div class="chat-msg-bubble">${escapeHtml(msg.text || '')}</div>
          <span class="chat-msg-time">${timeLabel}</span>
        </div>
      </div>`;
  }).join('');

  list.scrollTop = list.scrollHeight;
}

// ── 메시지 전송 ────────────────────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  if (text.length > MSG_MAX_LEN) {
    showToast(`메시지는 ${MSG_MAX_LEN}자 이하로 작성해주세요.`);
    return;
  }
  const tripId = state.currentTripId;
  const uid    = state.currentUser?.uid;
  if (!tripId || !uid) return;

  input.value = '';
  autoResizeInput();

  try {
    await db.collection('trips').doc(tripId).collection('messages').add({
      text,
      senderUid: uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(err);
    showToast('메시지 전송에 실패했습니다.');
    input.value = text;
  }
}

function autoResizeInput() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
}

// ── 이벤트 초기화 ──────────────────────────────────────────────────────────
export function initChatPanel() {
  document.getElementById('btn-chat-fab')?.addEventListener('click', toggleChatPanel);
  document.getElementById('btn-chat-close')?.addEventListener('click', closeChatPanel);
  document.getElementById('btn-chat-send')?.addEventListener('click', sendMessage);

  const input = document.getElementById('chat-input');
  input?.addEventListener('input', autoResizeInput);
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });
}
