export const HOUR_PX = 64;

export const PLACE_AC_KEYS = new Set(['address', 'fromLocation', 'toLocation']);

export const CATEGORIES = {
  '관광': { icon: '🏛️', color: '#c8f060' },
  '식사': { icon: '🍽️', color: '#f0a060' },
  '교통': { icon: '🚌', color: '#60a0f0' },
  '숙박': { icon: '🏨', color: '#c060f0' },
  '쇼핑': { icon: '🛍️', color: '#f060a0' },
  '기타': { icon: '📌', color: '#7a7a82' },
};

export const CATEGORY_FIELDS = {
  '관광': [
    { key: 'startTime', label: '시작 시간', icon: '🕐', type: 'time' },
    { key: 'endTime', label: '종료 시간', icon: '🕓', type: 'time' },
    { key: 'address', label: '장소', icon: '📍', placeholder: '예: Calle Mayor 1, Madrid' },
    { key: 'openHours', label: '운영시간', icon: '🕐', placeholder: '예: 10:00 - 20:00' },
    { key: 'price', label: '입장료', icon: '💰', placeholder: '예: 15유로 (성인)' },
    { key: 'url', label: '관련 링크', icon: '🔗', placeholder: 'https://...' },
  ],
  '식사': [
    { key: 'startTime', label: '시작 시간', icon: '🕐', type: 'time' },
    { key: 'endTime', label: '종료 시간', icon: '🕓', type: 'time' },
    { key: 'address', label: '장소', icon: '📍', placeholder: '식당 주소' },
    { key: 'cuisine', label: '요리 종류', icon: '🍴', placeholder: '예: 스페인 타파스' },
    { key: 'price', label: '예상 가격', icon: '💰', placeholder: '예: 15-30유로' },
    { key: 'reservation', label: '예약 정보', icon: '📞', placeholder: '예약 시간 / 번호' },
    { key: 'url', label: '관련 링크', icon: '🔗', placeholder: 'https://...' },
  ],
  '교통': [
    { key: 'mode', label: '교통수단', icon: '🚌', placeholder: '예: 기차 / 비행기 / 버스' },
    { key: 'fromLocation', label: '출발지', icon: '🟢', placeholder: '예: 마드리드 아토차역' },
    { key: 'toLocation', label: '도착지', icon: '🔴', placeholder: '예: 사리아역' },
    { key: 'departTime', label: '출발 시각', icon: '🕐', type: 'time' },
    { key: 'arriveTime', label: '도착 시각', icon: '🕓', type: 'time' },
    { key: 'bookingNumber', label: '예약번호', icon: '🎫', placeholder: '티켓/편명/예약번호' },
    { key: 'price', label: '요금', icon: '💰', placeholder: '예: 65유로' },
    { key: 'url', label: '예약/티켓 링크', icon: '🔗', placeholder: 'https://...' },
  ],
  '숙박': [
    { key: 'address', label: '장소', icon: '📍', placeholder: '숙소 주소' },
    { key: 'startTime', label: '체크인', icon: '🔑', type: 'time' },
    { key: 'endTime', label: '체크아웃', icon: '🚪', type: 'time' },
    { key: 'bookingNumber', label: '예약번호', icon: '🎫', placeholder: '' },
    { key: 'price', label: '숙박료', icon: '💰', placeholder: '예: 45유로/박' },
    { key: 'url', label: '예약 사이트', icon: '🔗', placeholder: 'https://...' },
  ],
  '쇼핑': [
    { key: 'startTime', label: '시작 시간', icon: '🕐', type: 'time' },
    { key: 'endTime', label: '종료 시간', icon: '🕓', type: 'time' },
    { key: 'address', label: '장소', icon: '📍', placeholder: '' },
    { key: 'openHours', label: '영업시간', icon: '🕐', placeholder: '' },
    { key: 'items', label: '구매 품목', icon: '🛍️', placeholder: '예: 기념품, 식료품' },
    { key: 'url', label: '관련 링크', icon: '🔗', placeholder: 'https://...' },
  ],
  '기타': [
    { key: 'startTime', label: '시작 시간', icon: '🕐', type: 'time' },
    { key: 'endTime', label: '종료 시간', icon: '🕓', type: 'time' },
    { key: 'address', label: '장소', icon: '📍', placeholder: '' },
    { key: 'url', label: '관련 링크', icon: '🔗', placeholder: 'https://...' },
  ],
};
