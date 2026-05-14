import { getDeviceBaseUrl } from './heliosyncDevice';

const REQUEST_TIMEOUT_MS = 6000;

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

async function requestJson(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${stripTrailingSlash(getDeviceBaseUrl())}${path}`, {
      ...options,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(payload.error || `ESP32 returned ${response.status}`);
      error.payload = payload;
      throw error;
    }

    return payload;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function fetchDeviceSetupStatus() {
  return requestJson('/api/setup/status', { timeoutMs: 3500 });
}

export function submitDeviceWifi({ ssid, password }) {
  return requestJson('/api/setup/wifi', {
    method: 'POST',
    body: JSON.stringify({ ssid, password }),
  });
}

export function submitDeviceAccount({ email, password }) {
  return requestJson('/api/setup/account', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function submitDeviceLocation(location) {
  return requestJson('/api/setup/location', {
    method: 'POST',
    body: JSON.stringify({
      ...location,
      epoch_ms: Date.now(),
      timezone_offset_min: -new Date().getTimezoneOffset(),
    }),
  });
}

export function completeDeviceSetup() {
  return requestJson('/api/setup/complete', {
    method: 'POST',
    body: JSON.stringify({ complete: true }),
  });
}

export function isSetupComplete(status) {
  return Boolean(status?.setup_complete && status?.location?.set);
}
