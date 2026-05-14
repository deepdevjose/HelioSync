export const AUTH_REQUIRED = import.meta.env.VITE_REQUIRE_AUTH === 'true';

export const HELIOSYNC_DEVICE_URL =
  import.meta.env.VITE_HELIOSYNC_DEVICE_URL?.trim() || 'http://192.168.4.1';

export const HELIOSYNC_LATITUDE = Number(import.meta.env.VITE_HELIOSYNC_LATITUDE);
export const HELIOSYNC_LONGITUDE = Number(import.meta.env.VITE_HELIOSYNC_LONGITUDE);
export const REQUEST_DEVICE_GEOLOCATION =
  import.meta.env.VITE_HELIOSYNC_REQUEST_GEOLOCATION !== 'false';

export function isDevicePortalOrigin() {
  if (typeof window === 'undefined') {
    return false;
  }

  const { hostname } = window.location;
  return hostname === '192.168.4.1' || hostname.endsWith('.local');
}
