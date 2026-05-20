import { getDeviceBaseUrl } from './heliosyncDevice';
import {
  buildDeviceAuthHeaders,
  clearDeviceSessionToken,
  storeDeviceSessionFromPayload,
} from './deviceAuth';

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
      credentials: 'same-origin',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...buildDeviceAuthHeaders(),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(payload.error || 'El panel no pudo completar esta acción.');
      error.payload = payload;
      throw error;
    }

    storeDeviceSessionFromPayload(payload);
    return payload;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function fetchDeviceAuthStatus() {
  return requestJson('/api/auth/status', { timeoutMs: 2500 });
}

export function signInDevicePortal({ username, password }) {
  return requestJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, epoch_ms: Date.now() }),
  });
}

export async function signOutDevicePortal() {
  try {
    return await requestJson('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
      timeoutMs: 2500,
    });
  } finally {
    clearDeviceSessionToken();
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

export function submitDeviceOperationMode({ mode, heltecMac }) {
  return requestJson('/api/setup/mode', {
    method: 'POST',
    body: JSON.stringify({
      mode,
      heltec_mac: heltecMac,
    }),
  });
}

export function continueDeviceSetupOffline() {
  return requestJson('/api/setup/offline', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function submitDeviceAccount({ email, password, syncCloud }) {
  return requestJson('/api/setup/account', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      sync_cloud: syncCloud,
      epoch_ms: Date.now(),
    }),
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

export function returnToDeviceOnboarding() {
  return requestJson('/api/setup/reset', {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 3000,
  }).catch(() => {
    // Si el firmware no soporta el endpoint aún, ignorar el error y redirigir igual
  });
}

export const resetDeviceSetup = returnToDeviceOnboarding;

export async function factoryResetDeviceStorage() {
  try {
    return await requestJson('/api/setup/factory-reset', {
      method: 'POST',
      body: JSON.stringify({}),
      timeoutMs: 5000,
    });
  } finally {
    clearDeviceSessionToken();
  }
}

export function requestDeviceSmartSleep() {
  return requestJson('/api/power/sleep', {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 2500,
  });
}

export function isSetupComplete(status) {
  return Boolean(status?.setup_complete && status?.location?.set);
}
