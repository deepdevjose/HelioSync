function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const COPY = {
  'es-MX': {
    yourSite: 'tu sitio',
    trueSouth: 'sur verdadero',
    trueNorth: 'norte verdadero',
    northSunPath: 'A tu latitud, el sol cruza el lado sur del cielo.',
    southSunPath: 'A tu latitud, el sol cruza el lado norte del cielo.',
    staticSummary: 'Orienta el panel hacia {direction} con una inclinación inicial cercana a {tilt}°.',
    staticReason: '{sunPath} Así, un panel fijo queda mejor alineado con la parte más fuerte de la trayectoria solar diaria.',
    axisNote: 'Si activas seguimiento después, alinea el eje de rotación norte-sur para que el panel siga al sol de este a oeste.',
    trackingSummary: 'HelioSync calculará la trayectoria del sol para {label} y mantendrá el panel alineado con seguimiento de eje único.',
    trackingDetail: 'El sistema usa tu ubicación para estimar amanecer, atardecer y el arco solar del día, y hace ajustes suaves de alineación en lugar de depender solo de una orientación fija.',
    trackingAxisNote: 'Alineación recomendada del eje: norte-sur. Así el panel puede seguir la trayectoria este-oeste con un movimiento simple y estable.',
  },
  en: {
    yourSite: 'your site',
    trueSouth: 'true south',
    trueNorth: 'true north',
    northSunPath: 'The sun crosses the southern side of the sky at your latitude.',
    southSunPath: 'The sun crosses the northern side of the sky at your latitude.',
    staticSummary: 'Aim the panel toward {direction} with a starting tilt near {tilt}°.',
    staticReason: '{sunPath} This keeps a fixed panel aligned with the strongest part of the daily sun path.',
    axisNote: 'If you enable tracking later, keep the rotation axis aligned north-south so the panel can follow the sun from east to west.',
    trackingSummary: 'HelioSync will calculate the sun path for {label} and keep the panel aligned through single-axis tracking.',
    trackingDetail: 'The system uses your location to estimate sunrise, sunset and the daily solar arc, then makes smooth alignment adjustments instead of relying on a fixed orientation alone.',
    trackingAxisNote: 'Recommended axis alignment: north-south. This lets the panel follow the east-west solar path while keeping motion simple and stable.',
  },
};

function getCopy(locale = 'en') {
  return COPY[locale] || COPY.en;
}

function interpolate(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ''));
}

export function buildLocationLabel(location = {}, locale = 'en') {
  const copy = getCopy(locale);
  const pieces = [location.city, location.region, location.country].filter(Boolean);

  if (pieces.length) {
    return pieces.join(', ');
  }

  if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
    return `${location.latitude.toFixed(2)}°, ${location.longitude.toFixed(2)}°`;
  }

  return copy.yourSite;
}

export function getStaticOrientationRecommendation(location = {}, locale = 'en') {
  const copy = getCopy(locale);
  const latitude = Number(location.latitude);
  const hasLatitude = Number.isFinite(latitude);
  const hemisphere = hasLatitude ? (latitude >= 0 ? 'north' : 'south') : 'north';
  const facingDirection = hemisphere === 'north' ? copy.trueSouth : copy.trueNorth;
  const tilt = hasLatitude ? clamp(Math.round(Math.abs(latitude) * 0.9), 10, 55) : 28;
  const azimuth = hemisphere === 'north' ? 180 : 0;
  const sunPath =
    hemisphere === 'north'
      ? copy.northSunPath
      : copy.southSunPath;

  return {
    facingDirection,
    azimuth,
    tilt,
    summary: interpolate(copy.staticSummary, { direction: facingDirection, tilt }),
    reason: interpolate(copy.staticReason, { sunPath }),
    axisNote: copy.axisNote,
  };
}

export function getTrackingRecommendation(location = {}, locale = 'en') {
  const copy = getCopy(locale);
  const label = buildLocationLabel(location, locale);
  const staticRecommendation = getStaticOrientationRecommendation(location, locale);

  return {
    summary: interpolate(copy.trackingSummary, { label }),
    detail: copy.trackingDetail,
    axisNote: copy.trackingAxisNote,
    fallbackOrientation: staticRecommendation.summary,
  };
}
