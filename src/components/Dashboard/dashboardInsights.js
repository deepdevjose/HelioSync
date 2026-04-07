import { formatLocaleNumber } from '../../i18n/locale';

const STATUS_META = {
  optimal: {
    key: 'statusOptimal',
    tone: 'positive',
  },
  attention: {
    key: 'statusAttention',
    tone: 'warning',
  },
  limited: {
    key: 'statusLowOutput',
    tone: 'warning',
  },
  lowLight: {
    key: 'statusLowLight',
    tone: 'neutral',
  },
  offline: {
    key: 'statusOffline',
    tone: 'danger',
  },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value, locale, digits = 0) {
  return formatLocaleNumber(locale, value, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function getExpectedPower(lux) {
  return clamp(8 + lux / 2000, 8, 40);
}

function isTrackingMode(panel) {
  return `${panel.tracking_mode || ''}`.trim().toUpperCase() === 'TRACKING';
}

function getModeLabel(panel, t) {
  if (isTrackingMode(panel)) {
    return t('insights.trackingMode');
  }

  return t('insights.staticMode');
}

function getTrackingStatus(panel, t) {
  if (!isTrackingMode(panel)) {
    return {
      supportLabel: t('insights.fixedOrientation'),
      heroLabel: t('insights.recommendedAlignmentApplied'),
    };
  }

  if (panel.servo_active || Math.abs(panel.angle_error_deg) > 2) {
    return {
      supportLabel: t('insights.repositioning'),
      heroLabel: t('insights.followingSunPath'),
    };
  }

  if (Math.abs(panel.angle_error_deg) > 0.6) {
    return {
      supportLabel: t('insights.trackingActive'),
      heroLabel: t('insights.trackingActive'),
    };
  }

  return {
    supportLabel: t('insights.alignedWithSun'),
    heroLabel: t('insights.alignedWithSun'),
  };
}

function getOutputState(power, lux, t) {
  const expected = getExpectedPower(lux);
  const ratio = expected > 0 ? power / expected : 0;

  if (lux < 12000) {
    return {
      label: t('insights.limitedByLight'),
      symbol: '↓',
      tone: 'neutral',
      reason: t('insights.lowSunlightReason'),
      ratio,
      expected,
    };
  }

  if (ratio < 0.65) {
    return {
      label: t('insights.belowExpected'),
      symbol: '↓',
      tone: 'warning',
      reason: t('insights.belowExpectedReason'),
      ratio,
      expected,
    };
  }

  if (ratio > 1.08) {
    return {
      label: t('insights.aboveTarget'),
      symbol: '↑',
      tone: 'positive',
      reason: t('insights.aboveTargetReason'),
      ratio,
      expected,
    };
  }

  return {
    label: t('insights.onTarget'),
    symbol: '→',
    tone: 'positive',
    reason: t('insights.onTargetReason'),
    ratio,
    expected,
  };
}

function getSystemState(status, panel, environment, outputState, t) {
  if (status === 'Offline') {
    return {
      label: t(`insights.${STATUS_META.offline.key}`),
      tone: STATUS_META.offline.tone,
      reason: t('insights.offlineReason'),
    };
  }

  if (!panel.gyro_stable || Math.abs(panel.angle_error_deg) > 1.5) {
    return {
      label: t(`insights.${STATUS_META.attention.key}`),
      tone: STATUS_META.attention.tone,
      reason: t('insights.attentionReason'),
    };
  }

  if (outputState.label === t('insights.belowExpected')) {
    return {
      label: t(`insights.${STATUS_META.limited.key}`),
      tone: STATUS_META.limited.tone,
      reason: environment.lux_bh1750 > 25000
        ? t('insights.lowOutputHealthySunReason')
        : t('insights.lowOutputCheckReason'),
    };
  }

  if (outputState.label === t('insights.limitedByLight')) {
    return {
      label: t(`insights.${STATUS_META.lowLight.key}`),
      tone: STATUS_META.lowLight.tone,
      reason: t('insights.lowLightSystemHealthyReason'),
    };
  }

  return {
    label: t(`insights.${STATUS_META.optimal.key}`),
    tone: STATUS_META.optimal.tone,
    reason: t('insights.optimalReason'),
  };
}

function getTrendSummary(history, simHour, currentPower, locale, t) {
  const parsed = history.map((entry) => ({
    ...entry,
    power_w: Number(entry.power_w),
  }));

  const peak = parsed.reduce(
    (best, entry) => (entry.power_w > best.power_w ? entry : best),
    parsed[0] ?? { time: '00:00', power_w: currentPower },
  );

  const currentIndex = clamp(Math.round(simHour), 0, Math.max(parsed.length - 1, 0));
  const currentPoint = parsed[currentIndex] ?? { power_w: currentPower, time: `${currentIndex}:00` };
  const previousPoint = parsed[Math.max(currentIndex - 1, 0)] ?? currentPoint;
  const delta = currentPoint.power_w - previousPoint.power_w;

  let direction = t('insights.steady');
  if (delta > 0.8) {
    direction = t('insights.rising');
  } else if (delta < -0.8) {
    direction = t('insights.falling');
  }

  return {
    direction,
    detail: t('insights.peakAround', { power: formatNumber(peak.power_w, locale, 1), time: peak.time }),
  };
}

function getSunlightMeaning(lux, t) {
  if (lux >= 55000) {
    return t('insights.sunlightHigh');
  }
  if (lux >= 25000) {
    return t('insights.sunlightBalanced');
  }
  if (lux >= 12000) {
    return t('insights.sunlightSoft');
  }
  return t('insights.sunlightLow');
}

function getTemperatureMeaning(temp, t) {
  if (temp >= 34) {
    return t('insights.temperatureWarm');
  }
  if (temp >= 18) {
    return t('insights.temperatureStable');
  }
  return t('insights.temperatureCool');
}

function getHumidityMeaning(humidity, t) {
  if (humidity >= 70) {
    return t('insights.humidityHigh');
  }
  if (humidity >= 35) {
    return t('insights.humidityComfortable');
  }
  return t('insights.humidityDry');
}

export function getToneClasses(tone) {
  switch (tone) {
    case 'positive':
      return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200';
    case 'warning':
      return 'border-amber-400/25 bg-amber-400/10 text-amber-200';
    case 'danger':
      return 'border-rose-400/25 bg-rose-400/10 text-rose-200';
    default:
      return 'border-white/10 bg-white/[0.06] text-slate-200';
  }
}

export function formatRelativeUpdate(lastUpdatedAt, locale, t, referenceTime = Date.now()) {
  const diffMs = referenceTime - lastUpdatedAt;
  const diffSeconds = Math.max(0, Math.round(diffMs / 1000));

  if (diffSeconds < 5) {
    return t('insights.updatedJustNow');
  }
  if (diffSeconds < 60) {
    return t('insights.updatedSecondsAgo', { value: formatNumber(diffSeconds, locale, 0) });
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) {
    return t('insights.updatedMinutesAgo', { value: formatNumber(diffMinutes, locale, 0) });
  }

  const diffHours = Math.round(diffMinutes / 60);
  return t('insights.updatedHoursAgo', { value: formatNumber(diffHours, locale, 0) });
}

export function getDashboardInsights(data, status, history, locale, t) {
  const outputState = getOutputState(data.electrical.power_w, data.environment.lux_bh1750, t);
  const systemState = getSystemState(status, data.panel, data.environment, outputState, t);
  const trend = getTrendSummary(history, data.simHour, data.electrical.power_w, locale, t);
  const trackingStatus = getTrackingStatus(data.panel, t);

  return {
    outputState,
    systemState,
    trend,
    supportMetrics: [
      {
        label: t('insights.voltage'),
        value: `${formatNumber(data.electrical.voltage_v, locale, 1)} V`,
      },
      {
        label: t('insights.current'),
        value: `${formatNumber(data.electrical.current_a, locale, 2)} A`,
      },
      {
        label: t('insights.tracking'),
        value: trackingStatus.supportLabel,
      },
    ],
    environment: [
      {
        key: 'sunlight',
        label: t('insights.sunlight'),
        value: `${formatNumber(data.environment.lux_bh1750, locale)} lx`,
        meaning: getSunlightMeaning(data.environment.lux_bh1750, t),
      },
      {
        key: 'temperature',
        label: t('insights.temperature'),
        value: `${formatNumber(data.environment.temp_c, locale, 1)}°C`,
        meaning: getTemperatureMeaning(data.environment.temp_c, t),
      },
      {
        key: 'humidity',
        label: t('insights.humidity'),
        value: `${formatNumber(data.environment.humidity_rh, locale, 1)}%`,
        meaning: getHumidityMeaning(data.environment.humidity_rh, t),
      },
    ],
    connectionLabel: status === 'ESP AP' ? t('insights.localLink') : status === 'Online' ? t('insights.liveLink') : t('insights.offlineLink'),
    locationLabel: data.meta.location,
    modeLabel: getModeLabel(data.panel, t),
    trackingLabel: trackingStatus.heroLabel,
  };
}
