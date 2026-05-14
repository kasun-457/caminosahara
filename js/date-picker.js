export class DatePicker {
  constructor(inputEl, btnEl, options = {}) {
    this.input = inputEl;
    this.btn = btnEl;
    this.options = options;
    this.viewYear = new Date().getFullYear();
    this.viewMonth = new Date().getMonth();
    this._build();
    this._bind();
  }

  _build() {
    this.popup = document.createElement('div');
    this.popup.className = 'cal-popup';
    this.popup.innerHTML = `
      <div class="cal-header">
        <button type="button" class="cal-nav cal-prev">‹</button>
        <span class="cal-month-label"></span>
        <button type="button" class="cal-nav cal-next">›</button>
      </div>
      <div class="cal-weekdays">
        <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
      </div>
      <div class="cal-grid"></div>`;
    document.body.appendChild(this.popup);
    this.popup.querySelector('.cal-prev').addEventListener('click', e => { e.stopPropagation(); this._navigate(-1); });
    this.popup.querySelector('.cal-next').addEventListener('click', e => { e.stopPropagation(); this._navigate(1); });
  }

  _bind() {
    this.btn.addEventListener('click', e => {
      e.stopPropagation();
      this.popup.classList.contains('active') ? this.close() : this.open();
    });
    document.addEventListener('click', e => {
      if (this.popup.classList.contains('active') &&
          !this.popup.contains(e.target) && !this.btn.contains(e.target)) {
        this.close();
      }
    });
    this.input.addEventListener('input', () => {
      if (this.popup.classList.contains('active')) this._renderGrid();
      if (this.options.partnerPicker?.popup.classList.contains('active')) {
        this.options.partnerPicker._renderGrid();
      }
    });
  }

  open() {
    const val = this.input.value;
    if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      this.viewYear = +val.slice(0, 4);
      this.viewMonth = +val.slice(5, 7) - 1;
    }
    this._position();
    this.popup.classList.add('active');
    this._renderGrid();
  }

  close() { this.popup.classList.remove('active'); }

  _position() {
    const rect = this.btn.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.right - 280;
    if (left < 8) left = 8;
    if (top + 340 > window.innerHeight) top = rect.top - 346;
    this.popup.style.top = top + 'px';
    this.popup.style.left = left + 'px';
  }

  _navigate(dir) {
    this.viewMonth += dir;
    if (this.viewMonth < 0) { this.viewMonth = 11; this.viewYear--; }
    if (this.viewMonth > 11) { this.viewMonth = 0; this.viewYear++; }
    this._renderGrid();
  }

  _renderGrid() {
    this.popup.querySelector('.cal-month-label').textContent =
      `${this.viewYear}년 ${this.viewMonth + 1}월`;

    const firstDay = new Date(this.viewYear, this.viewMonth, 1).getDay();
    const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
    const selVal = this.input.value;
    const partnerVal = this.options.getPartner ? this.options.getPartner() : '';
    const startVal = this.options.isEnd ? partnerVal : selVal;
    const endVal   = this.options.isEnd ? selVal : partnerVal;
    const hasRange = startVal && endVal && startVal < endVal;

    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<span class="cal-cell"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = `${this.viewYear}-${String(this.viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const col = (firstDay + d - 1) % 7;
      let cls = 'cal-cell cal-day';
      if (col === 0) cls += ' cal-sun';
      if (col === 6) cls += ' cal-sat';
      if (dd === selVal) {
        cls += ' cal-selected';
      } else if (hasRange) {
        if (dd === startVal) cls += ' cal-range-start';
        else if (dd === endVal) cls += ' cal-range-end';
        else if (dd > startVal && dd < endVal) cls += ' cal-in-range';
      }
      html += `<button type="button" class="${cls}" data-d="${dd}">${d}</button>`;
    }

    const grid = this.popup.querySelector('.cal-grid');
    grid.innerHTML = html;
    grid.querySelectorAll('.cal-day').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.input.value = btn.dataset.d;
        this.input.dispatchEvent(new Event('input', { bubbles: true }));
        this.close();
        if (this.options.partnerPicker) this.options.partnerPicker._renderGrid();
      });
    });
  }
}
