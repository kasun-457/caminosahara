// ── localStorage 정리 (이전 버전 잔여 데이터 제거) ─────────────────────────────
//  이전 버전의 시드 함수가 매 페이지 로드마다 localStorage에 데이터를 다시 써서
//  마이그레이션이 반복 실행되며 중복 여행이 생성되던 버그를 막기 위해,
//  앱 시작 시점에 잔여 localStorage 데이터를 비웁니다.
localStorage.removeItem('trips');
localStorage.setItem('migrated', 'true');

/* 시드 함수 제거됨 — 이전 버전 코드 보존용 (실행되지 않음)
(function seedLegacyIfNeeded_REMOVED() {
  if (localStorage.getItem('migrated')) return;
  const TITLE = '스페인·모로코 3주 여행';
  const existing = JSON.parse(localStorage.getItem('trips') || '[]');
  if (existing.some(t => t.title === TITLE)) return;

  function lid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

  const days = [
    { date: '2026-07-17', activities: [
      { time: '11:50', category: '교통', title: '인천공항 출발', notes: '아시아나항공 탑승' },
      { time: '19:10', category: '교통', title: '바르셀로나 도착', notes: '바르셀로나 엘프라트 공항' },
      { time: '20:35', category: '교통', title: 'iryo 기차로 마드리드 이동', notes: '바르셀로나 → 마드리드' },
      { time: '23:52', category: '숙박', title: '마드리드 도착 및 숙소 체크인', notes: 'Hostel Siesta&Go (Atocha 인근)' },
    ]},
    { date: '2026-07-18', activities: [
      { time: '', category: '관광', title: '마드리드 간단한 시내 관광', notes: '소로야 미술관, 레티로 공원 등 동선 고려' },
      { time: '', category: '쇼핑', title: '순례길 준비물 및 간편식 구매', notes: '데카트론, 현지 슈퍼마켓 등에서 배낭용 간식·선크림·붕대 등 구매' },
      { time: '', category: '식사', title: '저녁식사 후 이른 취침', notes: '컨디션 관리 — 순례길 전날이므로 일찍 취침' },
    ]},
    { date: '2026-07-19', activities: [
      { time: '', category: '교통', title: '마드리드 우체국에서 짐 발송', notes: '산티아고 데 콤포스텔라로 순례길 불필요 짐 택배 발송' },
      { time: '', category: '관광', title: '마드리드 왕궁 관람', notes: 'Palacio Real de Madrid — 유럽 최대 규모 왕궁 중 하나' },
      { time: '', category: '식사', title: '점심식사', notes: '왕궁 인근 타베르나 또는 메르카도 데 산 미겔' },
      { time: '', category: '교통', title: '사리아(Sarria)로 이동', notes: '기차(Madrid-Chamartin) → 루고(Lugo) 또는 몬포르테 환승 후 사리아 버스 이동' },
      { time: '', category: '기타', title: '순례자 여권(크레덴시알) 구매', notes: '사리아 인근 교회 또는 알베르게에서 구매 가능' },
      { time: '', category: '식사', title: '현지 식당에서 저녁식사', notes: '갈리시아 전통 요리 체험 추천 — 폴보(문어 요리) 등' },
      { time: '', category: '숙박', title: '숙소 도착 및 순례 준비·취침', notes: '배낭 점검, 이튿날 코스 확인 후 충분한 수면' },
    ]},
    { date: '2026-07-20', activities: [
      { time: '06:00', category: '기타', title: '순례길 출발 — Day 1', notes: '사리아(Sarria) → 포르토마린(Portomarín) 약 22.4km' },
      { time: '12:00', category: '숙박', title: '포르토마린 공립 알베르게 도착·체크인', notes: '선착순 입장 — 일찍 도착해야 자리 확보 가능' },
      { time: '', category: '관광', title: '포르토마린 마을 관광', notes: '산 후안 성당(이전된 로마네스크 교회), 댐 풍경 감상' },
      { time: '', category: '식사', title: '알베르게 저녁식사 및 휴식', notes: '다른 순례자들과 교류' },
    ]},
    { date: '2026-07-21', activities: [
      { time: '05:00', category: '기타', title: '순례길 출발 — Day 2', notes: '포르토마린 → 팔라스 데 레이(Palas de Rei) 약 25km (장거리 구간)' },
      { time: '12:00', category: '숙박', title: '팔라스 데 레이 공립 알베르게 도착·체크인', notes: '긴 구간이므로 이른 출발로 자리 선점' },
      { time: '', category: '관광', title: '팔라스 데 레이 주변 관광', notes: '산 티르소 교회, 마을 산책' },
      { time: '', category: '식사', title: '마을 식당 저녁식사', notes: '메뉴 델 디아(순례자 메뉴) 이용 추천' },
    ]},
    { date: '2026-07-22', activities: [
      { time: '07:00', category: '기타', title: '순례길 출발 — Day 3', notes: '팔라스 데 레이 → 멜리데(Melide) 약 14.8km (짧은 구간, 여유롭게)' },
      { time: '12:00', category: '숙박', title: '멜리데 공립 알베르게 도착·체크인', notes: '여유 있는 도착' },
      { time: '', category: '식사', title: '멜리데 문어 요리 체험', notes: '멜리데는 갈리시아 폴보(pulpo)의 본고장 — 풀페리아 에스카르파에서 꼭 먹어볼 것' },
      { time: '', category: '관광', title: '멜리데 마을 관광', notes: '산티아고 데 멜리데 교회, 마을 산책' },
      { time: '', category: '기타', title: '바에서 다른 순례자들과 담소', notes: '지금까지의 순례 경험을 공유하는 시간' },
    ]},
    { date: '2026-07-23', activities: [
      { time: '07:00', category: '기타', title: '순례길 출발 — Day 4', notes: '멜리데 → 아르주아(Arzúa) 약 14km' },
      { time: '12:00', category: '숙박', title: '아르주아 공립 알베르게 도착·체크인', notes: '내일이면 산티아고까지 이틀 남음' },
      { time: '', category: '관광', title: '아르주아 마을 관광', notes: '아르주아 치즈(Queixo de Arzúa-Ulloa) 유명 — 치즈 쇼핑 추천' },
      { time: '', category: '식사', title: '알베르게 저녁식사', notes: '' },
      { time: '', category: '기타', title: '팀원들과 순례길 감상 나누기', notes: '일주일간의 경험 회고 — 나머지 구간에 대한 마음가짐 정리' },
    ]},
    { date: '2026-07-24', activities: [
      { time: '06:00', category: '기타', title: '순례길 출발 — Day 5', notes: '아르주아 → 오 페드로조(O Pedrouzo) 약 19.1km' },
      { time: '12:00', category: '숙박', title: '오 페드로조 공립 알베르게 도착·체크인', notes: '내일이 산티아고 도착일 — 마지막 밤' },
      { time: '', category: '관광', title: '오 페드로조 주변 관광', notes: '산타 이레네 예배당 방문 추천' },
      { time: '', category: '식사', title: '알베르게 저녁식사 및 휴식', notes: '마지막 구간을 위해 충분한 수면' },
    ]},
    { date: '2026-07-25', activities: [
      { time: '06:00', category: '기타', title: '순례길 출발 — 최종 구간', notes: '오 페드로조 → 산티아고 데 콤포스텔라 약 20km — 몬테 도 고소(Monte do Gozo) 경유' },
      { time: '', category: '관광', title: '산티아고 데 콤포스텔라 도착 · 순례자 인증서 발급', notes: '순례자 사무소(Oficina de Acogida al Peregrino)에서 콤포스텔라 발급' },
      { time: '', category: '식사', title: '점심식사', notes: '대성당 광장(Praza do Obradoiro) 인근 식당' },
      { time: '', category: '관광', title: '산티아고 시내 관광 및 짐 찾기', notes: '미리 발송한 짐을 수령, 구시가지 산책' },
      { time: '', category: '숙박', title: '숙소 체크인 및 휴식', notes: '이제 알베르게 대신 호텔·한인민박 등 편한 숙소 이용 추천' },
      { time: '19:30', category: '관광', title: '순례자 미사 참석', notes: '산티아고 대성당 일일 순례자 미사 — 보타푸메이로(대형 향로) 이벤트 확인' },
      { time: '', category: '식사', title: '현지 바·식당에서 저녁식사 및 뒷풀이', notes: '라콘 콘 그렐로스(돼지 어깨살), 갈리시아 와인 알바리뇨 추천' },
    ]},
    { date: '2026-07-26', activities: [
      { time: '', category: '관광', title: '산티아고 대성당 오전 미사 참가', notes: '대성당 내부에서 미사 참여 — 경건한 마무리' },
      { time: '', category: '관광', title: '산티아고 대성당 내부 관람', notes: '박물관·지하 묘지·옥상 투어 가능 (사전 예약 권장)' },
      { time: '', category: '교통', title: '산티아고 공항 → 마드리드 비행기 이동', notes: 'SCQ→MAD 국내선 (1시간 내외)' },
      { time: '', category: '식사', title: '마드리드 도착 후 늦은 점심식사', notes: '마드리드 중앙시장(메르카도 산 미겔) 또는 그란 비아 인근' },
      { time: '', category: '숙박', title: '마드리드 숙소 체크인', notes: '' },
      { time: '', category: '관광', title: '마드리드 저녁 관광', notes: '프라도 미술관 야간 개장 또는 그란 비아·라바피에스 지구 산책' },
      { time: '', category: '식사', title: '저녁식사', notes: '보카디요 데 칼라마레스(오징어 바게트), 타파스 바 순회 추천' },
    ]},
    { date: '2026-07-27', activities: [
      { time: '', category: '교통', title: '톨레도로 이동', notes: 'Atocha역에서 AVE 약 30분 또는 버스로 1시간' },
      { time: '', category: '관광', title: '톨레도 대성당', notes: '스페인 고딕 건축의 정수 — 내부 종교 미술 컬렉션 필견' },
      { time: '', category: '관광', title: '알카사르 & 유대인 지구 관광', notes: '알카사르(군사 박물관), 엘 그레코 박물관, 산타 마리아 라 블랑카 시나고그' },
      { time: '', category: '식사', title: '톨레도 늦은 점심식사', notes: '코치니요(새끼 돼지 구이) 또는 마르차판(마지판 과자)' },
      { time: '', category: '교통', title: '마드리드 복귀 후 마라케시 비행기 이동', notes: 'MAD→RAK — 라이언에어·이베리아 등 저가항공 약 2시간 30분' },
      { time: '', category: '관광', title: '마라케시 간단한 관광·야시장', notes: '제마 엘프나 광장(Djemaa el-Fna) 야시장 구경' },
      { time: '', category: '식사', title: '저녁식사 후 이른 취침', notes: '다음날 이른 메르주가 이동을 위해 충분한 수면' },
    ]},
    { date: '2026-07-28', activities: [
      { time: '06:00', category: '교통', title: '마라케시 → 메르주가 택시 이동', notes: '약 180유로 / 편도 약 9~10시간 — 사전 협상 권장, 중간 휴게 포함' },
      { time: '16:00', category: '기타', title: '사막투어 시작 — 핫산네 사하라 투어 1일차', notes: '메르주가 출발' },
      { time: '', category: '관광', title: '낙타 타고 이동 (약 1시간) · 석양 감상', notes: '에르그 쉐비(Erg Chebbi) 모래사막 진입 — 일몰 시 황금빛 사막 풍경' },
      { time: '', category: '숙박', title: '사막 캠프 도착', notes: '베르베르 텐트 스타일 글램핑 캠프' },
      { time: '', category: '식사', title: '저녁식사 · 민트티 · 캠프파이어', notes: '타진, 쿠스쿠스 전통식 제공' },
      { time: '', category: '관광', title: '별 보기', notes: '광공해 없는 사막의 밤 — 은하수 관측 가능' },
    ]},
    { date: '2026-07-29', activities: [
      { time: '10:30', category: '관광', title: '사막투어 2일차 — 낙타 타고 깊은 사막 이동 (약 1시간 15분)', notes: '에르그 쉐비 내부 깊숙이 이동' },
      { time: '', category: '식사', title: '점심 + 샌드보딩', notes: '모래 언덕에서 샌드보딩 체험' },
      { time: '', category: '관광', title: '높은 모래 언덕 등반 · 파노라마 감상', notes: '에르그 쉐비 최고 언덕(약 150m)에서 360° 사막 전경' },
      { time: '17:00', category: '관광', title: '낙타 타고 석양 감상', notes: '붉은 노을과 사막의 대비' },
      { time: '', category: '식사', title: '저녁식사 + 베르베르 음악 공연', notes: '귀나우바 리듬 전통 음악 감상' },
    ]},
    { date: '2026-07-30', activities: [
      { time: '', category: '관광', title: '사막투어 3일차 — 일출 감상', notes: '새벽 모래 언덕에서 일출 — 사하라 여행의 하이라이트' },
      { time: '', category: '숙박', title: '핫산네 호텔로 복귀 · 샤워 및 정리', notes: '' },
      { time: '', category: '교통', title: '메르주가 → 페스(Fez) 버스 이동', notes: '약 8~9시간 — CTM 또는 수프라투르 버스 예약 권장' },
      { time: '', category: '식사', title: '페스 도착 후 식사', notes: '' },
      { time: '', category: '숙박', title: '페스 숙소 체크인 및 취침', notes: '페스 엘발리(구시가지) 인근 리야드 추천' },
    ]},
    { date: '2026-07-31', activities: [
      { time: '', category: '교통', title: '페스 → 쉐프샤우엔 버스 이동', notes: 'CTM 버스 약 4시간 — 사전 예약 권장' },
      { time: '', category: '식사', title: '쉐프샤우엔 도착 후 점심식사', notes: '' },
      { time: '', category: '숙박', title: '숙소 체크인 또는 짐 보관', notes: '파란 마을 중심부 리야드·게스트하우스' },
      { time: '', category: '관광', title: '쉐프샤우엔 마을 관광', notes: '파란 계단길, 우타 엘함맘 광장, 카사바 박물관, 라스 엘마 폭포' },
      { time: '', category: '식사', title: '저녁식사 및 휴식', notes: '쉐프샤우엔 전통 카페에서 민트티와 함께 휴식' },
    ]},
    { date: '2026-08-01', activities: [
      { time: '', category: '교통', title: '쉐프샤우엔 → 탕헤르 항구 버스 이동', notes: '약 3시간' },
      { time: '', category: '교통', title: '탕헤르 → 타리파(스페인) 페리 이동', notes: 'FRS 또는 Baleàlia 페리 약 35분 — 지브롤터 해협 횡단' },
      { time: '', category: '교통', title: '타리파 → 세비야 버스 이동', notes: '약 2시간 (Comes 버스)' },
      { time: '', category: '식사', title: '세비야 도착 후 저녁식사', notes: '트리아나 지구 타파스 바 추천 — 하몬, 가스파초' },
      { time: '', category: '관광', title: '메트로폴 파라솔(세따스) 야경 관람', notes: '세계 최대 목조 구조물 — 옥상 전망대에서 세비야 야경 감상' },
    ]},
    { date: '2026-08-02', activities: [
      { time: '', category: '기타', title: '오전 자유 일정', notes: '순례길 이후 지친 몸을 회복하는 여유로운 오전 — 숙소 수영장 또는 카페에서 휴식' },
      { time: '', category: '식사', title: '점심식사', notes: '' },
      { time: '', category: '관광', title: '세비야 관광', notes: '세비야 대성당·히랄다 탑, 알카사르(왕궁), 황금의 탑, 스페인 광장' },
      { time: '21:00', category: '관광', title: '플라멩코 공연 관람', notes: '타블라오 엘 아레날 또는 라 카사 데 라 기타라 예약 권장' },
    ]},
    { date: '2026-08-03', activities: [
      { time: '', category: '관광', title: '산타크루즈 지구 관광', notes: '꽃으로 장식된 골목길, 도냐 엘비라 광장, 세비야 유대인 지구' },
      { time: '', category: '식사', title: '이른 점심식사', notes: '' },
      { time: '', category: '교통', title: '세비야 → 그라나다 기차 이동', notes: 'Avant/MD 기차 약 3시간' },
      { time: '', category: '관광', title: '그라나다 대성당 및 시내 관광', notes: '왕실 예배당(이사벨·페르난도 묘소), 알카이세리아 시장' },
      { time: '', category: '관광', title: '알함브라 궁전 야경 관람', notes: '알바이신 언덕 산니콜라스 전망대(Mirador de San Nicolás)에서 야경 추천' },
    ]},
    { date: '2026-08-04', activities: [
      { time: '09:00', category: '관광', title: '알함브라 궁전 투어', notes: '나스르 궁전(Nasrid Palaces) 입장 시간 엄수 — 온라인 사전 예약 필수 / 헤네랄리페 정원, 카를로스 5세 궁전 포함' },
      { time: '', category: '교통', title: '그라나다 → 발렌시아 기차 이동', notes: '코르도바 또는 마드리드 환승 — 약 5~7시간 (Renfe 예약 권장)' },
      { time: '', category: '숙박', title: '발렌시아 도착 후 숙소 체크인 및 휴식', notes: '' },
    ]},
    { date: '2026-08-05', activities: [
      { time: '', category: '관광', title: '발렌시아 시내 관광', notes: "발렌시아 대성당(성배 보관), 과학예술도시(L'Hemisfèric·Oceanogràfic), 실크거래소" },
      { time: '', category: '식사', title: '점심식사 — 정통 발렌시아 빠에야', notes: '발렌시아식 빠에야(Paella Valenciana) — 발원지에서 정통 맛 체험' },
      { time: '', category: '쇼핑', title: '센트럴 마켓(Mercado Central)에서 간식 구매', notes: '유럽 최대 재래시장 중 하나 — 과일, 하몬, 치즈 등' },
      { time: '', category: '관광', title: '말바로사 해변(Playa de la Malvarrosa) 방문', notes: '발렌시아 시내에서 트램으로 10분 — 지중해 해수욕' },
      { time: '', category: '식사', title: '말바로사 해변 근처 식당 저녁식사', notes: '아로스 알 오르노(오븐 쌀 요리) 또는 피데우아(파스타 빠에야) 추천' },
    ]},
    { date: '2026-08-06', activities: [
      { time: '', category: '교통', title: '첫차로 타라고나(Tarragona) 이동', notes: 'Renfe 기차 약 1시간 30분' },
      { time: '', category: '관광', title: '페라리랜드(PortAventura Ferrari Land) 방문', notes: '유럽 최고속 롤러코스터 레드 포스(Red Force) — 약 4~5시간 즐기기' },
      { time: '14:00', category: '교통', title: '타라고나 → 바르셀로나 출발', notes: 'Renfe 기차 약 1시간' },
      { time: '', category: '숙박', title: '바르셀로나 숙소 체크인', notes: '' },
      { time: '', category: '관광', title: '바르셀로나 야경 투어', notes: '람블라스 거리, 바르셀로네타 해변 야경, 매직 분수(Font Màgica) 쇼 확인' },
    ]},
    { date: '2026-08-07', activities: [
      { time: '08:00', category: '관광', title: '사그라다 파밀리아 대성당', notes: '가우디 미완성 걸작 — 내부 스테인드글라스 빛 체험 / 타워 입장 포함 온라인 예약 필수' },
      { time: '', category: '관광', title: '구엘 공원(Park Güell)', notes: '가우디 타일 모자이크 벤치, 도롱뇽 분수 — 방문 구역 사전 예약 필요' },
      { time: '', category: '관광', title: '까사 밀라(La Pedrera) · 까사 바뜨요(Casa Batlló)', notes: '가우디 투어 클라이맥스 — 두 건물 모두 내부 투어 가능, 야간 조명 투어도 추천' },
      { time: '', category: '식사', title: '점심식사', notes: '그라시아 거리 인근 카탈루냐 요리' },
      { time: '', category: '관광', title: '시우타데야 공원 & 바르셀로네타 해변', notes: '3주 여행 마무리 — 팀원들과 감상 나누며 사유하는 시간' },
      { time: '18:00', category: '식사', title: '이른 저녁식사', notes: '바르셀로나 마지막 식사 — 판 콘 토마테, 해산물 등 카탈루냐 요리' },
      { time: '20:50', category: '교통', title: '바르셀로나 공항 출발 — 귀국', notes: '아시아나항공 BCN→ICN / 다음날(8월 8일) 16:20 인천공항 도착' },
    ]},
  ];

  const trip = {
    id: lid(),
    title: TITLE,
    destination: '스페인 · 모로코',
    startDate: '2026-07-17',
    endDate: '2026-08-07',
    color: '#f0a060',
    days: days.map(d => ({ date: d.date, activities: d.activities.map(a => ({ id: lid(), ...a })) })),
  };

  existing.unshift(trip);
  localStorage.setItem('trips', JSON.stringify(existing));
}());
*/

// ── Firebase 참조 ──────────────────────────────────────────────────────────────
const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ── State ──────────────────────────────────────────────────────────────────────
let trips = [];
let currentUser = null;
let currentTripId = null;
let currentDayIndex = 0;
let editingTripId = null;
let editingActivityId = null;
let editingActivityDate = null;
let confirmCallback = null;
let selectedColor = '#c8f060';
let unsubscribeTrips = null;
let startPicker = null;
let endPicker = null;

// ── 유틸리티 ───────────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function generateShareCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

function getDays(start, end) {
  const days = [];
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

function fmtDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
}

function fmtShort(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ko-KR', {
    month: 'numeric', day: 'numeric',
  });
}

function fmtTab(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ko-KR', {
    month: 'numeric', day: 'numeric', weekday: 'short',
  });
}

const CATEGORIES = {
  '관광': { icon: '🏛️', color: '#c8f060' },
  '식사': { icon: '🍽️', color: '#f0a060' },
  '교통': { icon: '🚌', color: '#60a0f0' },
  '숙박': { icon: '🏨', color: '#c060f0' },
  '쇼핑': { icon: '🛍️', color: '#f060a0' },
  '기타': { icon: '📌', color: '#7a7a82' },
};

const CATEGORY_FIELDS = {
  '관광': [
    { key: 'address', label: '주소', icon: '📍', placeholder: '예: Calle Mayor 1, Madrid' },
    { key: 'openHours', label: '운영시간', icon: '🕐', placeholder: '예: 10:00 - 20:00' },
    { key: 'price', label: '입장료', icon: '💰', placeholder: '예: 15유로 (성인)' },
    { key: 'url', label: '관련 링크', icon: '🔗', placeholder: 'https://...' },
  ],
  '식사': [
    { key: 'address', label: '주소', icon: '📍', placeholder: '식당 주소' },
    { key: 'cuisine', label: '요리 종류', icon: '🍴', placeholder: '예: 스페인 타파스' },
    { key: 'price', label: '예상 가격', icon: '💰', placeholder: '예: 15-30유로' },
    { key: 'reservation', label: '예약 정보', icon: '📞', placeholder: '예약 시간 / 번호' },
  ],
  '교통': [
    { key: 'mode', label: '교통수단', icon: '🚌', placeholder: '예: 기차 / 비행기 / 버스' },
    { key: 'fromLocation', label: '출발지', icon: '🟢', placeholder: '예: 마드리드 아토차역' },
    { key: 'toLocation', label: '도착지', icon: '🔴', placeholder: '예: 사리아역' },
    { key: 'departTime', label: '출발 시각', icon: '🕐', placeholder: '예: 08:15' },
    { key: 'arriveTime', label: '도착 시각', icon: '🕓', placeholder: '예: 14:30' },
    { key: 'bookingNumber', label: '예약번호', icon: '🎫', placeholder: '티켓/편명/예약번호' },
    { key: 'price', label: '요금', icon: '💰', placeholder: '예: 65유로' },
  ],
  '숙박': [
    { key: 'address', label: '주소', icon: '📍', placeholder: '숙소 주소' },
    { key: 'checkIn', label: '체크인', icon: '🔑', placeholder: '예: 16:00' },
    { key: 'checkOut', label: '체크아웃', icon: '🚪', placeholder: '예: 11:00' },
    { key: 'bookingNumber', label: '예약번호', icon: '🎫', placeholder: '' },
    { key: 'price', label: '숙박료', icon: '💰', placeholder: '예: 45유로/박' },
    { key: 'url', label: '예약 사이트', icon: '🔗', placeholder: 'https://...' },
  ],
  '쇼핑': [
    { key: 'address', label: '주소', icon: '📍', placeholder: '' },
    { key: 'openHours', label: '영업시간', icon: '🕐', placeholder: '' },
    { key: 'items', label: '구매 품목', icon: '🛍️', placeholder: '예: 기념품, 식료품' },
  ],
  '기타': [
    { key: 'address', label: '위치', icon: '📍', placeholder: '' },
    { key: 'url', label: '관련 링크', icon: '🔗', placeholder: 'https://...' },
  ],
};

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderActivityFormFields(category, details = {}) {
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

function gatherActivityDetails(category) {
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

function mapEmbedUrl(query) {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}
function mapSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
function mapDirectionsUrl(from, to) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}`;
}

let detailContext = { activityId: null, date: null };

function openActivityDetail(activityId, date) {
  const trip = trips.find(t => t.id === currentTripId);
  const dayData = trip.days.find(d => d.date === date);
  const act = dayData?.activities.find(a => a.id === activityId);
  if (!act) return;
  detailContext = { activityId, date };

  const cat = CATEGORIES[act.category] || CATEGORIES['기타'];
  const badge = document.getElementById('detail-cat-badge');
  badge.textContent = `${cat.icon} ${act.category}`;
  badge.style.color = cat.color;
  badge.style.background = `color-mix(in srgb, ${cat.color} 14%, transparent)`;
  badge.style.border = `1px solid color-mix(in srgb, ${cat.color} 35%, transparent)`;

  document.getElementById('detail-title-text').textContent = act.title;
  document.getElementById('detail-time-text').textContent = act.time ? `⏰ ${act.time}` : '';

  const fields = CATEGORY_FIELDS[act.category] || [];
  const details = act.details || {};
  const fieldsEl = document.getElementById('detail-fields');
  const rows = fields
    .filter(f => details[f.key])
    .map(f => {
      const val = details[f.key];
      const isUrl = /^https?:\/\//i.test(val);
      const valHtml = isUrl
        ? `<a href="${escapeHtml(val)}" target="_blank" rel="noopener">${escapeHtml(val)}</a>`
        : escapeHtml(val);
      return `
        <div class="detail-field">
          <span class="detail-field-icon">${f.icon}</span>
          <span class="detail-field-label">${f.label}</span>
          <span class="detail-field-value">${valHtml}</span>
        </div>`;
    }).join('');
  fieldsEl.innerHTML = rows || `
    <div class="detail-field">
      <span class="detail-field-icon">📭</span>
      <span class="detail-field-label">정보</span>
      <span class="detail-field-value" style="color:var(--muted)">아직 상세 정보가 없습니다 — [수정]에서 추가할 수 있어요.</span>
    </div>`;

  // 메모
  const notesWrap = document.getElementById('detail-notes-wrap');
  if (act.notes) {
    notesWrap.style.display = 'block';
    document.getElementById('detail-notes-text').textContent = act.notes;
  } else {
    notesWrap.style.display = 'none';
  }

  // 지도
  const mapWrap = document.getElementById('detail-map-wrap');
  const mapFrame = document.getElementById('detail-map-frame');
  const mapBtn = document.getElementById('btn-open-map');
  let mapQuery = null;
  let openUrl = null;
  if (act.category === '교통' && details.fromLocation && details.toLocation) {
    mapQuery = `${details.fromLocation} to ${details.toLocation}`;
    openUrl = mapDirectionsUrl(details.fromLocation, details.toLocation);
  } else if (details.address) {
    mapQuery = details.address;
    openUrl = mapSearchUrl(details.address);
  } else if (details.fromLocation || details.toLocation) {
    mapQuery = details.fromLocation || details.toLocation;
    openUrl = mapSearchUrl(mapQuery);
  }
  if (mapQuery) {
    mapWrap.style.display = 'block';
    mapFrame.src = mapEmbedUrl(mapQuery);
    mapBtn.href = openUrl;
  } else {
    mapWrap.style.display = 'none';
    mapFrame.removeAttribute('src');
  }

  openModal('modal-activity-detail');
}

// ── 모달 헬퍼 ─────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  if (id === 'modal-trip') { startPicker?.close(); endPicker?.close(); }
}

// ── 토스트 ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => t.classList.add('toast-show'));
  });
  setTimeout(() => {
    t.classList.remove('toast-show');
    setTimeout(() => t.remove(), 300);
  }, 2500);
}

// ── Auth ──────────────────────────────────────────────────────────────────────
let authMode = 'login'; // 'login' | 'signup'

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === mode);
  });
  document.getElementById('auth-confirm-group').style.display = mode === 'signup' ? 'flex' : 'none';
  document.getElementById('auth-submit').textContent = mode === 'signup' ? '회원가입' : '로그인';
  document.getElementById('auth-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  document.getElementById('auth-error').textContent = '';
}

function authErrorMessage(err) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-email': '올바른 이메일 형식이 아닙니다.',
    'auth/missing-password': '비밀번호를 입력해주세요.',
    'auth/missing-email': '이메일을 입력해주세요.',
    'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
    'auth/email-already-in-use': '이미 가입된 이메일입니다.',
    'auth/user-not-found': '가입되지 않은 이메일입니다.',
    'auth/wrong-password': '비밀번호가 일치하지 않습니다.',
    'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
    'auth/too-many-requests': '시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
    'auth/popup-closed-by-user': '로그인 창이 닫혔습니다.',
    'auth/popup-blocked': '팝업이 차단되었습니다. 브라우저 설정을 확인해주세요.',
    'auth/network-request-failed': '네트워크 오류가 발생했습니다.',
    'auth/requires-recent-login': '보안을 위해 다시 로그인해주세요.',
    'auth/operation-not-allowed': '이메일/비밀번호 로그인이 Firebase 콘솔에서 비활성화되어 있어요. 콘솔 → Authentication → Sign-in method에서 활성화해주세요.',
    'auth/admin-restricted-operation': 'Firebase 관리자 설정으로 차단된 작업입니다.',
    'auth/unauthorized-domain': '현재 도메인이 Firebase 승인 도메인 목록에 없습니다. 콘솔 → Authentication → Settings → 승인된 도메인에 추가해주세요.',
  };
  if (map[code]) return map[code];
  if (code) return `[${code}] ${err?.message || ''}`.trim();
  return err?.message || '오류가 발생했습니다.';
}

async function signInWithGoogle() {
  try {
    await auth.signInWithPopup(googleProvider);
  } catch (err) {
    console.error(err);
    document.getElementById('auth-error').textContent = authErrorMessage(err);
  }
}

async function submitAuthForm(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const confirm = document.getElementById('auth-password-confirm').value;
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';

  if (!email) { errEl.textContent = '이메일을 입력해주세요.'; return; }
  if (!password) { errEl.textContent = '비밀번호를 입력해주세요.'; return; }

  if (authMode === 'signup') {
    if (password.length < 6) { errEl.textContent = '비밀번호는 6자 이상이어야 합니다.'; return; }
    if (password !== confirm) { errEl.textContent = '비밀번호가 일치하지 않습니다.'; return; }
  }

  const btn = document.getElementById('auth-submit');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '...';

  try {
    if (authMode === 'signup') {
      await auth.createUserWithEmailAndPassword(email, password);
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
  } catch (err) {
    console.error(err);
    errEl.textContent = authErrorMessage(err);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function signOutUser() {
  if (unsubscribeTrips) { unsubscribeTrips(); unsubscribeTrips = null; }
  closeUserMenu();
  await auth.signOut();
}

function showLoginScreen() {
  document.getElementById('login-overlay').classList.add('active');
  document.getElementById('user-info').style.display = 'none';
  setAuthMode('login');
  document.getElementById('form-auth').reset();
}

function showApp() {
  document.getElementById('login-overlay').classList.remove('active');
  document.getElementById('user-info').style.display = 'flex';
}

function updateUserUI(user) {
  const btn = document.getElementById('user-btn');
  const avatar = document.getElementById('user-avatar');
  const initial = document.getElementById('user-initial');
  const name = user.displayName || (user.email ? user.email.split('@')[0] : '사용자');

  if (user.photoURL) {
    avatar.src = user.photoURL;
    btn.classList.remove('no-avatar');
  } else {
    btn.classList.add('no-avatar');
    initial.textContent = name.charAt(0).toUpperCase();
  }

  document.getElementById('user-menu-name').textContent = name;
  document.getElementById('user-menu-email').textContent = user.email || '';
}

// ── 사용자 메뉴 ────────────────────────────────────────────────────────────────
function toggleUserMenu() {
  document.getElementById('user-menu').classList.toggle('active');
}

function closeUserMenu() {
  document.getElementById('user-menu').classList.remove('active');
}

// ── 회원탈퇴 ───────────────────────────────────────────────────────────────────
function openDeleteAccountModal() {
  closeUserMenu();
  const isPassword = currentUser.providerData.some(p => p.providerId === 'password');
  document.getElementById('reauth-password-group').style.display = isPassword ? 'flex' : 'none';
  document.getElementById('reauth-password').value = '';
  document.getElementById('delete-error').textContent = '';
  document.getElementById('form-delete-account').dataset.provider = isPassword ? 'password' : 'google';
  openModal('modal-delete-account');
}

async function reauthenticate(provider) {
  if (provider === 'password') {
    const password = document.getElementById('reauth-password').value;
    if (!password) throw { code: 'auth/missing-password' };
    const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, password);
    await currentUser.reauthenticateWithCredential(credential);
  } else {
    await currentUser.reauthenticateWithPopup(googleProvider);
  }
}

async function deleteOwnedTripsAndLeaveShared() {
  const ownedSnap = await db.collection('trips').where('ownerId', '==', currentUser.uid).get();
  const sharedSnap = await db.collection('trips')
    .where('memberIds', 'array-contains', currentUser.uid).get();

  const batch = db.batch();
  ownedSnap.forEach(doc => batch.delete(doc.ref));

  const ownedIds = new Set(ownedSnap.docs.map(d => d.id));
  sharedSnap.forEach(doc => {
    if (!ownedIds.has(doc.id)) {
      batch.update(doc.ref, {
        memberIds: firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
      });
    }
  });
  await batch.commit();
}

async function submitDeleteAccount(e) {
  e.preventDefault();
  const errEl = document.getElementById('delete-error');
  const btn = document.getElementById('btn-confirm-delete-account');
  const provider = document.getElementById('form-delete-account').dataset.provider;
  errEl.textContent = '';
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = '처리 중...';

  try {
    await reauthenticate(provider);
    if (unsubscribeTrips) { unsubscribeTrips(); unsubscribeTrips = null; }
    await deleteOwnedTripsAndLeaveShared();
    await currentUser.delete();
    closeModal('modal-delete-account');
    showToast('회원탈퇴가 완료되었습니다.');
  } catch (err) {
    console.error(err);
    errEl.textContent = authErrorMessage(err);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ── localStorage 마이그레이션 ──────────────────────────────────────────────────
async function migrateLegacyData(user) {
  const raw = localStorage.getItem('trips');
  if (!raw) return;
  let legacyTrips;
  try { legacyTrips = JSON.parse(raw); } catch { return; }
  if (!legacyTrips.length) return;

  const batch = db.batch();
  for (const trip of legacyTrips) {
    const ref = db.collection('trips').doc();
    batch.set(ref, {
      title: trip.title,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      color: trip.color,
      days: trip.days || [],
      ownerId: user.uid,
      memberIds: [user.uid],
      shareCode: generateShareCode(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  localStorage.removeItem('trips');
  localStorage.setItem('migrated', 'true');
  showToast(`${legacyTrips.length}개 여행을 클라우드로 이전했습니다 ✓`);
}

// ── 초대 링크 ─────────────────────────────────────────────────────────────────
async function handleJoinFromUrl() {
  const joinCode = new URLSearchParams(window.location.search).get('join');
  if (!joinCode) return;
  window.history.replaceState({}, '', window.location.pathname);

  try {
    const snap = await db.collection('trips').where('shareCode', '==', joinCode).limit(1).get();
    if (snap.empty) { showToast('유효하지 않은 초대 링크입니다.'); return; }

    const docRef = snap.docs[0].ref;
    const trip = snap.docs[0].data();
    if (trip.memberIds.includes(currentUser.uid)) {
      showToast('이미 참여 중인 여행입니다.'); return;
    }
    await docRef.update({ memberIds: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
    showToast(`"${trip.title}" 여행에 참여했습니다!`);
  } catch (err) {
    console.error(err);
    showToast('초대 링크 처리 중 오류가 발생했습니다.');
  }
}

async function copyShareLink(tripId) {
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return;
  const url = `${location.origin}${location.pathname}?join=${trip.shareCode}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast('초대 링크가 복사되었습니다!');
  } catch {
    prompt('아래 링크를 복사하세요:', url);
  }
}

// ── Firestore 실시간 구독 ──────────────────────────────────────────────────────
function subscribeToTrips() {
  if (unsubscribeTrips) unsubscribeTrips();
  unsubscribeTrips = db.collection('trips')
    .where('memberIds', 'array-contains', currentUser.uid)
    .onSnapshot(snapshot => {
      trips = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      renderTripList();
      if (currentTripId) {
        const trip = trips.find(t => t.id === currentTripId);
        if (trip) renderDayTabs(trip);
        else goBack();
      }
    }, err => console.error('Firestore 오류:', err));
}

// ── UI: 여행 목록 ──────────────────────────────────────────────────────────────
function renderTripList() {
  const grid = document.getElementById('trip-grid');
  const empty = document.getElementById('empty-state');

  if (trips.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = trips.map(trip => {
    const days = getDays(trip.startDate, trip.endDate);
    const totalActs = days.reduce((n, date) => {
      const day = trip.days.find(d => d.date === date);
      return n + (day ? day.activities.length : 0);
    }, 0);
    const members = trip.memberIds?.length ?? 1;
    return `
      <div class="trip-card" data-id="${trip.id}" style="--trip-color:${trip.color}">
        <div class="trip-card-top">
          <div class="trip-card-deco"></div>
          <p class="trip-card-dest">${trip.destination}</p>
          <h2 class="trip-card-name">${trip.title}</h2>
        </div>
        <div class="trip-card-bottom">
          <span class="trip-meta">${fmtShort(trip.startDate)} – ${fmtShort(trip.endDate)} · ${days.length}일 · ${totalActs}개</span>
          <span class="trip-members">👥 ${members}</span>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('click', () => openTrip(card.dataset.id));
  });
}

function openTrip(tripId) {
  currentTripId = tripId;
  currentDayIndex = 0;
  const trip = trips.find(t => t.id === tripId);
  if (!trip) return;

  document.getElementById('nav-breadcrumb').textContent = trip.title;
  document.getElementById('nav-back').style.display = 'inline-flex';
  document.getElementById('trip-dest-label').textContent = trip.destination;
  document.getElementById('trip-title-label').textContent = trip.title;
  document.getElementById('trip-dates-label').textContent =
    `${fmtShort(trip.startDate)} → ${fmtShort(trip.endDate)}  ·  ${getDays(trip.startDate, trip.endDate).length}일`;
  document.getElementById('trip-hero').style.setProperty('--trip-color', trip.color);
  document.getElementById('day-tabs').style.setProperty('--trip-color', trip.color);

  renderDayTabs(trip);
  document.getElementById('view-list').classList.remove('active');
  document.getElementById('view-trip').classList.add('active');
}

// ── UI: 날짜 탭 & 활동 ────────────────────────────────────────────────────────
function renderDayTabs(trip) {
  const days = getDays(trip.startDate, trip.endDate);
  const tabsEl = document.getElementById('day-tabs');

  tabsEl.innerHTML = days.map((date, i) => {
    const dayData = trip.days.find(d => d.date === date);
    const count = dayData ? dayData.activities.length : 0;
    return `
      <button class="day-tab${i === currentDayIndex ? ' active' : ''}" data-day="${i}">
        <span class="day-num">Day ${i + 1}</span>
        <span class="day-date">${fmtTab(date)}</span>
        ${count > 0 ? `<span class="day-count">${count}</span>` : ''}
      </button>`;
  }).join('');

  tabsEl.querySelectorAll('.day-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentDayIndex = parseInt(tab.dataset.day);
      renderDayTabs(trip);
    });
  });

  renderActivities(trip, days[currentDayIndex]);
}

function renderActivities(trip, date) {
  const panel = document.getElementById('activities-panel');
  const dayData = trip.days.find(d => d.date === date) || { date, activities: [] };
  const sorted = [...dayData.activities].sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });

  panel.innerHTML = `
    <div class="activities-header">
      <h2 class="activities-date">${fmtDate(date)}</h2>
      <button class="btn-primary btn-sm" id="btn-add-activity">+ 일정 추가</button>
    </div>
    <div class="timeline" id="timeline">
      ${sorted.length === 0
        ? `<div class="day-empty"><p>이 날의 일정이 없어요. 일정을 추가해보세요!</p></div>`
        : sorted.map(act => {
            const cat = CATEGORIES[act.category] || CATEGORIES['기타'];
            return `
              <div class="activity-item" data-id="${act.id}">
                <div class="activity-time">${act.time || '—'}</div>
                <div class="activity-dot" style="background:${cat.color}"></div>
                <div class="activity-body">
                  <div class="activity-header">
                    <span class="activity-cat" style="color:${cat.color}">${cat.icon} ${act.category}</span>
                    <div class="activity-btns">
                      <button class="icon-btn btn-edit-act" data-id="${act.id}" title="수정">✎</button>
                      <button class="icon-btn btn-del-act" data-id="${act.id}" title="삭제">✕</button>
                    </div>
                  </div>
                  <h3 class="activity-title">${act.title}</h3>
                  ${act.notes ? `<p class="activity-notes">${act.notes}</p>` : ''}
                </div>
              </div>`;
          }).join('')
      }
    </div>`;

  document.getElementById('btn-add-activity').addEventListener('click', () => openActivityModal(null, date));

  panel.querySelectorAll('.activity-body').forEach(body => {
    body.addEventListener('click', e => {
      if (e.target.closest('.icon-btn')) return;
      const item = body.closest('.activity-item');
      openActivityDetail(item.dataset.id, date);
    });
  });

  panel.querySelectorAll('.btn-edit-act').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); openActivityModal(btn.dataset.id, date); });
  });

  panel.querySelectorAll('.btn-del-act').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      confirmAction('이 일정을 삭제할까요?', () => deleteActivity(trip.id, date, btn.dataset.id));
    });
  });
}

// ── 여행 모달 ─────────────────────────────────────────────────────────────────
function openTripModal(tripId = null) {
  editingTripId = tripId;
  clearTripErrors();

  if (tripId) {
    const trip = trips.find(t => t.id === tripId);
    document.getElementById('modal-trip-heading').textContent = '여행 수정';
    document.getElementById('trip-name').value = trip.title;
    document.getElementById('trip-destination').value = trip.destination;
    document.getElementById('trip-start').value = trip.startDate;
    document.getElementById('trip-end').value = trip.endDate;
    selectedColor = trip.color;
  } else {
    document.getElementById('modal-trip-heading').textContent = '새 여행 추가';
    document.getElementById('form-trip').reset();
    selectedColor = '#c8f060';
  }

  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === selectedColor);
  });

  openModal('modal-trip');
  document.getElementById('trip-name').focus();
}

function clearTripErrors() {
  ['err-trip-name', 'err-trip-dest', 'err-trip-start', 'err-trip-end'].forEach(id => {
    document.getElementById(id).textContent = '';
  });
  ['trip-name', 'trip-destination', 'trip-start', 'trip-end'].forEach(id => {
    document.getElementById(id).classList.remove('invalid');
  });
}

async function saveTripForm(e) {
  e.preventDefault();
  clearTripErrors();

  const name = document.getElementById('trip-name').value.trim();
  const dest = document.getElementById('trip-destination').value.trim();
  const start = document.getElementById('trip-start').value;
  const end = document.getElementById('trip-end').value;

  let valid = true;
  if (!name) { showFieldError('trip-name', 'err-trip-name', '여행 이름을 입력해주세요'); valid = false; }
  if (!dest) { showFieldError('trip-destination', 'err-trip-dest', '목적지를 입력해주세요'); valid = false; }
  if (!start) { showFieldError('trip-start', 'err-trip-start', '출발일을 선택해주세요'); valid = false; }
  if (!end) { showFieldError('trip-end', 'err-trip-end', '도착일을 선택해주세요'); valid = false; }
  if (start && end && end < start) {
    showFieldError('trip-end', 'err-trip-end', '도착일은 출발일 이후여야 해요'); valid = false;
  }
  if (!valid) return;

  try {
    if (editingTripId) {
      await db.collection('trips').doc(editingTripId).update({
        title: name, destination: dest, startDate: start, endDate: end, color: selectedColor,
      });
    } else {
      await db.collection('trips').add({
        title: name, destination: dest, startDate: start, endDate: end, color: selectedColor,
        ownerId: currentUser.uid,
        memberIds: [currentUser.uid],
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

function showFieldError(inputId, errId, msg) {
  document.getElementById(inputId).classList.add('invalid');
  document.getElementById(errId).textContent = msg;
}

// ── 일정 모달 ─────────────────────────────────────────────────────────────────
function openActivityModal(activityId, date) {
  editingActivityId = activityId;
  editingActivityDate = date;
  document.getElementById('err-activity-title').textContent = '';
  document.getElementById('activity-title').classList.remove('invalid');

  let category = '관광';
  let details = {};

  if (activityId) {
    const trip = trips.find(t => t.id === currentTripId);
    const dayData = trip.days.find(d => d.date === date);
    const act = dayData?.activities.find(a => a.id === activityId);
    if (act) {
      document.getElementById('modal-activity-heading').textContent = '일정 수정';
      document.getElementById('activity-time').value = act.time || '';
      document.getElementById('activity-category').value = act.category;
      document.getElementById('activity-title').value = act.title;
      document.getElementById('activity-notes').value = act.notes || '';
      category = act.category;
      details = act.details || {};
    }
  } else {
    document.getElementById('modal-activity-heading').textContent = '일정 추가';
    document.getElementById('form-activity').reset();
  }

  renderActivityFormFields(category, details);
  openModal('modal-activity');
  document.getElementById('activity-title').focus();
}

async function saveActivityForm(e) {
  e.preventDefault();
  const title = document.getElementById('activity-title').value.trim();
  if (!title) {
    document.getElementById('activity-title').classList.add('invalid');
    document.getElementById('err-activity-title').textContent = '제목을 입력해주세요';
    return;
  }

  const time = document.getElementById('activity-time').value;
  const category = document.getElementById('activity-category').value;
  const notes = document.getElementById('activity-notes').value.trim();
  const details = gatherActivityDetails(category);
  const date = editingActivityDate;

  const trip = trips.find(t => t.id === currentTripId);
  const updatedDays = JSON.parse(JSON.stringify(trip.days));
  let dayData = updatedDays.find(d => d.date === date);
  if (!dayData) { dayData = { date, activities: [] }; updatedDays.push(dayData); }

  if (editingActivityId) {
    const act = dayData.activities.find(a => a.id === editingActivityId);
    if (act) { act.time = time; act.category = category; act.title = title; act.notes = notes; act.details = details; }
  } else {
    dayData.activities.push({ id: uid(), time, category, title, notes, details });
  }

  try {
    await db.collection('trips').doc(currentTripId).update({ days: updatedDays });
    closeModal('modal-activity');
  } catch (err) {
    console.error(err);
    showToast('저장에 실패했습니다. 다시 시도해주세요.');
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
async function deleteActivity(tripId, date, actId) {
  const trip = trips.find(t => t.id === tripId);
  const updatedDays = JSON.parse(JSON.stringify(trip.days));
  const dayData = updatedDays.find(d => d.date === date);
  if (dayData) dayData.activities = dayData.activities.filter(a => a.id !== actId);
  try {
    await db.collection('trips').doc(tripId).update({ days: updatedDays });
  } catch (err) {
    console.error(err);
    showToast('삭제에 실패했습니다.');
  }
}

async function deleteTrip(tripId) {
  try {
    await db.collection('trips').doc(tripId).delete();
    goBack();
  } catch (err) {
    console.error(err);
    showToast('삭제에 실패했습니다.');
  }
}

function confirmAction(message, callback) {
  confirmCallback = callback;
  document.getElementById('confirm-msg').textContent = message;
  openModal('modal-confirm');
}

function goBack() {
  currentTripId = null;
  document.getElementById('nav-breadcrumb').textContent = '';
  document.getElementById('nav-back').style.display = 'none';
  document.getElementById('view-trip').classList.remove('active');
  document.getElementById('view-list').classList.add('active');
}

// ── 이벤트 리스너 ─────────────────────────────────────────────────────────────
document.getElementById('btn-google-login').addEventListener('click', signInWithGoogle);
document.getElementById('form-auth').addEventListener('submit', submitAuthForm);
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => setAuthMode(tab.dataset.tab));
});
document.getElementById('user-btn').addEventListener('click', e => {
  e.stopPropagation();
  toggleUserMenu();
});
document.addEventListener('click', e => {
  const menu = document.getElementById('user-menu');
  if (menu.classList.contains('active') && !e.target.closest('.user-info')) closeUserMenu();
});
document.getElementById('btn-delete-account').addEventListener('click', openDeleteAccountModal);
document.getElementById('form-delete-account').addEventListener('submit', submitDeleteAccount);
document.getElementById('btn-logout').addEventListener('click', signOutUser);
document.getElementById('btn-new-trip').addEventListener('click', () => openTripModal());
document.getElementById('btn-new-trip-empty').addEventListener('click', () => openTripModal());
document.getElementById('nav-back').addEventListener('click', goBack);
document.getElementById('nav-logo').addEventListener('click', () => { if (currentTripId) goBack(); });
document.getElementById('btn-share-trip').addEventListener('click', () => copyShareLink(currentTripId));
document.getElementById('btn-edit-trip').addEventListener('click', () => openTripModal(currentTripId));
document.getElementById('btn-delete-trip').addEventListener('click', () => {
  confirmAction('이 여행을 삭제할까요? 모든 일정도 함께 삭제됩니다.', () => deleteTrip(currentTripId));
});

document.getElementById('form-trip').addEventListener('submit', saveTripForm);
document.getElementById('form-activity').addEventListener('submit', saveActivityForm);

document.getElementById('activity-category').addEventListener('change', e => {
  renderActivityFormFields(e.target.value, {});
});

document.getElementById('btn-edit-detail').addEventListener('click', () => {
  const ctx = { ...detailContext };
  closeModal('modal-activity-detail');
  openActivityModal(ctx.activityId, ctx.date);
});

document.getElementById('btn-delete-detail').addEventListener('click', () => {
  const ctx = { ...detailContext };
  confirmAction('이 일정을 삭제할까요?', async () => {
    closeModal('modal-activity-detail');
    await deleteActivity(currentTripId, ctx.date, ctx.activityId);
  });
});

document.getElementById('btn-confirm-ok').addEventListener('click', async () => {
  if (confirmCallback) { await confirmCallback(); confirmCallback = null; }
  closeModal('modal-confirm');
});

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['modal-confirm', 'modal-activity', 'modal-activity-detail', 'modal-trip', 'modal-delete-account'].forEach(id => {
    if (document.getElementById(id).classList.contains('active')) closeModal(id);
  });
});

document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedColor = btn.dataset.color;
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

['trip-name', 'trip-destination', 'trip-start', 'trip-end', 'activity-title'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => {
    document.getElementById(id).classList.remove('invalid');
  });
});

// ── 커스텀 캘린더 피커 ─────────────────────────────────────────────────────────
class DatePicker {
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

startPicker = new DatePicker(
  document.getElementById('trip-start'),
  document.getElementById('cal-btn-start'),
  { isEnd: false, getPartner: () => document.getElementById('trip-end').value }
);
endPicker = new DatePicker(
  document.getElementById('trip-end'),
  document.getElementById('cal-btn-end'),
  { isEnd: true, getPartner: () => document.getElementById('trip-start').value }
);
startPicker.options.partnerPicker = endPicker;
endPicker.options.partnerPicker = startPicker;

// ── Auth 상태 감지 ─────────────────────────────────────────────────────────────
auth.onAuthStateChanged(async user => {
  if (user) {
    currentUser = user;
    showApp();
    updateUserUI(user);
    await migrateLegacyData(user);
    subscribeToTrips();
    await handleJoinFromUrl();
  } else {
    currentUser = null;
    trips = [];
    currentTripId = null;
    if (unsubscribeTrips) { unsubscribeTrips(); unsubscribeTrips = null; }
    if (document.getElementById('view-trip').classList.contains('active')) goBack();
    renderTripList();
    showLoginScreen();
  }
});
