import { CATEGORY_FIELDS } from './constants.js';
import { escapeHtml, generateTimeOptions } from './utils.js';
import { state } from './state.js';
import { getTripCurrencies } from './trips.js';
import { currencyShortLabel } from './currencies.js';

function tripCurrencyOptions(selected) {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  const codes = getTripCurrencies(trip);
  if (codes.length < 2) return null; // 1개면 셀렉트 불필요
  const cur = selected && codes.includes(selected) ? selected : codes[0];
  return { codes, selected: cur };
}

export function renderActivityFormFields(category, details = {}) {
  const container = document.getElementById('activity-dynamic-fields');
  const fields = CATEGORY_FIELDS[category] || [];
  container.innerHTML = fields.map(f => {
    if (f.type === 'time') {
      const times = generateTimeOptions();
      const val = details[f.key] || '';
      return `
    <div class="form-group">
      <label for="actf-${f.key}">${f.icon} ${f.label}</label>
      <select id="actf-${f.key}" class="time-select" data-detail-key="${f.key}">
        <option value="">선택 안함</option>
        ${times.map(t => `<option value="${t}" ${t === val ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>`;
    }
    if (f.key === 'price') {
      const curOpts = tripCurrencyOptions(details.priceCurrency);
      const curSelect = curOpts ? `
        <select id="actf-priceCurrency" class="price-currency-select" data-detail-key="priceCurrency">
          ${curOpts.codes.map(c => `<option value="${c}" ${c === curOpts.selected ? 'selected' : ''}>${currencyShortLabel(c)}</option>`).join('')}
        </select>` : '';
      return `
    <div class="form-group">
      <label for="actf-${f.key}">${f.icon} ${f.label}</label>
      <div class="price-input-row">
        <input type="text" id="actf-${f.key}" data-detail-key="${f.key}"
               placeholder="${escapeHtml(f.placeholder || '')}"
               value="${escapeHtml(details[f.key] || '')}" autocomplete="off">
        ${curSelect}
      </div>
    </div>`;
    }
    return `
    <div class="form-group">
      <label for="actf-${f.key}">${f.icon} ${f.label}</label>
      <input type="text" id="actf-${f.key}" data-detail-key="${f.key}"
             placeholder="${escapeHtml(f.placeholder || '')}"
             value="${escapeHtml(details[f.key] || '')}" autocomplete="off">
    </div>`;
  }).join('');
}

export function gatherActivityDetails(category) {
  const details = {};
  const fields = CATEGORY_FIELDS[category] || [];
  fields.forEach(f => {
    const el = document.getElementById(`actf-${f.key}`);
    if (el) {
      const v = (el.value || '').trim();
      if (v) details[f.key] = v;
    }
  });
  // price가 있으면 priceCurrency도 함께 수집
  if (details.price) {
    const cs = document.getElementById('actf-priceCurrency');
    if (cs && cs.value) details.priceCurrency = cs.value;
  }
  return details;
}
