const DEVICE_SESSION_KEY = 'heliosync:device-session';

function getLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function getDeviceSessionToken() {
  return getLocalStorage()?.getItem(DEVICE_SESSION_KEY) || '';
}

export function setDeviceSessionToken(token) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  if (token) {
    storage.setItem(DEVICE_SESSION_KEY, token);
  } else {
    storage.removeItem(DEVICE_SESSION_KEY);
  }
}

export function clearDeviceSessionToken() {
  setDeviceSessionToken('');
}

export function storeDeviceSessionFromPayload(payload) {
  if (payload?.token) {
    setDeviceSessionToken(payload.token);
  }
}

export function buildDeviceAuthHeaders() {
  const token = getDeviceSessionToken();
  return token ? { 'X-HelioSync-Session': token } : {};
}
