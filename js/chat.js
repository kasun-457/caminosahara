// ══════════════════════════════════════════════════════════════════════════════
//  참여자 간 채팅 (trips/{tripId}/messages 서브컬렉션)
//  사이드 패널 형태로 우측에서 슬라이드 인하며 화면을 분할한다.
// ══════════════════════════════════════════════════════════════════════════════
import { state } from './state.js';
import { db } from './firebase.js';
import { storage } from './firebase.js';
import { showToast, escapeHtml } from './utils.js';

const MSG_MAX_LEN = 1000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMG_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_FILE_TYPES = ['application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

let _pendingAttachments = []; // { file, type }

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

    // 텍스트 부분
    const textBubble = msg.text
      ? `<div class="chat-msg-bubble">${escapeHtml(msg.text)}</div>`
      : '';

    // 첨부파일 부분
    const attachmentsHtml = (msg.attachments || []).map(att => {
      if (att.type === 'image') {
        return `<div class="chat-attachment-img"><img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name)}" loading="lazy"></div>`;
      } else {
        return `<div class="chat-attachment-file"><a href="${escapeHtml(att.url)}" target="_blank" rel="noopener">📄 ${escapeHtml(att.name)}</a></div>`;
      }
    }).join('');

    return `
      ${dayDivider}
      <div class="chat-msg ${isMine ? 'chat-msg-mine' : 'chat-msg-other'}">
        ${header}
        <div class="chat-msg-row">
          <div class="chat-msg-content">
            ${textBubble}
            ${attachmentsHtml}
          </div>
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

  // Allow sending either text or attachments (or both)
  if (!text && _pendingAttachments.length === 0) return;

  if (text && text.length > MSG_MAX_LEN) {
    showToast(`메시지는 ${MSG_MAX_LEN}자 이하로 작성해주세요.`);
    return;
  }

  const tripId = state.currentTripId;
  const uid    = state.currentUser?.uid;
  if (!tripId || !uid) return;

  const btn = document.getElementById('btn-chat-send');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '전송 중...';

  try {
    // Upload pending attachments to Firebase Storage
    const attachments = [];
    for (const { file, type } of _pendingAttachments) {
      const path = `trips/${tripId}/chat/${Date.now()}-${file.name}`;
      const ref = storage.ref(path);
      await ref.put(file);
      const url = await ref.getDownloadURL();
      attachments.push({
        name: file.name,
        url,
        type
      });
    }

    // Send message with text and/or attachments
    await db.collection('trips').doc(tripId).collection('messages').add({
      text,
      senderUid: uid,
      attachments,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    input.value = '';
    autoResizeInput();
    _pendingAttachments = [];

    // Clear attachments preview
    const preview = document.getElementById('chat-attachments-preview');
    if (preview) preview.style.display = 'none';
    document.getElementById('chat-attachments-list').innerHTML = '';
  } catch (err) {
    console.error(err);
    showToast('전송에 실패했습니다.');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function autoResizeInput() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
}

function onFileSelected(files) {
  if (!files || files.length === 0) return;

  for (const file of files) {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      showToast(`파일 크기가 너무 큽니다. (최대 ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
      continue;
    }

    let type = null;
    if (ALLOWED_IMG_TYPES.includes(file.type)) {
      type = 'image';
    } else if (ALLOWED_FILE_TYPES.includes(file.type)) {
      type = 'file';
    } else {
      showToast(`지원하지 않는 파일 형식입니다: ${file.type}`);
      continue;
    }

    _pendingAttachments.push({ file, type });

    // Add to preview list
    const list = document.getElementById('chat-attachments-list');
    const preview = document.getElementById('chat-attachments-preview');

    const item = document.createElement('div');
    item.className = 'chat-attachment-item';
    const index = _pendingAttachments.length - 1;

    if (type === 'image') {
      const reader = new FileReader();
      reader.onload = e => {
        item.innerHTML = `
          <div class="chat-attachment-preview">
            <img src="${e.target.result}" alt="${escapeHtml(file.name)}" style="max-width:100px; max-height:100px;">
            <button type="button" class="chat-attachment-remove" data-index="${index}">✕</button>
          </div>
        `;
        item.querySelector('.chat-attachment-remove')?.addEventListener('click', e => {
          e.preventDefault();
          _pendingAttachments.splice(index, 1);
          item.remove();
          if (_pendingAttachments.length === 0) {
            preview.style.display = 'none';
          }
        });
      };
      reader.readAsDataURL(file);
    } else {
      item.innerHTML = `
        <div class="chat-attachment-file-item">
          <span>📄 ${escapeHtml(file.name)}</span>
          <button type="button" class="chat-attachment-remove" data-index="${index}">✕</button>
        </div>
      `;
      item.querySelector('.chat-attachment-remove')?.addEventListener('click', e => {
        e.preventDefault();
        _pendingAttachments.splice(index, 1);
        item.remove();
        if (_pendingAttachments.length === 0) {
          preview.style.display = 'none';
        }
      });
    }

    list.appendChild(item);
    preview.style.display = 'block';
  }

  // Reset file input
  document.getElementById('chat-file-input').value = '';
}

// ── 이벤트 초기화 ──────────────────────────────────────────────────────────
export function initChatPanel() {
  document.getElementById('btn-chat-fab')?.addEventListener('click', toggleChatPanel);
  document.getElementById('btn-chat-close')?.addEventListener('click', closeChatPanel);
  document.getElementById('btn-chat-send')?.addEventListener('click', sendMessage);

  // File attachment
  document.getElementById('btn-chat-attach')?.addEventListener('click', () => {
    document.getElementById('chat-file-input')?.click();
  });
  document.getElementById('chat-file-input')?.addEventListener('change', e => {
    onFileSelected(e.target.files);
  });

  const input = document.getElementById('chat-input');
  input?.addEventListener('input', autoResizeInput);
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });
}
