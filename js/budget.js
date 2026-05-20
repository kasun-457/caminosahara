import { state } from './state.js';
import { CATEGORIES } from './constants.js';
import { escapeHtml, fmtDate, openModal } from './utils.js';

// ── 가격 문자열 파싱 ──────────────────────────────────────────────────────────
// "15유로", "15-30유로", "65,000원", "$45.50/박" 등에서 첫 숫자와 통화를 추출
export function parsePrice(str) {
  if (!str) return null;
  const s = String(str).trim();
  // 첫 번째 숫자(쉼표·소수점 포함)
  const m = s.match(/([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(/,/g, ''));
  if (!isFinite(amount) || amount <= 0) return null;

  // 통화 자동 감지
  let currency = '기타';
  if (/유로|€|EUR/i.test(s))         currency = '€';
  else if (/원|₩|KRW/i.test(s))      currency = '₩';
  else if (/달러|\$|USD/i.test(s))   currency = '$';
  else if (/엔|円|¥|JPY/i.test(s))   currency = '¥';
  else if (/파운드|£|GBP/i.test(s))  currency = '£';
  else if (/위안|元|CNY|RMB/i.test(s)) currency = '¥(CNY)';

  return { amount, currency, raw: s };
}

function formatAmount(amount, currency) {
  const rounded = Math.round(amount * 100) / 100;
  const num = (Number.isInteger(rounded) ? rounded : rounded.toFixed(2))
    .toLocaleString('ko-KR');
  if (!currency || currency === '기타') return `${num}`;
  if (currency === '₩' || currency === '$' || currency === '£') return `${currency}${num}`;
  return `${num} ${currency}`;
}

// trip의 모든 활동에서 지출 항목 추출
function collectExpenses(trip) {
  const items = [];
  (trip.days || []).forEach(day => {
    (day.activities || []).forEach(act => {
      const priceStr = act.details?.price;
      const parsed = parsePrice(priceStr);
      if (!parsed) return;
      items.push({
        date: day.date,
        actId: act.id,
        category: act.category,
        title: act.title,
        time: act.time || '',
        amount: parsed.amount,
        currency: parsed.currency,
        raw: parsed.raw,
      });
    });
  });
  return items;
}

// 통화별로 합계 계산
function sumByCurrency(items) {
  const totals = {}; // currency → amount
  items.forEach(it => { totals[it.currency] = (totals[it.currency] || 0) + it.amount; });
  return totals;
}

// 통화 × 카테고리별 합계
function sumByCategory(items) {
  const map = {}; // category → currency → amount
  items.forEach(it => {
    if (!map[it.category]) map[it.category] = {};
    map[it.category][it.currency] = (map[it.category][it.currency] || 0) + it.amount;
  });
  return map;
}

// ── 가계부 모달 ───────────────────────────────────────────────────────────────
export function openBudgetModal() {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (!trip) return;
  renderBudgetModal(trip);
  openModal('modal-budget');
}

function renderBudgetModal(trip) {
  const body = document.getElementById('budget-body');
  const items = collectExpenses(trip);

  if (items.length === 0) {
    body.innerHTML = `
      <div class="budget-empty">
        <p>아직 등록된 지출이 없어요.</p>
        <p class="budget-empty-hint">일정 상세의 "💰 지출 금액 / 입장료 / 요금 / 숙박료" 등에 금액을 적으면 자동으로 집계돼요.</p>
      </div>`;
    return;
  }

  const totals    = sumByCurrency(items);
  const byCat     = sumByCategory(items);
  const currencies = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);

  // 합계 칩
  const totalsHTML = currencies.map(c => `
    <div class="budget-total-chip">
      <span class="budget-total-label">${c === '기타' ? '통화 미상' : c}</span>
      <span class="budget-total-amount">${formatAmount(totals[c], c)}</span>
    </div>`).join('');

  // 카테고리별 표
  const catRows = Object.keys(CATEGORIES).filter(cat => byCat[cat]).map(cat => {
    const meta = CATEGORIES[cat];
    const cells = currencies.map(c => {
      const a = byCat[cat][c];
      return `<td class="budget-amount-cell">${a ? formatAmount(a, c) : '—'}</td>`;
    }).join('');
    return `<tr>
      <td class="budget-cat-cell"><span style="color:${meta.color}">${meta.icon} ${cat}</span></td>
      ${cells}
    </tr>`;
  }).join('');
  const catHeaderCells = currencies.map(c =>
    `<th class="budget-amount-cell">${c === '기타' ? '미상' : c}</th>`
  ).join('');

  // 일자별 그룹 + 항목
  const byDate = {};
  items.forEach(it => { (byDate[it.date] ||= []).push(it); });
  const dateKeys = Object.keys(byDate).sort();

  const datesHTML = dateKeys.map(date => {
    const dayItems = byDate[date].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const dayTotals = sumByCurrency(dayItems);
    const dayTotalsStr = Object.entries(dayTotals)
      .map(([c, a]) => formatAmount(a, c)).join(' + ');

    const rows = dayItems.map(it => {
      const meta = CATEGORIES[it.category] || CATEGORIES['기타'];
      return `<li class="budget-item" data-act-id="${it.actId}" data-date="${it.date}">
        <span class="budget-item-time">${it.time || '—'}</span>
        <span class="budget-item-cat" style="color:${meta.color}">${meta.icon}</span>
        <span class="budget-item-title">${escapeHtml(it.title)}</span>
        <span class="budget-item-amount">${formatAmount(it.amount, it.currency)}</span>
      </li>`;
    }).join('');

    return `
      <div class="budget-day">
        <div class="budget-day-header">
          <span class="budget-day-date">${fmtDate(date)}</span>
          <span class="budget-day-total">${dayTotalsStr}</span>
        </div>
        <ul class="budget-item-list">${rows}</ul>
      </div>`;
  }).join('');

  body.innerHTML = `
    <section class="budget-section">
      <h3 class="budget-section-title">합계</h3>
      <div class="budget-totals">${totalsHTML}</div>
    </section>
    <section class="budget-section">
      <h3 class="budget-section-title">카테고리별</h3>
      <div class="budget-cat-table-wrap">
        <table class="budget-cat-table">
          <thead><tr><th>카테고리</th>${catHeaderCells}</tr></thead>
          <tbody>${catRows}</tbody>
        </table>
      </div>
    </section>
    <section class="budget-section">
      <h3 class="budget-section-title">일자별 지출</h3>
      <div class="budget-days">${datesHTML}</div>
    </section>`;

  // 항목 클릭 → 상세 패널 열기
  body.querySelectorAll('.budget-item').forEach(el => {
    el.addEventListener('click', () => {
      const actId = el.dataset.actId;
      const date  = el.dataset.date;
      // 직접 import하지 않고 동적 로드: 순환 의존 방지
      import('./detail-panel.js').then(({ openDetailPanel }) => {
        openDetailPanel(actId, date);
      });
    });
  });
}
