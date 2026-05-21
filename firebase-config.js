// ══════════════════════════════════════════════════════════════════════════════
//  Firebase 설정 파일
//  아래 단계를 따라 설정값을 채우세요.
//
//  ── 1단계: Firebase 프로젝트 생성 ────────────────────────────────────────────
//  https://console.firebase.google.com 에서 새 프로젝트를 만드세요.
//
//  ── 2단계: Firestore Database 생성 ───────────────────────────────────────────
//  왼쪽 메뉴 → Build → Firestore Database → 데이터베이스 만들기
//  → 프로덕션 모드 선택 → 리전 선택(asia-northeast3 = 서울) → 완료
//
//  ── 3단계: Google 로그인 활성화 ───────────────────────────────────────────────
//  왼쪽 메뉴 → Build → Authentication → 시작하기 → Sign-in method
//  → Google → 사용 설정 → 저장
//
//  ── 4단계: 웹 앱 등록 및 config 복사 ─────────────────────────────────────────
//  프로젝트 설정(⚙️) → 앱 추가 → 웹(</>)
//  → 앱 등록 → firebaseConfig 객체 복사 → 아래 YOUR_… 값에 붙여넣기
//
//  ── 5단계: Firestore 보안 규칙 설정 ──────────────────────────────────────────
//  Firestore → 규칙 탭 → 아래 규칙을 붙여넣고 [게시] 클릭:
//
//  rules_version = '2';
//  service cloud.firestore {
//    match /databases/{database}/documents {
//      match /trips/{tripId} {
//        // 멤버만 읽기·수정·삭제 가능
//        allow read, update, delete: if request.auth != null
//          && request.auth.uid in resource.data.memberIds;
//        // 로그인한 사용자라면 새 여행 생성 가능
//        allow create: if request.auth != null
//          && request.auth.uid == request.resource.data.ownerId;
//      }
//    }
//  }
// ══════════════════════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyBm-p8R8rw8_pSHFYNUkI0rJGWr31auMH4",
  authDomain: "santiago-ad621.firebaseapp.com",
  projectId: "santiago-ad621",
  storageBucket: "santiago-ad621.firebasestorage.app",
  messagingSenderId: "648967064974",
  appId: "1:648967064974:web:d56291036575641432e8df",
  measurementId: "G-29QM38P3B7"
};

firebase.initializeApp(firebaseConfig);

// ══════════════════════════════════════════════════════════════════════════════
//  Google Maps JavaScript API Key
//  ── 발급 방법 ────────────────────────────────────────────────────────────────
//  1. https://console.cloud.google.com 접속 → 프로젝트 선택(또는 새로 만들기)
//  2. 좌측 메뉴 → "API 및 서비스" → "라이브러리"
//     → 아래 3가지 API "사용 설정":
//        - Maps JavaScript API
//        - Geocoding API
//        - Places API (선택)
//  3. "사용자 인증 정보" → "사용자 인증 정보 만들기" → "API 키"
//  4. 생성된 키를 "키 제한"으로 보호:
//     - 애플리케이션 제한: HTTP 리퍼러
//        → 허용 사이트에 본인 도메인 추가
//          (예: localhost:*/* , https://yourdomain.com/*)
//     - API 제한: Maps JavaScript API, Geocoding API 만 허용
//  5. 결제 계정 등록 필수(무료 한도 월 10,000회 로드 안에선 과금 없음)
//  6. 예산 알림 설정 권장: 결제 → 예산 및 알림 → 월 $1 알림 추가
// ══════════════════════════════════════════════════════════════════════════════
window.GOOGLE_MAPS_API_KEY = "YOUR_GOOGLE_MAPS_API_KEY";
