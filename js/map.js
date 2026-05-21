import { state } from './state.js';
import { db } from './firebase.js';
import { CATEGORIES } from './constants.js';
import { getDays, fmtDate, escapeHtml, showToast } from './utils.js';

// Day 색상 팔레트 (Day별 마커/동선 구분)
const DAY_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
];

let _mapsLoading = null;
let _mapInstance = null;
let _markers = [];
let _polylines = [];
let _infoWindow = null;
let _geoCache = new Map(); // "query" → {lat,lng}

// ── Google Maps JS API 동적 로드 ─────────────────────────────────────────────
function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (_mapsLoading) return _mapsLoading;
  const key = window.GOOGLE_MAPS_API_KEY;
  if (!key || key === 'YOUR_GOOGLE_MAPS_API_KEY') {
    return Promise.reject(new Error('NO_API_KEY'));
  }
  _mapsLoading = new Promise((resolve, reject) => {
    const cb = '__gmapsInit_' + Date.now();
    window[cb] = () => { resolve(window.google); delete window[cb]; };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=geocoding,marker&callback=${cb}&loading=async`;
    s.async = true;
    s.defer = true;
    s.onerror = () => { reject(new Error('LOAD_FAIL')); delete window[cb]; };
    document.head.appendChild(s);
  });
  return _mapsLoading;
}

// ── activity 에서 지도용 쿼리 문자열 추출 ────────────────────────────────────
function activityToQuery(act) {
  const d = act.details || {};
  if (d.address) return d.address;
  if (d.toLocation) return d.toLocation;   // 교통의 도착지를 대표 좌표로
  if (d.fromLocation) return d.fromLocation;
  return null;
}

// ── 좌표 조회: 활동 자체 캐시 → 메모리 캐시 → trip 캐시 → Geocoding ──────────
async function resolveCoord(trip, act, query, geocoder) {
  // 1. 활동에 좌표가 이미 저장돼 있으면 사용
  if (act.details?._coord?.lat) return act.details._coord;
  // 2. 메모리 캐시
  if (_geoCache.has(query)) return _geoCache.get(query);
  // 3. trip-level 캐시(_geoCache 필드)
  const tripCache = trip._geoCache || {};
  if (tripCache[query]) {
    _geoCache.set(query, tripCache[query]);
    return tripCache[query];
  }
  // 4. Geocoding API 호출
  try {
    const res = await new Promise((resolve, reject) => {
      geocoder.geocode({ address: query }, (results, status) => {
        if (status === 'OK' && results[0]) resolve(results[0].geometry.location);
        else reject(new Error(status));
      });
    });
    const coord = { lat: res.lat(), lng: res.lng() };
    _geoCache.set(query, coord);
    // Firestore 에 캐시 저장(중복 호출 방지)
    saveGeoCache(trip.id, query, coord).catch(() => {});
    return coord;
  } catch (err) {
    console.warn('[geocode fail]', query, err.message);
    return null;
  }
}

async function saveGeoCache(tripId, query, coord) {
  try {
    await db.collection('trips').doc(tripId).set(
      { _geoCache: { [query]: coord } },
      { merge: true }
    );
  } catch (_) {}
}

// ── 메인 렌더 ────────────────────────────────────────────────────────────────
export async function renderMapView() {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (!trip) return;

  const canvas = document.getElementById('map-canvas');
  const legend = document.getElementById('map-legend');
  canvas.innerHTML = `<div class="map-loading">지도를 불러오는 중…</div>`;
  legend.innerHTML = '';

  let google;
  try {
    google = await loadGoogleMaps();
  } catch (err) {
    if (err.message === 'NO_API_KEY') {
      canvas.innerHTML = `
        <div class="map-error">
          <p><strong>Google Maps API 키가 설정되지 않았습니다.</strong></p>
          <p><code>firebase-config.js</code> 파일을 열어 <code>window.GOOGLE_MAPS_API_KEY</code> 값을 발급받은 키로 교체해주세요.</p>
          <p>발급 방법은 같은 파일의 주석을 참고하세요.</p>
        </div>`;
    } else {
      canvas.innerHTML = `<div class="map-error"><p>지도를 불러오지 못했습니다.</p></div>`;
    }
    return;
  }

  // 캔버스 비우고 지도 생성
  canvas.innerHTML = '';
  _mapInstance = new google.maps.Map(canvas, {
    center: { lat: 36.5, lng: 127.8 }, // 임시 중심(이후 fitBounds로 덮어씀)
    zoom: 6,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: darkMapStyle,
  });
  _infoWindow = new google.maps.InfoWindow();
  _markers.forEach(m => m.setMap(null)); _markers = [];
  _polylines.forEach(p => p.setMap(null)); _polylines = [];

  const geocoder = new google.maps.Geocoder();
  const days = getDays(trip.startDate, trip.endDate);
  const bounds = new google.maps.LatLngBounds();
  let anyPlaced = false;
  const legendItems = [];

  // Day별 순서대로 처리
  for (let i = 0; i < days.length; i++) {
    const date = days[i];
    const dayData = trip.days.find(d => d.date === date);
    if (!dayData?.activities?.length) continue;

    const color = DAY_COLORS[i % DAY_COLORS.length];
    const sorted = [...dayData.activities].sort((a, b) =>
      (a.time || '').localeCompare(b.time || '')
    );

    const dayPath = [];
    let placedInDay = 0;

    for (const act of sorted) {
      const q = activityToQuery(act);
      if (!q) continue;
      const coord = await resolveCoord(trip, act, q, geocoder);
      if (!coord) continue;

      const cat = CATEGORIES[act.category] || CATEGORIES['기타'];
      const marker = new google.maps.Marker({
        position: coord,
        map: _mapInstance,
        title: act.title,
        label: { text: String(i + 1), color: '#fff', fontWeight: '700', fontSize: '12px' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
          scale: 12,
        },
      });
      marker.addListener('click', () => {
        _infoWindow.setContent(`
          <div style="font-family:inherit;min-width:180px;color:#222">
            <div style="font-size:12px;color:${color};font-weight:600">Day ${i + 1} · ${act.time || '시간 미정'}</div>
            <div style="font-weight:600;margin:2px 0">${escapeHtml(act.title)}</div>
            <div style="font-size:12px;color:#666">${cat.icon} ${act.category}</div>
            <div style="font-size:11px;color:#999;margin-top:4px">${escapeHtml(q)}</div>
          </div>`);
        _infoWindow.open({ map: _mapInstance, anchor: marker });
      });
      _markers.push(marker);
      bounds.extend(coord);
      dayPath.push(coord);
      placedInDay++;
      anyPlaced = true;
    }

    // Day별 동선(polyline)
    if (dayPath.length >= 2) {
      const pl = new google.maps.Polyline({
        path: dayPath,
        geodesic: true,
        strokeColor: color,
        strokeOpacity: 0.85,
        strokeWeight: 3,
        map: _mapInstance,
        icons: [{
          icon: { path: google.maps.SymbolPath.FORWARD_OPEN_ARROW, scale: 2.5 },
          offset: '50%',
        }],
      });
      _polylines.push(pl);
    }

    if (placedInDay > 0) {
      legendItems.push(`
        <div class="map-legend-item">
          <span class="map-legend-dot" style="background:${color}"></span>
          <span class="map-legend-label">Day ${i + 1}</span>
          <span class="map-legend-date">${fmtDate(date)}</span>
          <span class="map-legend-count">· ${placedInDay}곳</span>
        </div>`);
    }
  }

  if (!anyPlaced) {
    canvas.innerHTML = `
      <div class="map-error">
        <p><strong>지도에 표시할 장소가 없습니다.</strong></p>
        <p>일정의 상세에서 <strong>주소</strong> 또는 <strong>출발/도착</strong> 위치를 입력하면 자동으로 표시됩니다.</p>
      </div>`;
    return;
  }

  legend.innerHTML = legendItems.join('');
  _mapInstance.fitBounds(bounds, 60);
}

// 다크 테마(앱과 어울리는 스타일)
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f2937' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d1d5db' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a2e1a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#374151' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4b5563' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2d3748' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4b5563' }] },
];
