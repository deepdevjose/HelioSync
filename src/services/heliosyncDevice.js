import {
  HELIOSYNC_DEVICE_URL,
  HELIOSYNC_LATITUDE,
  HELIOSYNC_LONGITUDE,
  REQUEST_DEVICE_GEOLOCATION,
} from '../config/runtime';

const DEFAULT_NODE_ID = 'esp32-prototype';
const HISTORY_LIMIT = 48;
const REQUEST_TIMEOUT_MS = 2500;
const STALE_AFTER_MS = 9000;

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function getCurrentOriginFallback() {
  if (typeof window === 'undefined') {
    return HELIOSYNC_DEVICE_URL;
  }

  const { hostname, origin } = window.location;
  if (hostname === '192.168.4.1' || hostname.endsWith('.local')) {
    return origin;
  }

  return HELIOSYNC_DEVICE_URL;
}

export function getDeviceBaseUrl() {
  return stripTrailingSlash(getCurrentOriginFallback());
}

export function getDeviceWebSocketUrl(baseUrl = getDeviceBaseUrl()) {
  const url = new URL('/ws', baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function toNumber(value, fallback = 0, options = {}) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (options.rejectSentinel && (parsed <= -900 || parsed === -1)) {
    return fallback;
  }

  return parsed;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 1 || value === '1' || value === 'true') {
    return true;
  }

  if (value === 0 || value === '0' || value === 'false') {
    return false;
  }

  return fallback;
}

function normalizeDegrees(value, fallback = 0) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= -900 || parsed === -1) {
    return fallback;
  }

  return ((parsed % 360) + 360) % 360;
}

function getHourFromTimestamp(timestamp) {
  if (!timestamp) {
    return null;
  }

  const match = `${timestamp}`.match(/T(\d{2}):/);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function getLocationLabel(raw, previous) {
  const label = raw?.meta?.location;
  if (label) {
    return label;
  }

  const lat = Number(raw?.gps?.lat);
  const lon = Number(raw?.gps?.lon);
  if (raw?.gps?.set && Number.isFinite(lat) && Number.isFinite(lon)) {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }

  return previous?.meta?.location || 'HelioSync ESP32';
}

function getTimestamp(raw, previous) {
  return raw?.meta?.timestamp || raw?.ts || previous?.meta?.timestamp || new Date().toISOString();
}

function getTrackingMode(raw, solarValid, previous) {
  const rawMode = raw?.panel?.tracking_mode || raw?.meta?.mode;
  if (rawMode) {
    return `${rawMode}`.toUpperCase();
  }

  if (solarValid) {
    return 'TRACKING';
  }

  return previous?.panel?.tracking_mode || 'STATIC';
}

function getGpsFromSetup(userSetup) {
  const latitude = Number(userSetup?.location?.latitude);
  const longitude = Number(userSetup?.location?.longitude);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { lat: latitude, lon: longitude };
  }

  if (Number.isFinite(HELIOSYNC_LATITUDE) && Number.isFinite(HELIOSYNC_LONGITUDE)) {
    return { lat: HELIOSYNC_LATITUDE, lon: HELIOSYNC_LONGITUDE };
  }

  return null;
}

export function normalizeDevicePayload(raw = {}, previous = {}) {
  const timestamp = getTimestamp(raw, previous);
  const solarValid = toBoolean(raw?.solar?.valid, false);
  const measuredAngle = toNumber(
    raw?.panel?.angle_measured_deg ?? raw?.panel?.pitch_deg,
    previous?.panel?.angle_measured_deg ?? 0,
    { rejectSentinel: true },
  );
  const targetAngle = toNumber(
    raw?.panel?.angle_target_deg ?? raw?.panel?.target_deg,
    previous?.panel?.angle_target_deg ?? measuredAngle,
    { rejectSentinel: true },
  );
  const angleError = toNumber(
    raw?.panel?.angle_error_deg ?? raw?.panel?.error_deg,
    targetAngle - measuredAngle,
  );
  const hour = toNumber(
    raw?.simHour ?? raw?.hour ?? getHourFromTimestamp(timestamp),
    previous?.simHour ?? new Date().getHours(),
  );

  return {
    seq: toNumber(raw?.seq, previous?.seq ?? 0),
    simHour: hour,
    meta: {
      project: raw?.meta?.project || previous?.meta?.project || 'HelioSync',
      nodeId:
        raw?.meta?.nodeId ||
        raw?.meta?.node_id ||
        raw?.diagnostics?.ap_ssid ||
        previous?.meta?.nodeId ||
        DEFAULT_NODE_ID,
      location: getLocationLabel(raw, previous),
      mode: raw?.meta?.mode || previous?.meta?.mode || 'esp32-live',
      timestamp,
    },
    environment: {
      temp_c: toNumber(
        raw?.environment?.temp_c,
        previous?.environment?.temp_c ?? 0,
        { rejectSentinel: true },
      ),
      humidity_rh: toNumber(
        raw?.environment?.humidity_rh ?? raw?.environment?.humidity,
        previous?.environment?.humidity_rh ?? 0,
        { rejectSentinel: true },
      ),
      lux_bh1750: toNumber(
        raw?.environment?.lux_bh1750 ?? raw?.environment?.lux,
        previous?.environment?.lux_bh1750 ?? 0,
        { rejectSentinel: true },
      ),
    },
    panel: {
      angle_target_deg: targetAngle,
      angle_measured_deg: measuredAngle,
      angle_error_deg: angleError,
      roll_deg: toNumber(
        raw?.panel?.roll_deg ?? raw?.panel?.angle_roll_deg,
        previous?.panel?.roll_deg ?? 0,
        { rejectSentinel: true },
      ),
      azimuth_deg: normalizeDegrees(
        raw?.panel?.azimuth_deg ?? raw?.panel?.heading_deg ?? raw?.panel?.yaw_deg,
        previous?.panel?.azimuth_deg ?? 180,
      ),
      gyro_stable: toBoolean(raw?.panel?.gyro_stable ?? raw?.panel?.mpu_ok, true),
      servo_active: toBoolean(raw?.panel?.servo_active, false),
      tracking_mode: getTrackingMode(raw, solarValid, previous),
    },
    electrical: {
      voltage_v: toNumber(
        raw?.electrical?.voltage_v,
        previous?.electrical?.voltage_v ?? 0,
        { rejectSentinel: true },
      ),
      current_a: toNumber(
        raw?.electrical?.current_a,
        previous?.electrical?.current_a ?? 0,
        { rejectSentinel: true },
      ),
      power_w: toNumber(
        raw?.electrical?.power_w,
        previous?.electrical?.power_w ?? 0,
        { rejectSentinel: true },
      ),
    },
    diagnostics: {
      simulation: false,
      profile: raw?.diagnostics?.profile || raw?.diagnostics?.ap_ssid || 'esp32_live',
      uptime_s: toNumber(raw?.diagnostics?.uptime_s, previous?.diagnostics?.uptime_s ?? 0),
      free_heap: toNumber(raw?.diagnostics?.free_heap, previous?.diagnostics?.free_heap ?? 0),
      ntp_ready: toBoolean(raw?.diagnostics?.ntp_ready, previous?.diagnostics?.ntp_ready ?? false),
      ws_clients: toNumber(raw?.diagnostics?.ws_clients, previous?.diagnostics?.ws_clients ?? 0),
      ap_ssid: raw?.diagnostics?.ap_ssid || previous?.diagnostics?.ap_ssid || '',
    },
    solar: {
      azimuth_deg: toNumber(raw?.solar?.azimuth_deg, previous?.solar?.azimuth_deg ?? 180, {
        rejectSentinel: true,
      }),
      elevation_deg: toNumber(raw?.solar?.elevation_deg, previous?.solar?.elevation_deg ?? 30, {
        rejectSentinel: true,
      }),
      valid: solarValid,
    },
    alert: {
      active: toBoolean(raw?.alert?.active, previous?.alert?.active ?? false),
      message: raw?.alert?.message || previous?.alert?.message || '',
      error_deg: toNumber(raw?.alert?.error_deg, angleError),
    },
    storage: {
      days_stored: toNumber(raw?.storage?.days_stored, previous?.storage?.days_stored ?? 0),
      used_kb: toNumber(raw?.storage?.used_kb, previous?.storage?.used_kb ?? 0),
      max_kb: toNumber(raw?.storage?.max_kb, previous?.storage?.max_kb ?? 0),
      used_percent: toNumber(raw?.storage?.used_percent, previous?.storage?.used_percent ?? 0),
      near_full: toBoolean(raw?.storage?.near_full, previous?.storage?.near_full ?? false),
      retention_days: toNumber(raw?.storage?.retention_days, previous?.storage?.retention_days ?? 30),
      cloud_ready: toBoolean(raw?.storage?.cloud_ready, previous?.storage?.cloud_ready ?? false),
    },
  };
}

export function buildHistoryPoint(telemetry) {
  const timestamp = telemetry?.meta?.timestamp;
  const date = timestamp ? new Date(timestamp) : new Date();
  const validDate = Number.isFinite(date.getTime()) ? date : new Date();

  return {
    time: validDate.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
    power_w: Number((telemetry?.electrical?.power_w ?? 0).toFixed(2)),
  };
}

export function appendLiveHistory(history, telemetry) {
  const nextPoint = buildHistoryPoint(telemetry);
  const lastPoint = history.at(-1);
  const withoutDuplicate =
    lastPoint?.time === nextPoint.time ? history.slice(0, -1) : history;

  return [...withoutDuplicate, nextPoint].slice(-HISTORY_LIMIT);
}

export function isDeviceStale(lastSeenAt) {
  return !lastSeenAt || Date.now() - lastSeenAt > STALE_AFTER_MS;
}

export async function fetchLatestDevicePayload(baseUrl = getDeviceBaseUrl()) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${stripTrailingSlash(baseUrl)}/data`, {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ESP32 returned ${response.status}`);
    }

    return response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function postDeviceGps(baseUrl, gps) {
  if (!gps || !isFiniteNumber(gps.lat) || !isFiniteNumber(gps.lon)) {
    return;
  }

  await fetch(`${stripTrailingSlash(baseUrl)}/gps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withBrowserTime(gps)),
  });
}

export function sendGpsOverWebSocket(socket, gps) {
  if (!gps || !socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(withBrowserTime(gps)));
}

function withBrowserTime(gps) {
  if (!gps) {
    return null;
  }

  return {
    ...gps,
    epoch_ms: Date.now(),
    timezone_offset_min: -new Date().getTimezoneOffset(),
  };
}

export function resolveGpsPayload(userSetup) {
  const configuredGps = getGpsFromSetup(userSetup);

  if (!REQUEST_DEVICE_GEOLOCATION || typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(withBrowserTime(configuredGps));
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => resolve(configuredGps),
      {
        enableHighAccuracy: false,
        maximumAge: 10 * 60 * 1000,
        timeout: 4000,
      },
    );
  }).then(withBrowserTime);
}
