import { CATEGORY_FIELDS } from './constants.js';
import { escapeHtml } from './utils.js';

export function renderActivityFormFields(category, details = {}) {
  const container = document.getElementById('activity-dynamic-fields');
  const fields = CATEGORY_FIELDS[category] || [];
  container.innerHTML = fields.map(f => `
    <div class="form-group">
      <label for="actf-${f.key}">${f.icon} ${f.label}</label>
      <input type="text" id="actf-${f.key}" data-detail-key="${f.key}"
             placeholder="${escapeHtml(f.placeholder || '')}"
             value="${escapeHtml(details[f.key] || '')}" autocomplete="off">
    </div>
  `).join('');
}

export function gatherActivityDetails(category) {
  const details = {};
  const fields = CATEGORY_FIELDS[category] || [];
  fields.forEach(f => {
    const el = document.getElementById(`actf-${f.key}`);
    if (el) {
      const v = el.value.trim();
      if (v) details[f.key] = v;
    }
  });
  return details;
}
