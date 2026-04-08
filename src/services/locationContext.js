const GEOCODING_API_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_API_URL = 'https://api.open-meteo.com/v1/forecast';

function normalizeApiLanguage(locale = 'en') {
  return locale.toLowerCase().startsWith('es') ? 'es' : 'en';
}

function buildLocationQuery(location = {}) {
  return [location.city, location.region, location.country]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
}

function getNumericCoordinate(value) {
  return Number.isFinite(value) ? value : Number.parseFloat(value);
}

function hasCoordinates(location = {}) {
  const latitude = getNumericCoordinate(location.latitude);
  const longitude = getNumericCoordinate(location.longitude);

  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function buildLocationLabel(location = {}) {
  const pieces = [location.city, location.region, location.country].filter(Boolean);

  if (pieces.length) {
    return pieces.join(', ');
  }

  if (hasCoordinates(location)) {
    return `${getNumericCoordinate(location.latitude).toFixed(2)}°, ${getNumericCoordinate(location.longitude).toFixed(2)}°`;
  }

  return '';
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const payload = await response.json();

  if (payload?.error) {
    throw new Error(payload.reason || 'API request failed');
  }

  return payload;
}

async function geocodeLocation(location = {}, locale = 'en', signal) {
  const query = buildLocationQuery(location);

  if (query.length < 2) {
    return null;
  }

  const params = new URLSearchParams({
    name: query,
    count: '1',
    language: normalizeApiLanguage(locale),
    format: 'json',
  });

  const payload = await fetchJson(`${GEOCODING_API_URL}?${params.toString()}`, signal);
  const result = payload?.results?.[0];

  if (!result) {
    return null;
  }

  return {
    source: location.source || 'manual',
    city: result.name || location.city || '',
    region: result.admin1 || location.region || '',
    country: result.country || location.country || '',
    latitude: result.latitude,
    longitude: result.longitude,
    label: buildLocationLabel({
      city: result.name || location.city || '',
      region: result.admin1 || location.region || '',
      country: result.country || location.country || '',
      latitude: result.latitude,
      longitude: result.longitude,
    }),
    timezone: result.timezone || '',
  };
}

async function fetchSolarContext(location = {}, signal) {
  const latitude = getNumericCoordinate(location.latitude);
  const longitude = getNumericCoordinate(location.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Missing coordinates');
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: 'auto',
    forecast_days: '1',
    current: 'temperature_2m,relative_humidity_2m',
    daily: 'sunrise,sunset,daylight_duration,shortwave_radiation_sum,uv_index_max',
  });

  const payload = await fetchJson(`${FORECAST_API_URL}?${params.toString()}`, signal);

  return {
    timezone: payload.timezone || payload.timezone_abbreviation || '',
    current: {
      temperature_2m: payload.current?.temperature_2m,
      relative_humidity_2m: payload.current?.relative_humidity_2m,
    },
    today: {
      sunrise: payload.daily?.sunrise?.[0] || '',
      sunset: payload.daily?.sunset?.[0] || '',
      daylight_duration: payload.daily?.daylight_duration?.[0],
      shortwave_radiation_sum: payload.daily?.shortwave_radiation_sum?.[0],
      uv_index_max: payload.daily?.uv_index_max?.[0],
    },
  };
}

export function isAbortError(error) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export async function resolveLocationContext(location = {}, locale = 'en', signal) {
  const resolvedLocation = hasCoordinates(location)
    ? {
        ...location,
        latitude: getNumericCoordinate(location.latitude),
        longitude: getNumericCoordinate(location.longitude),
        label: location.label || buildLocationLabel(location),
      }
    : await geocodeLocation(location, locale, signal);

  if (!resolvedLocation) {
    throw new Error('No location results');
  }

  const solarContext = await fetchSolarContext(resolvedLocation, signal);

  return {
    resolvedLocation,
    solarContext,
  };
}
