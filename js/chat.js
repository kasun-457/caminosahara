// ══════════════════════════════════════════════════════════════════════════════
//  참여자 간 채팅 (trips/{tripId}/messages 서브컬렉션)
//  사이드 패널 형태로 우측에서 슬라이드 인하며 화면을 분할한다.
// ══════════════════════════════════════════════════════════════════════════════
import { state } from './state.js';
import { db, storage } from './firebase.js';
import { showToast, escapeHtml } from './utils.js';
import { openTrip } from './trips.js';

const MSG_MAX_LEN = 1000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMG_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_FILE_TYPES = ['application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

let _pendingAttachments = []; // { file, type }
let _editingMessageId = null; // 현재 편집 중인 메시지 ID
let _markReadTimer = null;    // 읽음 처리 디바운스용

// ── 읽음 상태: 현재 사용자의 lastReadAt 을 trip.readState.{uid} 에 기록 ──
async function markChatRead() {
  const tripId = state.currentTripId;
  const uid    = state.currentUser?.uid;
  if (!tripId || !uid) return;
  if (!isChatPanelOpen()) return;
  try {
    await db.collection('trips').doc(tripId).set({
      readState: { [uid]: firebase.firestore.FieldValue.serverTimestamp() },
    }, { merge: true });
  } catch (err) {
    console.warn('읽음 상태 갱신 실패:', err);
  }
}

function scheduleMarkRead() {
  clearTimeout(_markReadTimer);
  _markReadTimer = setTimeout(markChatRead, 400);
}

// 메시지 1건의 안 읽은 인원 수 (보낸 사람 제외)
// 채팅창이 열려있는 동안 나(현재 사용자)는 항상 읽음으로 간주하여
// readState 디바운스(400ms)로 인한 깜빡임을 방지한다.
function unreadCountFor(msg, trip) {
  if (!trip || !msg.createdAt?.toMillis) return 0;
  const msgMs = msg.createdAt.toMillis();
  const readState = trip.readState || {};
  const members = trip.memberIds || [];
  const myUid = state.currentUser?.uid;
  const panelOpen = isChatPanelOpen();
  let unread = 0;
  for (const uid of members) {
    if (uid === msg.senderUid) continue;     // 보낸 사람 제외
    if (panelOpen && uid === myUid) continue; // 채팅을 보고 있는 나는 즉시 읽음 처리
    const ts = readState[uid];
    const readMs = ts?.toMillis ? ts.toMillis() : 0;
    if (readMs < msgMs) unread++;
  }
  return unread;
}

// ── 채팅 패널 열기/닫기/토글 ────────────────────────────────────────────────
function openChatPanel() {
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
  scheduleMarkRead(); // 열자마자 읽음 처리
  renderNotice();
  setTimeout(() => document.getElementById('chat-input')?.focus(), 200);
}

export function closeChatPanel() {
  closeImageViewer();
  const panel = document.getElementById('chat-panel');
  const fab   = document.getElementById('btn-chat-fab');
  panel?.classList.remove('active');
  panel?.setAttribute('aria-hidden', 'true');
  fab?.classList.remove('chat-fab-open');
  document.body.classList.remove('chat-open');
  unsubscribeFromChat();
}

function toggleChatPanel() {
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
      // 새 메시지가 도착했고 패널이 열려있으면 자동으로 읽음 처리
      scheduleMarkRead();
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
  const totalMembers = (trip?.memberIds || []).length;

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
    const isPending  = !msg.createdAt;
    const timeLabel  = isPending
      ? '<span class="chat-msg-pending">전송중…</span>'
      : (ts ? ts.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '');

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

    // 첨부파일 부분 — 이미지에는 msg-id + 인덱스를 달아 뷰어가 메시지 내 이미지를 순환할 수 있게 함
    let imgIdx = 0;
    const attachmentsHtml = (msg.attachments || []).map(att => {
      if (att.type === 'image') {
        const idx = imgIdx++;
        return `<div class="chat-attachment-img"><img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name)}" loading="lazy" data-img-msg-id="${msg.id}" data-img-idx="${idx}"></div>`;
      } else {
        return `<div class="chat-attachment-file"><a href="${escapeHtml(att.url)}" target="_blank" rel="noopener">📄 ${escapeHtml(att.name)}</a></div>`;
      }
    }).join('');

    // 안 읽은 인원 수 (보낸 사람 제외). 2인 이상 방에서만 표시.
    const unread = totalMembers > 1 ? unreadCountFor(msg, trip) : 0;
    const unreadBadge = unread > 0
      ? `<span class="chat-msg-unread" title="안 읽은 인원">${unread}</span>`
      : '';

    return `
      ${dayDivider}
      <div class="chat-msg ${isMine ? 'chat-msg-mine' : 'chat-msg-other'}" data-msg-id="${msg.id}">
        ${header}
        <div class="chat-msg-row">
          <div class="chat-msg-content">
            ${textBubble}
            ${attachmentsHtml}
          </div>
          <div class="chat-msg-meta">
            ${unreadBadge}
            <span class="chat-msg-time">${timeLabel}</span>
          </div>
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

    // trip.lastMessage 갱신 — 다른 클라이언트가 새 메시지 도착을 감지해 알림 띄움
    const previewText = text || (attachments.length ? `📎 첨부 ${attachments.length}개` : '');
    db.collection('trips').doc(tripId).set({
      lastMessage: {
        text: previewText.slice(0, 100),
        senderUid: uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
    }, { merge: true }).catch(err => console.warn('lastMessage 갱신 실패:', err));

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

// 편집 모드 내부 버튼 클릭 (저장/취소) + 이미지 뷰어 열기
function handleMessagesClick(e) {
  // 이미지 클릭 → 뷰어 열기
  const img = e.target.closest('img[data-img-msg-id]');
  if (img) {
    e.preventDefault();
    openImageViewer(img.dataset.imgMsgId, parseInt(img.dataset.imgIdx, 10) || 0);
    return;
  }

  const action = e.target.dataset?.action;
  if (!action) return;
  const msgEl = e.target.closest('.chat-msg');
  const msgId = msgEl?.dataset.msgId;
  if (!msgId) return;

  e.preventDefault();
  e.stopPropagation();

  if (action === 'edit-cancel') {
    _editingMessageId = null;
    renderChatMessages();
  } else if (action === 'edit-save') {
    saveEditedMessage(msgId);
  }
}

// ── 이미지 뷰어 ────────────────────────────────────────────────────────────
let _viewerState = null; // { images: [{url,name}], index }

function ensureImageViewer() {
  let v = document.getElementById('chat-img-viewer');
  if (v) return v;
  v = document.createElement('div');
  v.id = 'chat-img-viewer';
  v.className = 'chat-img-viewer';
  v.innerHTML = `
    <button type="button" class="civ-btn civ-close" aria-label="닫기">✕</button>
    <button type="button" class="civ-btn civ-prev" aria-label="이전">‹</button>
    <button type="button" class="civ-btn civ-next" aria-label="다음">›</button>
    <a class="civ-btn civ-download" target="_blank" rel="noopener" download aria-label="다운로드" title="새 탭에서 열기 / 다운로드">⤓</a>
    <div class="civ-stage"><img class="civ-img" alt=""></div>
    <div class="civ-caption"><span class="civ-name"></span><span class="civ-count"></span></div>
  `;
  document.body.appendChild(v);

  v.addEventListener('click', e => {
    if (e.target.classList.contains('civ-close') || e.target === v) closeImageViewer();
    else if (e.target.classList.contains('civ-prev')) navViewer(-1);
    else if (e.target.classList.contains('civ-next')) navViewer(1);
  });
  return v;
}

function openImageViewer(msgId, index) {
  const msg = state.chatMessages.find(m => m.id === msgId);
  if (!msg) return;
  const images = (msg.attachments || []).filter(a => a.type === 'image');
  if (images.length === 0) return;
  _viewerState = { images, index: Math.max(0, Math.min(index, images.length - 1)) };
  const v = ensureImageViewer();
  v.classList.add('active');
  document.body.classList.add('chat-img-viewer-open');
  renderViewer();
}

function renderViewer() {
  if (!_viewerState) return;
  const v = document.getElementById('chat-img-viewer');
  if (!v) return;
  const { images, index } = _viewerState;
  const cur = images[index];
  v.querySelector('.civ-img').src = cur.url;
  v.querySelector('.civ-img').alt = cur.name || '';
  v.querySelector('.civ-name').textContent = cur.name || '';
  v.querySelector('.civ-count').textContent = images.length > 1 ? ` (${index + 1} / ${images.length})` : '';
  v.querySelector('.civ-download').href = cur.url;
  v.querySelector('.civ-prev').style.display = images.length > 1 ? '' : 'none';
  v.querySelector('.civ-next').style.display = images.length > 1 ? '' : 'none';
}

function navViewer(delta) {
  if (!_viewerState) return;
  const n = _viewerState.images.length;
  _viewerState.index = (_viewerState.index + delta + n) % n;
  renderViewer();
}

function closeImageViewer() {
  const v = document.getElementById('chat-img-viewer');
  v?.classList.remove('active');
  document.body.classList.remove('chat-img-viewer-open');
  _viewerState = null;
}

function isImageViewerOpen() {
  return !!_viewerState;
}

// 우클릭 컨텍스트 메뉴
function handleMessagesContextMenu(e) {
  const msgEl = e.target.closest('.chat-msg');
  if (!msgEl) return;
  if (_editingMessageId === msgEl.dataset.msgId) return;  // 편집 중엔 무시

  e.preventDefault();
  const msgId = msgEl.dataset.msgId;
  const msg = state.chatMessages.find(m => m.id === msgId);
  if (!msg) return;

  const isMine = msgEl.classList.contains('chat-msg-mine');
  const trip   = state.trips.find(t => t.id === state.currentTripId);
  const isPinned = trip?.notice?.messageId === msgId;
  showContextMenu(e.clientX, e.clientY, msgId, !!msg.text, isMine, isPinned);
}

function showContextMenu(x, y, msgId, hasText, isMine, isPinned) {
  closeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'chat-context-menu';
  menu.dataset.msgId = msgId;
  // 공지: 텍스트가 있는 메시지에 한해 등록 가능. 본인/타인 모두 가능.
  const pinBtn = hasText
    ? (isPinned
        ? '<button type="button" data-action="unpin">📌 공지 해제</button>'
        : '<button type="button" data-action="pin">📌 공지로 등록</button>')
    : '';
  menu.innerHTML = `
    ${pinBtn}
    ${isMine && hasText ? '<button type="button" data-action="edit">✏️ 수정</button>' : ''}
    ${isMine ? '<button type="button" data-action="delete">🗑️ 삭제</button>' : ''}
  `;
  if (!menu.innerHTML.trim()) return; // 표시할 항목이 없으면 메뉴 안 띄움

  // 일단 화면 밖에 두고 크기 측정 후 위치 조정 (뷰포트 넘침 방지)
  menu.style.left = '0px';
  menu.style.top = '0px';
  menu.style.visibility = 'hidden';
  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - 8;
  const maxY = window.innerHeight - rect.height - 8;
  menu.style.left = Math.min(x, maxX) + 'px';
  menu.style.top  = Math.min(y, maxY) + 'px';
  menu.style.visibility = 'visible';

  menu.addEventListener('click', e => {
    const action = e.target.dataset?.action;
    if (!action) return;
    closeContextMenu();

    if (action === 'edit') {
      _editingMessageId = msgId;
      renderChatMessages();
      setTimeout(() => {
        const ta = document.querySelector(`.chat-msg[data-msg-id="${msgId}"] .chat-msg-edit-input`);
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      }, 0);
    } else if (action === 'delete') {
      confirmDeleteMessage(msgId);
    } else if (action === 'pin') {
      pinNotice(msgId);
    } else if (action === 'unpin') {
      unpinNotice();
    }
  });
}

// ── 공지 (trip.notice) ────────────────────────────────────────────────────
async function pinNotice(msgId) {
  const tripId = state.currentTripId;
  const uid    = state.currentUser?.uid;
  const msg    = state.chatMessages.find(m => m.id === msgId);
  if (!tripId || !uid || !msg || !msg.text) return;
  try {
    await db.collection('trips').doc(tripId).set({
      notice: {
        messageId: msgId,
        text: msg.text,
        senderUid: msg.senderUid,
        pinnedBy: uid,
        pinnedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
    }, { merge: true });
  } catch (err) {
    console.error(err);
    showToast('공지 등록에 실패했습니다.');
  }
}

async function unpinNotice() {
  const tripId = state.currentTripId;
  if (!tripId) return;
  try {
    await db.collection('trips').doc(tripId).update({
      notice: firebase.firestore.FieldValue.delete(),
    });
  } catch (err) {
    console.error(err);
    showToast('공지 해제에 실패했습니다.');
  }
}

// 접기 상태는 localStorage 에 trip+notice 단위로 저장
function noticeCollapseKey(tripId, noticeMsgId) {
  return `chat-notice-collapsed:${tripId}:${noticeMsgId}`;
}

function renderNotice() {
  const wrap = document.getElementById('chat-notice');
  if (!wrap) return;
  const trip = state.trips.find(t => t.id === state.currentTripId);
  const notice = trip?.notice;
  if (!notice || !notice.text) {
    wrap.style.display = 'none';
    return;
  }
  const profiles = trip?.memberProfiles || {};
  const sender = profiles[notice.senderUid] || {};
  const senderName = sender.nickname || sender.name || sender.email || '익명';

  document.getElementById('chat-notice-sender').textContent = senderName;
  document.getElementById('chat-notice-body').textContent = notice.text;

  const collapsed = localStorage.getItem(noticeCollapseKey(trip.id, notice.messageId)) === '1';
  wrap.classList.toggle('collapsed', collapsed);
  document.getElementById('chat-notice-toggle').textContent = collapsed ? '▸' : '▾';

  wrap.style.display = '';
}

function toggleNoticeCollapsed() {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (!trip?.notice) return;
  const key = noticeCollapseKey(trip.id, trip.notice.messageId);
  const now = localStorage.getItem(key) === '1';
  localStorage.setItem(key, now ? '0' : '1');
  renderNotice();
}

function closeContextMenu() {
  document.querySelectorAll('.chat-context-menu').forEach(m => m.remove());
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

  // 메시지 영역 이벤트
  const messagesEl = document.getElementById('chat-messages');
  messagesEl?.addEventListener('click', handleMessagesClick);
  messagesEl?.addEventListener('contextmenu', handleMessagesContextMenu);

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

  // 컨텍스트 메뉴 외부 클릭 / 스크롤 / ESC 시 닫기
  document.addEventListener('click', e => {
    if (!e.target.closest('.chat-context-menu')) closeContextMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeContextMenu();
  });
  messagesEl?.addEventListener('scroll', closeContextMenu);

  // 스크롤 중에만 스크롤바 표시 (1초 동안 추가 스크롤 없으면 숨김)
  let _scrollHideTimer = null;
  messagesEl?.addEventListener('scroll', () => {
    messagesEl.classList.add('scrolling');
    clearTimeout(_scrollHideTimer);
    _scrollHideTimer = setTimeout(() => {
      messagesEl.classList.remove('scrolling');
    }, 1000);
  }, { passive: true });

  // 다른 멤버가 채팅을 읽거나 공지를 등록/해제하면 trip 문서가 갱신됨 → 재렌더
  document.addEventListener('trips-updated', () => {
    if (isChatPanelOpen()) {
      renderChatMessages();
      renderNotice();
    }
  });

  // 공지 버튼
  document.getElementById('chat-notice-toggle')?.addEventListener('click', toggleNoticeCollapsed);
  document.getElementById('chat-notice-unpin')?.addEventListener('click', () => {
    if (confirm('공지를 해제할까요?')) unpinNotice();
  });

  // 이미지 뷰어 키보드 (ESC 닫기, ←/→ 이동) — capture로 다른 ESC 핸들러보다 먼저 처리
  document.addEventListener('keydown', e => {
    if (!isImageViewerOpen()) return;
    if (e.key === 'Escape')      { e.stopPropagation(); closeImageViewer(); }
    else if (e.key === 'ArrowLeft')  { navViewer(-1); }
    else if (e.key === 'ArrowRight') { navViewer(1); }
  }, true);

  // ── 드래그 & 드롭 파일 업로드 ─────────────────────────────────────
  const panel = document.getElementById('chat-panel');
  if (panel) {
    let dragCounter = 0;

    panel.addEventListener('dragenter', e => {
      // 파일 드래그인지 확인 (텍스트/링크 드래그는 무시)
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      dragCounter++;
      panel.classList.add('chat-drag-over');
    });

    panel.addEventListener('dragover', e => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    panel.addEventListener('dragleave', e => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        panel.classList.remove('chat-drag-over');
      }
    });

    panel.addEventListener('drop', e => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      dragCounter = 0;
      panel.classList.remove('chat-drag-over');
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        onFileSelected(files);
      }
    });
  }

  // ── 글로벌 새 채팅 알림 ──────────────────────────────────────────────────
  initChatNotifier();
}

// ══════════════════════════════════════════════════════════════════════════
//  글로벌 채팅 알림 (어느 화면에서도 동작)
// ══════════════════════════════════════════════════════════════════════════
const _lastSeenMs = {};   // tripId → 마지막으로 확인한 lastMessage.createdAt ms
let _notifierInitialized = false;
let _notifTimer = null;

function initChatNotifier() {
  if (_notifierInitialized) return;
  _notifierInitialized = true;

  // 알림 DOM 생성
  if (!document.getElementById('chat-notif-popup')) {
    const el = document.createElement('div');
    el.id = 'chat-notif-popup';
    el.className = 'chat-notif-popup';
    el.innerHTML = `
      <div class="chat-notif-trip"></div>
      <div class="chat-notif-row">
        <strong class="chat-notif-sender"></strong>
        <span class="chat-notif-text"></span>
      </div>
      <button type="button" class="chat-notif-close" aria-label="닫기">✕</button>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target.classList.contains('chat-notif-close')) {
        hideChatNotif();
        return;
      }
      const tripId = el.dataset.tripId;
      if (tripId) jumpToTripChat(tripId);
    });
  }

  document.addEventListener('trips-updated', onTripsUpdatedForNotifier);
}

function onTripsUpdatedForNotifier() {
  const me = state.currentUser?.uid;
  if (!me || !state.trips) return;

  for (const trip of state.trips) {
    const lm = trip.lastMessage;
    if (!lm?.createdAt?.toMillis) continue;
    const ms = lm.createdAt.toMillis();
    const prev = _lastSeenMs[trip.id];

    // 첫 관측 → 기준값만 저장 (과거 메시지로 알림 띄우지 않음)
    if (prev === undefined) {
      _lastSeenMs[trip.id] = ms;
      continue;
    }
    if (ms <= prev) continue;
    _lastSeenMs[trip.id] = ms;

    // 내가 보낸 메시지면 알림 X
    if (lm.senderUid === me) continue;
    // 이미 해당 trip의 채팅창을 보고 있으면 알림 X
    if (state.currentTripId === trip.id && isChatPanelOpen()) continue;

    showChatNotif(trip, lm);
  }
}

function showChatNotif(trip, lm) {
  const el = document.getElementById('chat-notif-popup');
  if (!el) return;
  const profiles = trip.memberProfiles || {};
  const sender = profiles[lm.senderUid] || {};
  const senderName = sender.nickname || sender.name || sender.email || '익명';

  el.dataset.tripId = trip.id;
  el.querySelector('.chat-notif-trip').textContent = trip.title || '여행';
  el.querySelector('.chat-notif-sender').textContent = senderName;
  el.querySelector('.chat-notif-text').textContent = lm.text || '';
  el.classList.add('active');

  clearTimeout(_notifTimer);
  _notifTimer = setTimeout(hideChatNotif, 5000);
}

function hideChatNotif() {
  const el = document.getElementById('chat-notif-popup');
  el?.classList.remove('active');
  clearTimeout(_notifTimer);
}

function jumpToTripChat(tripId) {
  hideChatNotif();
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;

  // 이미 같은 여행에 있는 경우 → 채팅만 열기
  if (state.currentTripId === tripId) {
    if (!isChatPanelOpen()) openChatPanel();
    return;
  }
  // 다른 여행 또는 홈 → 해당 여행으로 이동 후 채팅 열기
  openTrip(tripId);
  // openTrip 후 DOM이 안정되면 채팅 열기
  setTimeout(() => openChatPanel(), 50);
}
