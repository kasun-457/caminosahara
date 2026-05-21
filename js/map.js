import { state } from './state.js';
import { db } from './firebase.js';
import { CATEGORIES } from './constants.js';
import { getDays, fmtDate, escapeHtml } from './utils.js';

// Day 색상 팔레트
const DAY_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b',
];

let _mapsLoading = null;
let _mapInstance = null;
let _markers = [];     // { actId, marker, coord, dayIndex, color, act }
let _polylines = [];
let _infoWindow = null;
let _geoCache = new Map();

// ── Google Maps 동적 로드 ────────────────────────────────────────────────────
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
    s.async = true; s.defer = true;
    s.onerror = () => { reject(new Error('LOAD_FAIL')); delete window[cb]; };
    document.head.appendChild(s);
  });
  return _mapsLoading;
}

function activityToQuery(act) {
  const d = act.details || {};
  if (d.address) return d.address;
  if (d.toLocation) return d.toLocation;
  if (d.fromLocation) return d.fromLocation;
  return null;
}

async function resolveCoord(trip, act, query, geocoder) {
  if (act.details?._coord?.lat) return act.details._coord;
  if (_geoCache.has(query)) return _geoCache.get(query);
  const tripCache = trip._geoCache || {};
  if (tripCache[query]) {
    _geoCache.set(query, tripCache[query]);
    return tripCache[query];
  }
  try {
    const res = await new Promise((resolve, reject) => {
      geocoder.geocode({ address: query }, (results, status) => {
        if (status === 'OK' && results[0]) resolve(results[0].geometry.location);
        else reject(new Error(status));
      });
    });
    const coord = { lat: res.lat(), lng: res.lng() };
    _geoCache.set(query, coord);
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
      { _geoCache: { [query]: coord } }, { merge: true }
    );
  } catch (_) {}
}

// ── 우측 일정 패널 HTML 생성 ────────────────────────────────────────────────
function buildSidePaneHTML(trip, mappedActIds) {
  const days = getDays(trip.startDate, trip.endDate);
  let html = `<div class="map-side-header">
    <h3>전체 일정</h3>
    <span class="map-side-hint">📍 지도와 클릭 연동</span>
  </div>`;

  days.forEach((date, i) => {
    const dayData = trip.days.find(d => d.date === date);
    const acts = (dayData?.activities || []).slice().sort((a, b) =>
      (a.time || '').localeCompare(b.time || '')
    );
    if (!acts.length) return;
    const color = DAY_COLORS[i % DAY_COLORS.length];

    html += `<div class="map-day-block">
      <div class="map-day-header" style="--day-color:${color}">
        <span class="map-day-dot"></span>
        <span class="map-day-num">Day ${i + 1}</span>
        <span class="map-day-date">${fmtDate(date)}</span>
      </div>`;

    acts.forEach(act => {
      const cat = CATEGORIES[act.category] || CATEGORIES['기타'];
      const d = act.details || {};
      const place = d.address || d.toLocation || d.fromLocation || '';
      const hasMarker = mappedActIds.has(act.id);

      const priceLine = d.price ? `<div class="map-act-meta">💰 ${escapeHtml(d.price)}</div>` : '';
      const placeLine = place ? `<div class="map-act-meta">📍 ${escapeHtml(place)}</div>` : '';
      const notesLine = act.notes ? `<div class="map-act-meta map-act-notes">${escapeHtml(act.notes)}</div>` : '';

      html += `<div class="map-act-item${hasMarker ? ' clickable' : ' no-marker'}" data-act-id="${act.id}">
        <div class="map-act-time">${act.time || '—'}</div>
        <div class="map-act-body">
          <div class="map-act-head">
            <span class="map-act-cat" style="color:${cat.color}">${cat.icon} ${act.category}</span>
            <span class="map-act-title">${escapeHtml(act.title)}</span>
            ${hasMarker ? '<span class="map-act-pin">📍</span>' : ''}
          </div>
          ${placeLine}${priceLine}${notesLine}
        </div>
      </div>`;
    });

    html += `</div>`;
  });

  return html || `<div class="map-side-empty">일정이 없습니다.</div>`;
}

// ── 우측 패널 ↔ 지도 양방향 연동 ────────────────────────────────────────────
function bindSideToMap(side) {
  side.querySelectorAll('.map-act-item.clickable').forEach(el => {
    el.addEventListener('click', () => {
      const actId = el.dataset.actId;
      const entry = _markers.find(m => m.actId === actId);
      if (!entry) return;
      _mapInstance.panTo(entry.coord);
      if (_mapInstance.getZoom() < 13) _mapInstance.setZoom(14);
      openMarkerInfo(entry);
      highlightSideItem(actId, false); // 스크롤은 안 함(이미 그곳을 클릭함)
    });
  });
}

function highlightSideItem(actId, scroll = true) {
  const side = document.getElementById('map-side-pane');
  side.querySelectorAll('.map-act-item.active').forEach(e => e.classList.remove('active'));
  const el = side.querySelector(`.map-act-item[data-act-id="${actId}"]`);
  if (!el) return;
  el.classList.add('active');
  if (scroll) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function openMarkerInfo(entry) {
  const { marker, act, dayIndex, color } = entry;
  const cat = CATEGORIES[act.category] || CATEGORIES['기타'];
  const q = activityToQuery(act) || '';
  _infoWindow.setContent(`
    <div style="font-family:inherit;min-width:180px;max-width:260px;color:#222">
      <div style="font-size:12px;color:${color};font-weight:600">Day ${dayIndex + 1} · ${act.time || '시간 미정'}</div>
      <div style="font-weight:600;margin:2px 0">${escapeHtml(act.title)}</div>
      <div style="font-size:12px;color:#666">${cat.icon} ${act.category}</div>
      <div style="font-size:11px;color:#999;margin-top:4px">${escapeHtml(q)}</div>
    </div>`);
  _infoWindow.open({ map: _mapInstance, anchor: marker });
}

// ── 메인 렌더 ────────────────────────────────────────────────────────────────
export async function renderMapView() {
  const trip = state.trips.find(t => t.id === state.currentTripId);
  if (!trip) return;

  const canvas = document.getElementById('map-canvas');
  const legend = document.getElementById('map-legend');
  const side   = document.getElementById('map-side-pane');
  canvas.innerHTML = `<div class="map-loading">지도를 불러오는 중…</div>`;
  legend.innerHTML = '';
  side.innerHTML   = '';

  let google;
  try { google = await loadGoogleMaps(); }
  catch (err) {
    if (err.message === 'NO_API_KEY') {
      canvas.innerHTML = `
        <div class="map-error">
          <p><strong>Google Maps API 키가 설정되지 않았습니다.</strong></p>
          <p><code>firebase-config.js</code> 의 <code>window.GOOGLE_MAPS_API_KEY</code> 값을 설정해주세요.</p>
        </div>`;
    } else {
      canvas.innerHTML = `<div class="map-error"><p>지도를 불러오지 못했습니다.</p></div>`;
    }
    return;
  }

  canvas.innerHTML = '';
  _mapInstance = new google.maps.Map(canvas, {
    center: { lat: 36.5, lng: 127.8 },
    zoom: 6,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: darkMapStyle,
  });
  _infoWindow = new google.maps.InfoWindow();
  _markers.forEach(m => m.marker.setMap(null)); _markers = [];
  _polylines.forEach(p => p.setMap(null)); _polylines = [];

  const geocoder = new google.maps.Geocoder();
  const days = getDays(trip.startDate, trip.endDate);
  const bounds = new google.maps.LatLngBounds();
  const legendItems = [];
  let anyPlaced = false;

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

      const marker = new google.maps.Marker({
        position: coord,
        map: _mapInstance,
        title: act.title,
        label: { text: String(i + 1), color: '#fff', fontWeight: '700', fontSize: '12px' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: color, fillOpacity: 1,
          strokeColor: '#fff', strokeWeight: 2,
          scale: 12,
        },
      });
      const entry = { actId: act.id, marker, coord, dayIndex: i, color, act };
      marker.addListener('click', () => {
        openMarkerInfo(entry);
        highlightSideItem(act.id, true);
      });
      _markers.push(entry);
      bounds.extend(coord);
      dayPath.push(coord);
      placedInDay++;
      anyPlaced = true;
    }

    if (dayPath.length >= 2) {
      _polylines.push(new google.maps.Polyline({
        path: dayPath, geodesic: true,
        strokeColor: color, strokeOpacity: 0.85, strokeWeight: 3,
        map: _mapInstance,
        icons: [{
          icon: { path: google.maps.SymbolPath.FORWARD_OPEN_ARROW, scale: 2.5 },
          offset: '50%',
        }],
      }));
    }

    if (placedInDay > 0) {
      legendItems.push(`
        <div class="map-legend-item">
          <span class="map-legend-dot" style="background:${color}"></span>
          <span class="map-legend-label">Day ${i + 1}</span>
          <span class="map-legend-count">· ${placedInDay}곳</span>
        </div>`);
    }
  }

  // 우측 패널은 항상 렌더 (지도에 안 찍힌 일정도 목록에 포함)
  const mappedIds = new Set(_markers.map(m => m.actId));
  side.innerHTML = buildSidePaneHTML(trip, mappedIds);
  bindSideToMap(side);

  if (!anyPlaced) {
    canvas.innerHTML = `
      <div class="map-error">
        <p><strong>지도에 표시할 장소가 없습니다.</strong></p>
        <p>일정 상세에 <strong>주소</strong> 또는 <strong>출발/도착 위치</strong>를 입력하면 자동으로 표시됩니다.</p>
      </div>`;
    return;
  }

  legend.innerHTML = legendItems.join('');
  _mapInstance.fitBounds(bounds, 60);
}

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
