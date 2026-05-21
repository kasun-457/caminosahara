// ══════════════════════════════════════════════════════════════════════════════
//  참여자 간 채팅 (trips/{tripId}/messages 서브컬렉션)
// ══════════════════════════════════════════════════════════════════════════════
import { state } from './state.js';
import { db } from './firebase.js';
import { openModal, closeModal, showToast, escapeHtml } from './utils.js';

const MSG_MAX_LEN = 1000;

// ── 모달 열기/닫기 ──────────────────────────────────────────────────────────
export function openChatModal(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;

  // 멤버 외에는 열지 못함
  if (!trip.memberIds?.includes(state.currentUser?.uid)) return;

  openModal('modal-chat');
  document.getElementById('chat-trip-title').textContent = trip.title;

  subscribeToChat(tripId);

  // 입력창 포커스
  setTimeout(() => document.getElementById('chat-input')?.focus(), 50);
}

export function closeChatModal() {
  unsubscribeFromChat();
  closeModal('modal-chat');
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
    list.innerHTML = `<div class="chat-empty">아직 메시지가 없어요. 첫 메시지를 보내보세요!</div>`;
    return;
  }

  // 같은 발신자의 연속 메시지는 헤더(이름·시간)를 한 번만 표시
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
      prevSender = null; // 날짜가 바뀌면 헤더 다시 표시
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

  // 가장 아래로 스크롤
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
    input.value = text; // 복원
  }
}

// ── 입력창 자동 크기 조절 ──────────────────────────────────────────────────
function autoResizeInput() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
}

// ── 이벤트 초기화 ──────────────────────────────────────────────────────────
export function initChatModal() {
  const sendBtn = document.getElementById('btn-chat-send');
  const input   = document.getElementById('chat-input');
  const overlay = document.getElementById('modal-chat');
  const closeBtn = overlay?.querySelector('[data-close="modal-chat"]');

  sendBtn?.addEventListener('click', sendMessage);

  input?.addEventListener('input', autoResizeInput);
  input?.addEventListener('keydown', e => {
    // Enter: 전송, Shift+Enter: 줄바꿈
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 모달이 X 또는 오버레이 클릭으로 닫힐 때 구독 해제
  closeBtn?.addEventListener('click', unsubscribeFromChat);
  overlay?.addEventListener('click', e => {
    if (e.target === overlay) unsubscribeFromChat();
  });
}
