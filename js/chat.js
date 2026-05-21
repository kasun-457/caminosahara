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
let _editingMessageId = null; // 현재 편집 중인 메시지 ID

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

    const isEditing = isMine && _editingMessageId === msg.id;
    const editedLabel = msg.editedAt ? ' <span class="chat-msg-edited">(수정됨)</span>' : '';

    // 편집 모드: textarea + 저장/취소 버튼
    if (isEditing) {
      return `
        ${dayDivider}
        <div class="chat-msg chat-msg-mine" data-msg-id="${msg.id}">
          <div class="chat-msg-edit-box">
            <textarea class="chat-msg-edit-input" maxlength="${MSG_MAX_LEN}">${escapeHtml(msg.text || '')}</textarea>
            <div class="chat-msg-edit-actions">
              <button type="button" class="btn-sm btn-outline" data-action="edit-cancel">취소</button>
              <button type="button" class="btn-sm btn-primary" data-action="edit-save">저장</button>
            </div>
          </div>
        </div>`;
    }

    // 텍스트 부분
    const textBubble = msg.text
      ? `<div class="chat-msg-bubble">${escapeHtml(msg.text)}${editedLabel}</div>`
      : '';

    // 첨부파일 부분
    const attachmentsHtml = (msg.attachments || []).map(att => {
      if (att.type === 'image') {
        return `<div class="chat-attachment-img"><img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name)}" loading="lazy"></div>`;
      } else {
        return `<div class="chat-attachment-file"><a href="${escapeHtml(att.url)}" target="_blank" rel="noopener">📄 ${escapeHtml(att.name)}</a></div>`;
      }
    }).join('');

    // 자기 메시지에만 액션 메뉴 버튼 표시
    const actionsBtn = isMine ? `
      <div class="chat-msg-actions">
        <button type="button" class="chat-msg-menu-btn" data-action="menu" aria-label="메뉴">⋯</button>
        <div class="chat-msg-menu" data-msg-id="${msg.id}">
          ${msg.text ? '<button type="button" data-action="edit">수정</button>' : ''}
          <button type="button" data-action="delete">삭제</button>
        </div>
      </div>` : '';

    return `
      ${dayDivider}
      <div class="chat-msg ${isMine ? 'chat-msg-mine' : 'chat-msg-other'}" data-msg-id="${msg.id}">
        ${header}
        <div class="chat-msg-row">
          ${actionsBtn}
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

// ── 메시지 수정/삭제 ───────────────────────────────────────────────────────
function handleMessagesClick(e) {
  const action = e.target.dataset?.action;
  if (!action) return;

  const msgEl = e.target.closest('.chat-msg');
  const msgId = msgEl?.dataset.msgId;
  if (!msgId) return;

  e.preventDefault();
  e.stopPropagation();

  if (action === 'menu') {
    // 다른 열린 메뉴들 닫기
    document.querySelectorAll('.chat-msg-menu.active').forEach(m => {
      if (m.dataset.msgId !== msgId) m.classList.remove('active');
    });
    const menu = msgEl.querySelector('.chat-msg-menu');
    menu?.classList.toggle('active');
  } else if (action === 'edit') {
    _editingMessageId = msgId;
    renderChatMessages();
    // 포커스 & 커서 끝으로
    setTimeout(() => {
      const ta = document.querySelector(`.chat-msg[data-msg-id="${msgId}"] .chat-msg-edit-input`);
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }, 0);
  } else if (action === 'edit-cancel') {
    _editingMessageId = null;
    renderChatMessages();
  } else if (action === 'edit-save') {
    saveEditedMessage(msgId);
  } else if (action === 'delete') {
    confirmDeleteMessage(msgId);
  }
}

async function saveEditedMessage(msgId) {
  const ta = document.querySelector(`.chat-msg[data-msg-id="${msgId}"] .chat-msg-edit-input`);
  if (!ta) return;
  const newText = ta.value.trim();
  if (!newText) {
    showToast('내용을 입력해주세요.');
    return;
  }
  if (newText.length > MSG_MAX_LEN) {
    showToast(`메시지는 ${MSG_MAX_LEN}자 이하로 작성해주세요.`);
    return;
  }
  const msg = state.chatMessages.find(m => m.id === msgId);
  if (msg && msg.text === newText) {
    _editingMessageId = null;
    renderChatMessages();
    return;
  }
  const tripId = state.currentTripId;
  try {
    await db.collection('trips').doc(tripId).collection('messages').doc(msgId).update({
      text: newText,
      editedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    _editingMessageId = null;
  } catch (err) {
    console.error(err);
    showToast('메시지 수정에 실패했습니다.');
  }
}

function confirmDeleteMessage(msgId) {
  const msg = state.chatMessages.find(m => m.id === msgId);
  if (!msg) return;
  if (!confirm('이 메시지를 삭제할까요?')) return;
  deleteMessage(msgId, msg.attachments || []);
}

async function deleteMessage(msgId, attachments) {
  const tripId = state.currentTripId;
  try {
    await db.collection('trips').doc(tripId).collection('messages').doc(msgId).delete();
    // Storage 첨부파일도 삭제 (실패해도 메시지는 이미 삭제됨)
    for (const att of attachments) {
      try {
        const ref = storage.refFromURL(att.url);
        await ref.delete();
      } catch (err) {
        console.warn('첨부파일 삭제 실패:', err);
      }
    }
  } catch (err) {
    console.error(err);
    showToast('메시지 삭제에 실패했습니다.');
  }
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

  // 메시지 영역 클릭 이벤트 위임 (메뉴/수정/삭제)
  const messagesEl = document.getElementById('chat-messages');
  messagesEl?.addEventListener('click', handleMessagesClick);

  // 편집 textarea 키보드 핸들러 (Enter=저장, Esc=취소)
  messagesEl?.addEventListener('keydown', e => {
    if (!e.target.classList?.contains('chat-msg-edit-input')) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const msgId = e.target.closest('.chat-msg')?.dataset.msgId;
      if (msgId) saveEditedMessage(msgId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      _editingMessageId = null;
      renderChatMessages();
    }
  });

  // 다른 곳 클릭 시 열린 메뉴 닫기
  document.addEventListener('click', e => {
    if (!e.target.closest('.chat-msg-actions')) {
      document.querySelectorAll('.chat-msg-menu.active').forEach(m => m.classList.remove('active'));
    }
  });
}
