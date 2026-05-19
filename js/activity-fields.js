import { CATEGORY_FIELDS } from './constants.js';
import { escapeHtml, generateTimeOptions } from './utils.js';

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
  return details;
}
