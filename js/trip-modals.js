// ══════════════════════════════════════════════════════════════════════════════
//  여행 관련 모달 UI 모음
//  - 여행 추가/수정 모달 (+ 통화 선택)
//  - 참여자 모달 (역할/추방/위임/편집 요청)
//  - 설정 모달 (닉네임/수정/삭제/나가기)
//  - 초대 설정 모달 (공개/사설 + 암호)
//  - 방 입장 모달 (암호/닉네임)
//  - 닉네임 단독 수정 모달
// ══════════════════════════════════════════════════════════════════════════════
import { state } from './state.js';
import { db } from './firebase.js';
import { showToast, generateShareCode, openModal, closeModal, sha256Hex, escapeHtml } from './utils.js';
import { confirmAction, deleteTrip } from './activities.js';
import { isOwner, getRole, memberDisplayName, leaveTrip } from './trips.js';
import { DEFAULT_CURRENCY, getCurrency, filterCurrencies, currencyShortLabel } from './currencies.js';

// ── 여행 모달의 통화 선택 상태 ────────────────────────────────────────────────
let _selectedCurrencies = [];
let _currencyDropdownIdx = -1;

// ══════════════════════════════════════════════════════════════════════════════
//  여행 추가/수정 모달
// ══════════════════════════════════════════════════════════════════════════════
export function openTripModal(tripId = null) {
  state.editingTripId = tripId;
  clearTripErrors();

  const tabs    = document.getElementById('trip-modal-tabs');
  const form    = document.getElementById('form-trip');
  const panel   = document.getElementById('trip-join-panel');

  if (tripId) {
    const trip = state.trips.find(t => t.id === tripId);
    document.getElementById('modal-trip-heading').textContent = '여행 수정';
    document.getElementById('trip-name').value = trip.title;
    document.getElementById('trip-destination').value = trip.destination;
    document.getElementById('trip-start').value = trip.startDate;
    document.getElementById('trip-end').value = trip.endDate;
    state.selectedColor = trip.color;
    _selectedCurrencies = Array.isArray(trip.currencies) && trip.currencies.length
      ? [...trip.currencies] : [];
    // 수정 모드: 탭 숨기고 새 여행 폼만 표시
    tabs.style.display = 'none';
    form.style.display = '';
    panel.classList.add('hidden');
  } else {
    document.getElementById('modal-trip-heading').textContent = '새 여행 추가';
    document.getElementById('form-trip').reset();
    state.selectedColor = '#c8f060';
    _selectedCurrencies = [];
    // 추가 모드: 탭 표시, 새 여행 탭으로 초기화
    tabs.style.display = '';
    setTripModalTab('new');
  }
  renderCurrencyChips();
  renderCurrencyDropdown('');

  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === state.selectedColor);
  });

  openModal('modal-trip');
  if (!tripId) document.getElementById('trip-name').focus();
}

function setTripModalTab(tab) {
  const form  = document.getElementById('form-trip');
  const panel = document.getElementById('trip-join-panel');
  document.querySelectorAll('.trip-modal-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tripTab === tab)
  );
  if (tab === 'new') {
    form.style.display = '';
    panel.classList.add('hidden');
    document.getElementById('trip-name').focus();
  } else {
    form.style.display = 'none';
    panel.classList.remove('hidden');
    document.getElementById('join-link-input').value = '';
    document.getElementById('err-join-link').textContent = '';
    document.getElementById('join-link-input').focus();
  }
}

export function initTripModalTabs() {
  document.querySelectorAll('.trip-modal-tab').forEach(tab => {
    tab.addEventListener('click', () => setTripModalTab(tab.dataset.tripTab));
  });

  document.getElementById('btn-join-trip').addEventListener('click', submitJoinTrip);
}

async function submitJoinTrip() {
  const input   = document.getElementById('join-link-input');
  const errEl   = document.getElementById('err-join-link');
  const raw     = input.value.trim();
  errEl.textContent = '';

  if (!raw) {
    errEl.textContent = '초대 링크를 붙여넣어 주세요';
    input.focus();
    return;
  }

  let tripId, joinCode;
  try {
    const url    = new URL(raw);
    tripId   = url.searchParams.get('tripId');
    joinCode = url.searchParams.get('join');
  } catch {
    // URL 파싱 실패
  }

  if (!tripId || !joinCode) {
    errEl.textContent = '올바른 초대 링크가 아닙니다';
    input.focus();
    return;
  }

  const btn = document.getElementById('btn-join-trip');
  btn.disabled = true;
  btn.textContent = '처리 중…';

  try {
    await beginJoinFlow(tripId, joinCode);
  } catch (err) {
    console.error(err);
    errEl.textContent = '참여 처리 중 오류가 발생했습니다';
  } finally {
    btn.disabled = false;
    btn.textContent = '참여하기';
  }
}

function clearTripErrors() {
  ['err-trip-name', 'err-trip-dest', 'err-trip-start', 'err-trip-end'].forEach(id => {
    document.getElementById(id).textContent = '';
  });
  ['trip-name', 'trip-destination', 'trip-start', 'trip-end'].forEach(id => {
    document.getElementById(id).classList.remove('invalid');
  });
}

function showFieldError(inputId, errId, msg) {
  document.getElementById(inputId).classList.add('invalid');
  document.getElementById(errId).textContent = msg;
}

export async function saveTripForm(e) {
  e.preventDefault();
  clearTripErrors();

  const name  = document.getElementById('trip-name').value.trim();
  const dest  = document.getElementById('trip-destination').value.trim();
  const start = document.getElementById('trip-start').value;
  const end   = document.getElementById('trip-end').value;

  let valid = true;
  if (!name)  { showFieldError('trip-name', 'err-trip-name', '여행 이름을 입력해주세요'); valid = false; }
  if (!dest)  { showFieldError('trip-destination', 'err-trip-dest', '목적지를 입력해주세요'); valid = false; }
  if (!start) { showFieldError('trip-start', 'err-trip-start', '출발일을 선택해주세요'); valid = false; }
  if (!end)   { showFieldError('trip-end', 'err-trip-end', '도착일을 선택해주세요'); valid = false; }
  if (start && end && end < start) {
    showFieldError('trip-end', 'err-trip-end', '도착일은 출발일 이후여야 해요'); valid = false;
  }
  if (!valid) return;

  const currencies = _selectedCurrencies.length ? [..._selectedCurrencies] : [DEFAULT_CURRENCY];

  try {
    if (state.editingTripId) {
      await db.collection('trips').doc(state.editingTripId).update({
        title: name, destination: dest, startDate: start, endDate: end, color: state.selectedColor,
        currencies,
      });
    } else {
      const u = state.currentUser;
      await db.collection('trips').add({
        title: name, destination: dest, startDate: start, endDate: end, color: state.selectedColor,
        currencies,
        ownerId: u.uid,
        memberIds: [u.uid],
        memberProfiles: { [u.uid]: { name: u.displayName || '', email: u.email || '' } },
        shareCode: generateShareCode(),
        days: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    closeModal('modal-trip');
  } catch (err) {
    console.error(err);
    showToast('저장에 실패했습니다. 다시 시도해주세요.');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  통화 선택 UI (여행 모달 내부)
// ══════════════════════════════════════════════════════════════════════════════
function renderCurrencyChips() {
  const wrap = document.getElementById('trip-currency-chips');
  if (!wrap) return;
  if (_selectedCurrencies.length === 0) {
    wrap.innerHTML = `<span class="currency-chip-empty">선택된 통화 없음 · 기본 ₩ KRW</span>`;
    return;
  }
  wrap.innerHTML = _selectedCurrencies.map(code => {
    const label = currencyShortLabel(code);
    return `<span class="currency-chip" data-code="${code}">
      ${escapeHtml(label)}
      <button type="button" class="currency-chip-x" data-code="${code}" aria-label="제거">✕</button>
    </span>`;
  }).join('');
  wrap.querySelectorAll('.currency-chip-x').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedCurrencies = _selectedCurrencies.filter(c => c !== btn.dataset.code);
      renderCurrencyChips();
      renderCurrencyDropdown(document.getElementById('trip-currency-search')?.value || '');
    });
  });
}

function renderCurrencyDropdown(query) {
  const dd = document.getElementById('trip-currency-dropdown');
  if (!dd) return;
  const q = (query || '').trim();
  const results = filterCurrencies(q).slice(0, 60);
  _currencyDropdownIdx = -1;
  if (results.length === 0) {
    dd.innerHTML = `<div class="currency-opt currency-opt-empty">검색 결과 없음</div>`;
    return;
  }
  dd.innerHTML = results.map(c => {
    const picked = _selectedCurrencies.includes(c.code);
    return `<div class="currency-opt${picked ? ' picked' : ''}" data-code="${c.code}">
      <span class="currency-opt-sym">${escapeHtml(c.symbol)}</span>
      <span class="currency-opt-code">${c.code}</span>
      <span class="currency-opt-name">${escapeHtml(c.ko)}</span>
      ${picked ? '<span class="currency-opt-check">✓</span>' : ''}
    </div>`;
  }).join('');
  dd.querySelectorAll('.currency-opt[data-code]').forEach(el => {
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      toggleCurrency(el.dataset.code);
    });
  });
}

function toggleCurrency(code) {
  if (!getCurrency(code)) return;
  if (_selectedCurrencies.includes(code)) {
    _selectedCurrencies = _selectedCurrencies.filter(c => c !== code);
  } else {
    _selectedCurrencies.push(code);
  }
  renderCurrencyChips();
  renderCurrencyDropdown(document.getElementById('trip-currency-search')?.value || '');
}

export function initTripCurrencyPicker() {
  const search = document.getElementById('trip-currency-search');
  const dd     = document.getElementById('trip-currency-dropdown');
  const wrap   = document.getElementById('trip-currency-picker');
  if (!search || !dd || !wrap) return;

  search.addEventListener('focus', () => {
    renderCurrencyDropdown(search.value);
    dd.classList.add('open');
  });
  search.addEventListener('input', () => {
    renderCurrencyDropdown(search.value);
    dd.classList.add('open');
  });
  search.addEventListener('keydown', e => {
    const opts = [...dd.querySelectorAll('.currency-opt[data-code]')];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _currencyDropdownIdx = Math.min(_currencyDropdownIdx + 1, opts.length - 1);
      updateDropdownHighlight(opts);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _currencyDropdownIdx = Math.max(_currencyDropdownIdx - 1, 0);
      updateDropdownHighlight(opts);
    } else if (e.key === 'Enter') {
      if (_currencyDropdownIdx >= 0 && opts[_currencyDropdownIdx]) {
        e.preventDefault();
        toggleCurrency(opts[_currencyDropdownIdx].dataset.code);
      }
    } else if (e.key === 'Escape') {
      dd.classList.remove('open');
    } else if (e.key === 'Backspace' && !search.value && _selectedCurrencies.length) {
      _selectedCurrencies.pop();
      renderCurrencyChips();
      renderCurrencyDropdown('');
    }
  });
  document.addEventListener('mousedown', e => {
    if (!wrap.contains(e.target)) dd.classList.remove('open');
  });
}

function updateDropdownHighlight(opts) {
  opts.forEach((el, i) => el.classList.toggle('active', i === _currencyDropdownIdx));
  if (_currencyDropdownIdx >= 0 && opts[_currencyDropdownIdx]) {
    opts[_currencyDropdownIdx].scrollIntoView({ block: 'nearest' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  참여자 모달 내 초대 컨트롤
// ══════════════════════════════════════════════════════════════════════════════
export function initMembersInviteEvents() {
  // 방 공개/사설 라디오
  document.querySelectorAll('input[name="members-room-type"]').forEach(r => {
    r.addEventListener('change', () => {
      const trip = state.trips.find(t => t.id === state.currentTripId);
      const has  = !!trip?.roomPassword;
      _updateMembersInviteTypeUI(
        r.value, has,
        document.getElementById('members-invite-type-hint'),
        document.getElementById('members-invite-password-group'),
        document.getElementById('members-invite-password'),
      );
    });
  });

  // 링크 복사
  document.getElementById('btn-copy-members-invite-link').addEventListener('click', async () => {
    const url = document.getElementById('members-invite-link-output').value;
    try {
      await navigator.clipboard.writeText(url);
      showToast('초대 링크가 복사되었습니다!');
    } catch {
      prompt('아래 링크를 복사하세요:', url);
    }
  });

  // 방장: 초대 설정 저장
  document.getElementById('btn-save-members-invite').addEventListener('click', saveMembersInviteSettings);
}

async function saveMembersInviteSettings() {
  const tripId = state.currentTripId;
  if (!tripId) return;
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip || !isOwner(trip)) return;

  const type  = document.querySelector('input[name="members-room-type"]:checked')?.value || 'public';
  const pwIn  = document.getElementById('members-invite-password');
  const errEl = document.getElementById('err-members-invite-password');
  errEl.textContent = '';

  const update = { roomType: type };
  if (type === 'public') {
    update.roomPassword = '';
  } else {
    const raw = pwIn.value;
    const hasExisting = !!trip.roomPassword;
    if (!raw && !hasExisting) { errEl.textContent = '암호를 입력해주세요.'; pwIn.focus(); return; }
    if (raw) {
      if (raw.length < 4) { errEl.textContent = '암호는 4자 이상이어야 해요.'; pwIn.focus(); return; }
      update.roomPassword = await sha256Hex(raw);
    }
  }

  const btn = document.getElementById('btn-save-members-invite');
  btn.disabled = true;
  btn.textContent = '저장 중…';
  try {
    await db.collection('trips').doc(tripId).update(update);
    showToast(type === 'private' ? '사설 방으로 설정됐습니다.' : '공개 방으로 설정됐습니다.');
  } catch (err) {
    console.error(err);
    showToast('저장에 실패했습니다.');
  } finally {
    btn.disabled = false;
    btn.textContent = '설정 저장';
  }
}

function _updateMembersInviteTypeUI(type, alreadyHasPassword, hint, pwGroup, pwInput) {
  if (type === 'private') {
    hint.textContent = '초대 링크와 암호를 모두 알아야 참여할 수 있어요.';
    pwGroup.classList.remove('hidden');
    pwInput.placeholder = alreadyHasPassword ? '비워두면 기존 암호 유지' : '참여자가 입력할 암호 (4자 이상)';
  } else {
    hint.textContent = '초대 링크만 있으면 누구나 참여할 수 있어요.';
    pwGroup.classList.add('hidden');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  설정 모달 (닉네임 수정 / 수정·삭제 / 나가기)
// ══════════════════════════════════════════════════════════════════════════════
export function openSettingsModal(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  renderSettingsModal(trip);
  openModal('modal-settings');
}

function renderSettingsModal(trip) {
  const owner = isOwner(trip);
  const body  = document.getElementById('settings-body');

  body.innerHTML = `
    <!-- 닉네임 수정 -->
    <div class="settings-section">
      <div class="settings-section-title">닉네임 수정</div>
      <div class="settings-nickname-row">
        <input type="text" id="settings-nickname-input" class="settings-input"
               placeholder="방에서 사용할 닉네임" maxlength="20" autocomplete="off"
               value="${escapeHtml(trip.memberProfiles?.[state.currentUser?.uid]?.nickname || '')}">
        <button class="btn-primary btn-sm" id="btn-settings-save-nickname">저장</button>
      </div>
      <span class="field-error" id="err-settings-nickname"></span>
    </div>

    ${owner ? `
    <!-- 여행 수정 (방장) -->
    <div class="settings-section">
      <div class="settings-section-title">여행 관리</div>
      <div class="settings-action-list">
        <button class="settings-action-btn" id="btn-settings-edit-trip">
          <span>✏️ 여행 정보 수정</span>
          <span class="settings-action-chevron">›</span>
        </button>
        <button class="settings-action-btn settings-action-danger" id="btn-settings-delete-trip">
          <span>🗑 여행 삭제</span>
          <span class="settings-action-chevron">›</span>
        </button>
      </div>
    </div>` : `
    <!-- 여행 나가기 (참여자) -->
    <div class="settings-section">
      <button class="settings-action-btn settings-action-danger" id="btn-settings-leave-trip">
        <span>🚪 여행 나가기</span>
        <span class="settings-action-chevron">›</span>
      </button>
    </div>`}
  `;

  // 닉네임 저장
  document.getElementById('btn-settings-save-nickname').addEventListener('click', async () => {
    const input  = document.getElementById('settings-nickname-input');
    const errEl  = document.getElementById('err-settings-nickname');
    const nickname = input.value.trim();
    errEl.textContent = '';
    if (!nickname) { errEl.textContent = '닉네임을 입력해주세요.'; input.focus(); return; }
    const uid = state.currentUser?.uid;
    try {
      await db.collection('trips').doc(trip.id).update({
        [`memberProfiles.${uid}.nickname`]: nickname,
      });
      showToast('닉네임이 변경됐습니다.');
    } catch (err) {
      console.error(err);
      showToast('닉네임 변경에 실패했습니다.');
    }
  });

  if (owner) {
    document.getElementById('btn-settings-edit-trip').addEventListener('click', () => {
      closeModal('modal-settings');
      openTripModal(trip.id);
    });
    document.getElementById('btn-settings-delete-trip').addEventListener('click', () => {
      closeModal('modal-settings');
      confirmAction('이 여행을 삭제할까요? 모든 일정도 함께 삭제됩니다.', () => deleteTrip(trip.id));
    });
  } else {
    document.getElementById('btn-settings-leave-trip').addEventListener('click', () => {
      closeModal('modal-settings');
      leaveTrip(trip.id);
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  방 입장 모달 (암호 + 닉네임)
// ══════════════════════════════════════════════════════════════════════════════
export async function beginJoinFlow(tripId, joinCode) {
  try {
    const docSnap = await db.collection('trips').doc(tripId).get();
    if (!docSnap.exists) { showToast('유효하지 않은 여행입니다.'); return; }
    const trip = docSnap.data();
    if (trip.shareCode !== joinCode) { showToast('초대 코드가 올바르지 않습니다.'); return; }
    if (trip.memberIds.includes(state.currentUser.uid)) {
      showToast('이미 참여 중인 여행입니다.');
      closeModal('modal-trip');
      return;
    }

    state.pendingJoin = { tripId, joinCode, trip };
    const isPrivate = trip.roomType === 'private' && !!trip.roomPassword;

    document.getElementById('join-room-title-line').textContent = `"${trip.title}" 여행에 참여합니다.`;
    document.getElementById('join-password-input').value = '';
    document.getElementById('join-nickname-input').value =
      state.currentUser.displayName || (state.currentUser.email ? state.currentUser.email.split('@')[0] : '');
    document.getElementById('err-join-password').textContent = '';
    document.getElementById('err-join-nickname').textContent = '';
    document.getElementById('join-password-group').classList.toggle('hidden', !isPrivate);

    closeModal('modal-trip');
    openModal('modal-join-room');
    setTimeout(() => {
      (isPrivate
        ? document.getElementById('join-password-input')
        : document.getElementById('join-nickname-input')).focus();
    }, 50);
  } catch (err) {
    console.error(err);
    showToast('초대 처리 중 오류가 발생했습니다.');
  }
}

async function confirmJoinTrip() {
  const pj = state.pendingJoin;
  if (!pj) return;
  const errPw = document.getElementById('err-join-password');
  const errNk = document.getElementById('err-join-nickname');
  errPw.textContent = '';
  errNk.textContent = '';

  const nickname = document.getElementById('join-nickname-input').value.trim();
  if (!nickname) {
    errNk.textContent = '닉네임을 입력해주세요.';
    document.getElementById('join-nickname-input').focus();
    return;
  }

  const isPrivate = pj.trip.roomType === 'private' && !!pj.trip.roomPassword;
  if (isPrivate) {
    const raw = document.getElementById('join-password-input').value;
    if (!raw) {
      errPw.textContent = '암호를 입력해주세요.';
      document.getElementById('join-password-input').focus();
      return;
    }
    const hash = await sha256Hex(raw);
    if (hash !== pj.trip.roomPassword) {
      errPw.textContent = '암호가 올바르지 않아요.';
      document.getElementById('join-password-input').focus();
      return;
    }
  }

  const btn = document.getElementById('btn-confirm-join');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = '처리 중…';

  try {
    const u = state.currentUser;
    await db.collection('trips').doc(pj.tripId).update({
      memberIds: firebase.firestore.FieldValue.arrayUnion(u.uid),
      [`memberProfiles.${u.uid}`]: {
        name: u.displayName || '',
        email: u.email || '',
        nickname,
      },
      [`memberRoles.${u.uid}`]: 'viewer',
    });
    closeModal('modal-join-room');
    state.pendingJoin = null;
    showToast(`"${pj.trip.title}" 여행에 참여했습니다!`);
  } catch (err) {
    console.error(err);
    errPw.textContent = '참여 처리 중 오류가 발생했습니다.';
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

export function initJoinRoomModal() {
  document.getElementById('btn-confirm-join').addEventListener('click', confirmJoinTrip);
  document.getElementById('join-password-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmJoinTrip();
  });
  document.getElementById('join-nickname-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmJoinTrip();
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  참여자 모달 (관리자 + 일반 참여자)
// ══════════════════════════════════════════════════════════════════════════════
export function openMembersModal(tripId) {
  const trip = state.trips.find(t => t.id === tripId);
  if (!trip) return;
  renderMembersModal(trip);
  openModal('modal-members');
}

function renderMembersModal(trip) {
  const list    = document.getElementById('member-list');
  const me      = state.currentUser?.uid;
  const ownerId = trip.ownerId;
  const owner   = isOwner(trip);

  // 모달 헤더 텍스트 변경
  document.querySelector('#modal-members .modal-header h2').textContent =
    owner ? '참여자 관리' : '참여자 목록';

  // 소유자 먼저, 그 다음 나머지
  const ordered = [ownerId, ...trip.memberIds.filter(uid => uid !== ownerId)];

  list.innerHTML = ordered.map(uid => {
    const p        = trip.memberProfiles?.[uid] || {};
    const nickname = p.nickname || '';
    const name     = p.name || '';
    const email    = p.email || '';
    const display  = escapeHtml(nickname || name || email || uid.slice(0, 8) + '…');
    const sub      = nickname && (name || email)
      ? `<span class="member-sub">${escapeHtml(name || email)}</span>`
      : (email && !nickname ? `<span class="member-sub">${escapeHtml(email)}</span>` : '');

    if (uid === ownerId) {
      return `
      <div class="member-row member-row-owner">
        <div class="member-info">
          <span class="member-name">👑 ${display}${uid === me ? ' (나)' : ''}</span>
          ${sub}
        </div>
        <span class="member-badge member-badge-owner">관리자</span>
      </div>`;
    }

    const role = trip.memberRoles?.[uid] || 'viewer';

    if (owner) {
      // 방장: 권한 변경 / 위임 / 추방 컨트롤
      return `
        <div class="member-row" data-uid="${uid}">
          <div class="member-info">
            <span class="member-name">${display}${uid === me ? ' (나)' : ''}</span>
            ${sub}
          </div>
          <div class="member-controls">
            <select class="member-role-select" data-uid="${uid}">
              <option value="viewer"  ${role === 'viewer'  ? 'selected' : ''}>뷰어</option>
              <option value="editor"  ${role === 'editor'  ? 'selected' : ''}>편집자</option>
            </select>
            <button class="btn-outline btn-sm member-promote" data-uid="${uid}" title="관리자로 위임">👑 위임</button>
            <button class="btn-danger btn-sm member-kick" data-uid="${uid}" title="추방">추방</button>
          </div>
        </div>`;
    } else {
      // 일반 참여자: 읽기 전용
      const roleLabel = role === 'editor' ? '편집자' : '뷰어';
      const badgeCls  = role === 'editor' ? 'member-badge-editor' : 'member-badge-viewer';
      return `
        <div class="member-row" data-uid="${uid}">
          <div class="member-info">
            <span class="member-name">${display}${uid === me ? ' (나)' : ''}</span>
            ${sub}
          </div>
          <span class="member-badge ${badgeCls}">${roleLabel}</span>
        </div>`;
    }
  }).join('');

  if (owner) {
    list.querySelectorAll('.member-role-select').forEach(sel => {
      sel.addEventListener('change', () => setMemberRole(trip.id, sel.dataset.uid, sel.value));
    });
    list.querySelectorAll('.member-promote').forEach(btn => {
      btn.addEventListener('click', () => promptTransferOwner(trip.id, btn.dataset.uid));
    });
    list.querySelectorAll('.member-kick').forEach(btn => {
      btn.addEventListener('click', () => promptKickMember(trip.id, btn.dataset.uid));
    });
  }

  // ── 편집 권한 요청 섹션 ──────────────────────────────────────────────────
  const requestSection = document.getElementById('edit-request-section');
  const myRole = getRole(trip, me);

  if (owner) {
    // 방장: 대기 중인 요청 목록 표시
    const requests = trip.editRequests || {};
    const pendingUids = Object.keys(requests).filter(uid => requests[uid] === 'pending');
    if (pendingUids.length > 0) {
      requestSection.style.display = '';
      document.getElementById('edit-request-list').innerHTML = pendingUids.map(uid => {
        const p2      = trip.memberProfiles?.[uid] || {};
        const disp    = escapeHtml(p2.nickname || p2.name || p2.email || uid.slice(0, 8) + '…');
        return `
          <div class="edit-request-row" data-uid="${uid}">
            <span class="edit-request-name">${disp}</span>
            <button class="btn-primary btn-sm btn-accept-request" data-uid="${uid}">수락</button>
            <button class="btn-outline btn-sm btn-deny-request" data-uid="${uid}">거절</button>
          </div>`;
      }).join('');
      document.querySelectorAll('.btn-accept-request').forEach(btn => {
        btn.addEventListener('click', () => resolveEditRequest(trip.id, btn.dataset.uid, true));
      });
      document.querySelectorAll('.btn-deny-request').forEach(btn => {
        btn.addEventListener('click', () => resolveEditRequest(trip.id, btn.dataset.uid, false));
      });
    } else {
      requestSection.style.display = 'none';
    }
  } else if (myRole === 'viewer') {
    // 뷰어: 편집 권한 요청 버튼 표시
    requestSection.style.display = '';
    const myRequest = (trip.editRequests || {})[me];
    let requestHtml = '';
    if (myRequest === 'pending') {
      requestHtml = `<p class="edit-request-status">✅ 편집 권한 요청을 보냈습니다. 방장의 수락을 기다리는 중이에요.</p>`;
    } else if (myRequest === 'denied') {
      requestHtml = `<p class="edit-request-status edit-request-denied">❌ 요청이 거절됐습니다.</p>
        <button class="btn-outline btn-sm" id="btn-request-edit">편집 권한 다시 요청</button>`;
    } else {
      requestHtml = `<button class="btn-outline btn-sm" id="btn-request-edit">✏️ 편집 권한 요청</button>`;
    }
    document.getElementById('edit-request-list').innerHTML = requestHtml;
    document.getElementById('btn-request-edit')?.addEventListener('click', () => sendEditRequest(trip.id));
  } else {
    // 편집자 이상은 요청 섹션 숨김
    requestSection.style.display = 'none';
  }

  // ── 초대 링크 섹션 ───────────────────────────────────────────────────────
  const inviteLink = `${location.origin}${location.pathname}?tripId=${trip.id}&join=${trip.shareCode}`;
  document.getElementById('members-invite-link-output').value = inviteLink;

  const ownerSettings  = document.getElementById('members-invite-owner-settings');
  const ownerSaveRow   = document.getElementById('members-invite-save-row');
  const pwGroup        = document.getElementById('members-invite-password-group');
  const pwInput        = document.getElementById('members-invite-password');
  const typeHint       = document.getElementById('members-invite-type-hint');

  if (owner) {
    ownerSettings.style.display = '';
    ownerSaveRow.style.display  = '';
    const isPrivate = trip.roomType === 'private';
    document.querySelectorAll('input[name="members-room-type"]').forEach(r => {
      r.checked = r.value === (isPrivate ? 'private' : 'public');
    });
    pwInput.value = '';
    document.getElementById('err-members-invite-password').textContent = '';
    _updateMembersInviteTypeUI(isPrivate ? 'private' : 'public', isPrivate, typeHint, pwGroup, pwInput);
  } else {
    ownerSettings.style.display = 'none';
    ownerSaveRow.style.display  = 'none';
  }
}

// 편집 권한 요청 전송 (뷰어)
async function sendEditRequest(tripId) {
  const uid = state.currentUser?.uid;
  try {
    await db.collection('trips').doc(tripId).update({
      [`editRequests.${uid}`]: 'pending',
    });
    showToast('편집 권한 요청을 방장에게 전송했습니다.');
    const trip = state.trips.find(t => t.id === tripId);
    if (trip) renderMembersModal(trip);
  } catch (err) {
    console.error(err);
    showToast('요청 전송에 실패했습니다.');
  }
}

// 편집 권한 요청 수락/거절 (방장)
async function resolveEditRequest(tripId, uid, accept) {
  try {
    await db.collection('trips').doc(tripId).update({
      [`editRequests.${uid}`]: accept ? 'accepted' : 'denied',
      ...(accept ? { [`memberRoles.${uid}`]: 'editor' } : {}),
    });
    showToast(accept ? '편집 권한을 부여했습니다.' : '요청을 거절했습니다.');
  } catch (err) {
    console.error(err);
    showToast('처리에 실패했습니다.');
  }
}

async function setMemberRole(tripId, uid, role) {
  try {
    await db.collection('trips').doc(tripId).update({
      [`memberRoles.${uid}`]: role,
    });
    showToast(`권한이 ${role === 'editor' ? '편집자' : '뷰어'}(으)로 변경됐습니다.`);
  } catch (err) {
    console.error(err);
    showToast('권한 변경에 실패했습니다.');
  }
}

function promptTransferOwner(tripId, newOwnerUid) {
  const trip = state.trips.find(t => t.id === tripId);
  const name = memberDisplayName(trip, newOwnerUid);
  confirmAction(`"${name}" 님에게 관리자 권한을 위임할까요? 본인은 편집자가 됩니다.`, async () => {
    try {
      const oldOwner = state.currentUser.uid;
      await db.collection('trips').doc(tripId).update({
        ownerId: newOwnerUid,
        [`memberRoles.${oldOwner}`]: 'editor',
        [`memberRoles.${newOwnerUid}`]: firebase.firestore.FieldValue.delete(),
      });
      closeModal('modal-members');
      showToast('관리자 권한이 양도됐습니다.');
    } catch (err) {
      console.error(err);
      showToast('관리자 위임에 실패했습니다.');
    }
  });
}

function promptKickMember(tripId, uid) {
  const trip = state.trips.find(t => t.id === tripId);
  const name = memberDisplayName(trip, uid);
  confirmAction(`"${name}" 님을 이 여행에서 추방할까요?`, async () => {
    try {
      await db.collection('trips').doc(tripId).update({
        memberIds: firebase.firestore.FieldValue.arrayRemove(uid),
        [`memberProfiles.${uid}`]: firebase.firestore.FieldValue.delete(),
        [`memberRoles.${uid}`]: firebase.firestore.FieldValue.delete(),
      });
      showToast('멤버가 추방됐습니다.');
    } catch (err) {
      console.error(err);
      showToast('추방에 실패했습니다.');
    }
  });
}

