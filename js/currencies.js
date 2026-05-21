// 세계 주요 통화 목록
// code: ISO 4217, symbol: 표시용 기호, ko: 한국어명, en: 영문명(검색용)
export const CURRENCIES = [
  { code: 'KRW', symbol: '₩',   ko: '대한민국 원',       en: 'South Korean Won' },
  { code: 'USD', symbol: '$',   ko: '미국 달러',         en: 'US Dollar' },
  { code: 'EUR', symbol: '€',   ko: '유로',              en: 'Euro' },
  { code: 'JPY', symbol: '¥',   ko: '일본 엔',           en: 'Japanese Yen' },
  { code: 'GBP', symbol: '£',   ko: '영국 파운드',       en: 'British Pound' },
  { code: 'CNY', symbol: '¥',   ko: '중국 위안',         en: 'Chinese Yuan Renminbi' },
  { code: 'HKD', symbol: 'HK$', ko: '홍콩 달러',         en: 'Hong Kong Dollar' },
  { code: 'TWD', symbol: 'NT$', ko: '대만 달러',         en: 'Taiwan Dollar' },
  { code: 'SGD', symbol: 'S$',  ko: '싱가포르 달러',     en: 'Singapore Dollar' },
  { code: 'THB', symbol: '฿',   ko: '태국 바트',         en: 'Thai Baht' },
  { code: 'VND', symbol: '₫',   ko: '베트남 동',         en: 'Vietnamese Dong' },
  { code: 'PHP', symbol: '₱',   ko: '필리핀 페소',       en: 'Philippine Peso' },
  { code: 'IDR', symbol: 'Rp',  ko: '인도네시아 루피아', en: 'Indonesian Rupiah' },
  { code: 'MYR', symbol: 'RM',  ko: '말레이시아 링깃',   en: 'Malaysian Ringgit' },
  { code: 'INR', symbol: '₹',   ko: '인도 루피',         en: 'Indian Rupee' },
  { code: 'AUD', symbol: 'A$',  ko: '호주 달러',         en: 'Australian Dollar' },
  { code: 'NZD', symbol: 'NZ$', ko: '뉴질랜드 달러',     en: 'New Zealand Dollar' },
  { code: 'CAD', symbol: 'C$',  ko: '캐나다 달러',       en: 'Canadian Dollar' },
  { code: 'CHF', symbol: 'CHF', ko: '스위스 프랑',       en: 'Swiss Franc' },
  { code: 'SEK', symbol: 'kr',  ko: '스웨덴 크로나',     en: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr',  ko: '노르웨이 크로네',   en: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr',  ko: '덴마크 크로네',     en: 'Danish Krone' },
  { code: 'CZK', symbol: 'Kč',  ko: '체코 코루나',       en: 'Czech Koruna' },
  { code: 'PLN', symbol: 'zł',  ko: '폴란드 즈워티',     en: 'Polish Zloty' },
  { code: 'HUF', symbol: 'Ft',  ko: '헝가리 포린트',     en: 'Hungarian Forint' },
  { code: 'TRY', symbol: '₺',   ko: '튀르키예 리라',     en: 'Turkish Lira' },
  { code: 'RUB', symbol: '₽',   ko: '러시아 루블',       en: 'Russian Ruble' },
  { code: 'AED', symbol: 'د.إ', ko: '아랍에미리트 디르함', en: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼',   ko: '사우디 리얄',       en: 'Saudi Riyal' },
  { code: 'ILS', symbol: '₪',   ko: '이스라엘 셰켈',     en: 'Israeli Shekel' },
  { code: 'EGP', symbol: 'E£',  ko: '이집트 파운드',     en: 'Egyptian Pound' },
  { code: 'ZAR', symbol: 'R',   ko: '남아공 랜드',       en: 'South African Rand' },
  { code: 'BRL', symbol: 'R$',  ko: '브라질 헤알',       en: 'Brazilian Real' },
  { code: 'MXN', symbol: 'Mex$',ko: '멕시코 페소',       en: 'Mexican Peso' },
  { code: 'ARS', symbol: 'AR$', ko: '아르헨티나 페소',   en: 'Argentine Peso' },
];

export const DEFAULT_CURRENCY = 'KRW';

const CURRENCY_MAP = Object.fromEntries(CURRENCIES.map(c => [c.code, c]));

export function getCurrency(code) {
  return CURRENCY_MAP[code] || null;
}

// 표시용: "₩ KRW" 처럼 짧은 라벨
export function currencyShortLabel(code) {
  const c = CURRENCY_MAP[code];
  if (!c) return code;
  return `${c.symbol} ${c.code}`;
}

// 금액 + 통화코드 → "₩15,000" / "€15.50" 형태
export function formatMoney(amount, code) {
  const c = CURRENCY_MAP[code];
  const rounded = Math.round(amount * 100) / 100;
  const num = (Number.isInteger(rounded) ? rounded : rounded.toFixed(2))
    .toLocaleString('ko-KR');
  if (!c) return `${num} ${code || ''}`.trim();
  // 통화별 표기 관습: 앞 기호 vs 뒤 기호
  const prefixSym = new Set(['$','£','₩','¥','₹','₺','₽','₱','฿','€','₫','₪']);
  if (prefixSym.has(c.symbol)) return `${c.symbol}${num}`;
  return `${num} ${c.symbol}`;
}

// 검색 필터 (코드/한글명/영문명/기호로 매칭)
export function filterCurrencies(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return CURRENCIES;
  return CURRENCIES.filter(c =>
    c.code.toLowerCase().includes(q) ||
    c.ko.toLowerCase().includes(q) ||
    c.en.toLowerCase().includes(q) ||
    c.symbol.toLowerCase().includes(q)
  );
}
