const CARDINAL_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeDegrees(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return ((value % 360) + 360) % 360;
}

export function getCardinalPoint(azimuth) {
  const normalized = normalizeDegrees(azimuth);
  const index = Math.round(normalized / 45) % CARDINAL_POINTS.length;
  return CARDINAL_POINTS[index];
}

export function buildSolarGeometryGuide(data) {
  const solarValid = Boolean(data?.solar?.valid);
  const sunElevation = Number(data?.solar?.elevation_deg);
  const sunAzimuth = normalizeDegrees(Number(data?.solar?.azimuth_deg));
  const measuredTilt = Number(data?.panel?.angle_measured_deg);
  const measuredRoll = Number(data?.panel?.roll_deg);
  const fallbackTarget = Number(data?.panel?.angle_target_deg);
  const targetTilt = solarValid && Number.isFinite(sunElevation)
    ? clamp(90 - sunElevation, 0, 90)
    : clamp(Number.isFinite(fallbackTarget) ? fallbackTarget : 0, 0, 90);
  const tiltDelta = targetTilt - (Number.isFinite(measuredTilt) ? measuredTilt : targetTilt);

  return {
    solarValid,
    sunAzimuth,
    sunElevation: Number.isFinite(sunElevation) ? sunElevation : null,
    targetAzimuth: sunAzimuth,
    targetTilt,
    measuredTilt: Number.isFinite(measuredTilt) ? measuredTilt : 0,
    measuredRoll: Number.isFinite(measuredRoll) ? measuredRoll : 0,
    tiltDelta,
    absoluteTiltDelta: Math.abs(tiltDelta),
    cardinal: getCardinalPoint(sunAzimuth),
  };
}
