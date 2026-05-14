import { escapeHtml } from './utils.js';

export class PlaceAutocomplete {
  constructor(inputEl, onSelect) {
    this.input = inputEl;
    this.onSelect = onSelect;
    this.list = null;
    this.timer = null;
    this.activeIdx = -1;
    this._onInput = this._onInput.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
    this._onBlur = this._onBlur.bind(this);
    inputEl.addEventListener('input', this._onInput);
    inputEl.addEventListener('keydown', this._onKeydown);
    inputEl.addEventListener('blur', this._onBlur);
  }

  _onInput() {
    clearTimeout(this.timer);
    const q = this.input.value.trim();
    if (q.length < 2) { this._close(); return; }
    this.timer = setTimeout(() => this._fetch(q), 350);
  }

  async _fetch(q) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=ko`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'ko' } });
      const data = await res.json();
      this._render(data);
    } catch { this._close(); }
  }

  _render(results) {
    this._close();
    if (!results.length) return;
    const wrap = this.input.closest('.place-ac-wrap') || this.input.parentElement;
    const list = document.createElement('ul');
    list.className = 'place-ac-list';
    list.setAttribute('role', 'listbox');
    results.forEach(r => {
      const li = document.createElement('li');
      li.className = 'place-ac-item';
      li.setAttribute('role', 'option');
      li.innerHTML = `<span class="place-ac-icon">📍</span><span>${escapeHtml(r.display_name)}</span>`;
      li.addEventListener('mousedown', e => { e.preventDefault(); this._pick(r.display_name); });
      list.appendChild(li);
    });
    wrap.style.position = 'relative';
    wrap.appendChild(list);
    this.list = list;
    this.activeIdx = -1;
  }

  _onKeydown(e) {
    if (!this.list) return;
    const items = this.list.querySelectorAll('.place-ac-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeIdx = Math.min(this.activeIdx + 1, items.length - 1);
      this._highlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeIdx = Math.max(this.activeIdx - 1, 0);
      this._highlight(items);
    } else if (e.key === 'Enter' && this.activeIdx >= 0) {
      e.preventDefault();
      this._pick(items[this.activeIdx].textContent.replace('📍', '').trim());
    } else if (e.key === 'Escape') {
      this._close();
    }
  }

  _highlight(items) {
    items.forEach((el, i) => el.classList.toggle('ac-active', i === this.activeIdx));
  }

  _onBlur() { setTimeout(() => this._close(), 150); }

  _pick(name) {
    this.input.value = name;
    this._close();
    if (this.onSelect) this.onSelect(name);
  }

  _close() {
    if (this.list) { this.list.remove(); this.list = null; }
    this.activeIdx = -1;
  }

  destroy() {
    this._close();
    clearTimeout(this.timer);
    this.input.removeEventListener('input', this._onInput);
    this.input.removeEventListener('keydown', this._onKeydown);
    this.input.removeEventListener('blur', this._onBlur);
  }
}
