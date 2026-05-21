// ── 커스텀 시간 선택기 (15분 단위) ────────────────────────────────────────────
//  <input type="text">에 부착되어 클릭 시 15분 단위 시간 목록을 띄운다.
//  내부 값은 항상 24시간 "HH:MM" 형식.

const STEP_MIN = 15;

function buildOptions() {
  const opts = [];
  for (let m = 0; m < 24 * 60; m += STEP_MIN) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    opts.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }
  return opts;
}
const TIME_OPTIONS = buildOptions();

class TimePicker {
  constructor(inputEl) {
    this.input = inputEl;
    this.popup = null;
    this._onFocus = this._onFocus.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onDocClick = this._onDocClick.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
    this._onInput = this._onInput.bind(this);

    // input type을 text로 강제 (기본 time picker 비활성화)
    this.input.setAttribute('type', 'text');
    this.input.setAttribute('placeholder', '--:--');
    this.input.setAttribute('autocomplete', 'off');
    this.input.setAttribute('maxlength', '5');
    this.input.classList.add('tp-input');

    this.input.addEventListener('focus', this._onFocus);
    this.input.addEventListener('click', this._onClick);
    this.input.addEventListener('keydown', this._onKeydown);
    this.input.addEventListener('input', this._onInput);
  }

  _onFocus()  { if (this.input.readOnly) return; this.open(); }
  _onClick(e) { if (this.input.readOnly) return; e.stopPropagation(); this.open(); }

  _onInput() {
    // HH:MM 형태로 자동 포맷 (숫자만 입력 시 콜론 자동 삽입)
    let v = this.input.value.replace(/[^0-9:]/g, '');
    if (v.length === 2 && !v.includes(':')) v = v + ':';
    if (v.length > 5) v = v.slice(0, 5);
    this.input.value = v;
    if (this.popup) this._scrollToValue();
  }

  _onKeydown(e) {
    if (e.key === 'Escape') {
      if (this.popup) { e.stopPropagation(); this.close(); }
      return;
    }
    if (!this.popup) return;
    const items = this.popup.querySelectorAll('.tp-item');
    const activeIdx = Array.from(items).findIndex(i => i.classList.contains('active'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(activeIdx + 1, items.length - 1);
      this._highlight(items, next);
      items[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(activeIdx - 1, 0);
      this._highlight(items, prev);
      items[prev]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0) {
        e.preventDefault();
        this._pick(items[activeIdx].dataset.v);
      } else {
        this.close();
      }
    }
  }

  _onDocClick(e) {
    if (!this.popup) return;
    if (e.target === this.input || this.popup.contains(e.target)) return;
    this.close();
  }

  open() {
    if (this.popup) return;
    const popup = document.createElement('div');
    popup.className = 'tp-popup';
    popup.innerHTML = TIME_OPTIONS.map(t =>
      `<div class="tp-item" data-v="${t}">${t}</div>`
    ).join('');
    document.body.appendChild(popup);
    this.popup = popup;

    this._position();

    popup.querySelectorAll('.tp-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        this._pick(el.dataset.v);
      });
    });

    // 현재 값으로 스크롤·강조
    requestAnimationFrame(() => this._scrollToValue());

    setTimeout(() => document.addEventListener('click', this._onDocClick), 0);
  }

  _position() {
    const r = this.input.getBoundingClientRect();
    const popupH = 240;
    let top = r.bottom + window.scrollY + 4;
    // 뷰포트 아래로 벗어나면 위쪽으로
    if (r.bottom + popupH > window.innerHeight) {
      top = r.top + window.scrollY - popupH - 4;
    }
    this.popup.style.top  = top + 'px';
    this.popup.style.left = r.left + window.scrollX + 'px';
    this.popup.style.minWidth = r.width + 'px';
  }

  _scrollToValue() {
    if (!this.popup) return;
    const v = this.input.value.trim();
    const items = this.popup.querySelectorAll('.tp-item');
    items.forEach(el => el.classList.remove('active'));
    if (!/^\d{2}:\d{2}$/.test(v)) return;
    // 가장 가까운 15분 단위 슬롯 찾기
    const [hh, mm] = v.split(':').map(Number);
    const totalMin = hh * 60 + mm;
    const idx = Math.min(
      Math.round(totalMin / STEP_MIN),
      TIME_OPTIONS.length - 1
    );
    const target = items[idx];
    if (target) {
      target.classList.add('active');
      target.scrollIntoView({ block: 'center' });
    }
  }

  _highlight(items, idx) {
    items.forEach((el, i) => el.classList.toggle('active', i === idx));
  }

  _pick(v) {
    this.input.value = v;
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
    this.input.dispatchEvent(new Event('change', { bubbles: true }));
    this.close();
  }

  close() {
    if (!this.popup) return;
    this.popup.remove();
    this.popup = null;
    document.removeEventListener('click', this._onDocClick);
  }
}

// 헬퍼: input 요소 배열에 일괄 적용
export function attachTimePickers(...inputs) {
  return inputs.filter(Boolean).map(el => new TimePicker(el));
}
