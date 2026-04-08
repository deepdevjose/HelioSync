import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, MapPin, MoveHorizontal, SunMedium } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import LanguageToggle from '../ui/LanguageToggle';
import { useLocale } from '../../i18n/locale';

const AUTH_VISUAL_PIVOT = { x: 182, y: 128 };
const AUTH_VISUAL_RADIUS = 108;

function polarToPoint(cx, cy, radius, angleDeg) {
  const radians = (angleDeg * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(radians),
    y: cy - radius * Math.sin(radians),
  };
}

function orbitPoint(progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  const orbitAngle = 156 - clamped * 124;

  return polarToPoint(AUTH_VISUAL_PIVOT.x, AUTH_VISUAL_PIVOT.y, AUTH_VISUAL_RADIUS, orbitAngle);
}

function buildOrbitPath() {
  return Array.from({ length: 18 }, (_, index) => orbitPoint(index / 17))
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
}

function angleFromPoint(origin, point) {
  return (Math.atan2(origin.y - point.y, point.x - origin.x) * 180) / Math.PI;
}

function formatSignedDegrees(value) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}°`;
}

function AuthSolarTrajectory({ t }) {
  const [sunProgress, setSunProgress] = useState(0.76);
  const [panelAngle, setPanelAngle] = useState(44);

  useEffect(() => {
    let phase = 1.15;

    const intervalId = setInterval(() => {
      phase += 0.055;
      const nextProgress = Math.max(0.54, Math.min(0.9, 0.72 + Math.sin(phase) * 0.11 + Math.cos(phase * 0.44) * 0.04));
      const nextSunAngle = angleFromPoint(AUTH_VISUAL_PIVOT, orbitPoint(nextProgress));

      setSunProgress(nextProgress);
      setPanelAngle((current) => current + (nextSunAngle - current) * 0.16);
    }, 90);

    return () => clearInterval(intervalId);
  }, []);

  const sunPoint = orbitPoint(sunProgress);
  const sunAngle = Math.round(angleFromPoint(AUTH_VISUAL_PIVOT, sunPoint));
  const currentPanelTip = polarToPoint(AUTH_VISUAL_PIVOT.x, AUTH_VISUAL_PIVOT.y, 76, panelAngle);
  const targetPanelTip = polarToPoint(AUTH_VISUAL_PIVOT.x, AUTH_VISUAL_PIVOT.y, 92, sunAngle);
  const panelModulePoint = polarToPoint(AUTH_VISUAL_PIVOT.x, AUTH_VISUAL_PIVOT.y, 62, panelAngle);
  const adjustment = sunAngle - panelAngle;
  const isRepositioning = Math.abs(adjustment) > 2;
  const statusLabel = isRepositioning ? t('authShell.visualRepositioning') : t('authShell.visualAligned');
  const orbitPath = buildOrbitPath();

  const labels = [
    {
      key: 'sun',
      label: t('authShell.visualSun'),
      point: sunPoint,
      className: 'border-amber-200/22 bg-amber-300/12 text-amber-100',
      xOffset: 14,
      yOffset: -8,
    },
    {
      key: 'panel',
      label: t('authShell.visualPanel'),
      point: polarToPoint(AUTH_VISUAL_PIVOT.x, AUTH_VISUAL_PIVOT.y, 48, panelAngle),
      className: 'border-helium-300/18 bg-helium-300/10 text-helium-100',
      xOffset: -18,
      yOffset: -18,
    },
  ];

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(8,12,18,0.78),rgba(12,18,30,0.42))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-[32px] sm:px-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_80%,rgba(56,189,248,0.14),transparent_28%),radial-gradient(circle_at_84%_22%,rgba(251,191,36,0.18),transparent_24%)]" />
      <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-400">{t('authShell.visualEyebrow')}</div>
          <div className="text-sm font-medium text-white">{t('authShell.visualTitle')}</div>
        </div>

        <div className="flex w-full items-center gap-1 rounded-full border border-white/10 bg-black/28 p-1 sm:w-auto">
          <div className="rounded-full border border-white/8 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
            {t('authShell.visualStatic')}
          </div>
          <div className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-helium-300/22 bg-helium-300/12 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-helium-100 shadow-[0_0_18px_rgba(56,189,248,0.12)] sm:flex-none sm:justify-start">
            <span className="h-1.5 w-1.5 rounded-full bg-helium-200 shadow-[0_0_10px_rgba(125,211,252,0.6)]" />
            {t('authShell.visualTracking')}
          </div>
        </div>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(7,11,19,0.78),rgba(8,14,24,0.38))] px-2 py-3 sm:rounded-[28px] sm:px-3">
        <svg className="pointer-events-none h-[156px] w-full sm:h-[180px]" viewBox="0 0 360 180" fill="none" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="auth-solar-gradient" x1="94" y1="130" x2="286" y2="34" gradientUnits="userSpaceOnUse">
              <stop stopColor="rgba(125,211,252,0.12)" />
              <stop offset="0.5" stopColor="rgba(125,211,252,0.95)" />
              <stop offset="1" stopColor="rgba(251,191,36,0.78)" />
            </linearGradient>
            <linearGradient id="auth-panel-gradient" x1="140" y1="118" x2="244" y2="56" gradientUnits="userSpaceOnUse">
              <stop stopColor="rgba(56,189,248,0.95)" />
              <stop offset="1" stopColor="rgba(255,255,255,0.9)" />
            </linearGradient>
          </defs>
          <path className="auth-solar-trail" d={orbitPath} />
          <path className="auth-solar-path" d={orbitPath} stroke="url(#auth-solar-gradient)" />
          <line x1="52" y1="145" x2="320" y2="145" stroke="rgba(255,255,255,0.08)" />

          <line
            className="auth-solar-ray"
            x1={AUTH_VISUAL_PIVOT.x}
            y1={AUTH_VISUAL_PIVOT.y}
            x2={targetPanelTip.x}
            y2={targetPanelTip.y}
            stroke="rgba(251,191,36,0.82)"
            strokeWidth="1.7"
            strokeDasharray="4 8"
            strokeLinecap="round"
          />

          <line
            x1={AUTH_VISUAL_PIVOT.x}
            y1={AUTH_VISUAL_PIVOT.y}
            x2={currentPanelTip.x}
            y2={currentPanelTip.y}
            stroke="url(#auth-panel-gradient)"
            strokeWidth="4.4"
            strokeLinecap="round"
            filter="drop-shadow(0 0 10px rgba(125, 211, 252, 0.2))"
          />

          <rect
            x={panelModulePoint.x - 17}
            y={panelModulePoint.y - 4}
            width="34"
            height="8"
            rx="4"
            fill="rgba(148,163,184,0.92)"
            stroke="rgba(255,255,255,0.42)"
            transform={`rotate(${-panelAngle} ${panelModulePoint.x} ${panelModulePoint.y})`}
          />

          <circle cx={AUTH_VISUAL_PIVOT.x} cy={AUTH_VISUAL_PIVOT.y} r="6" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.28)" />
          <circle cx={AUTH_VISUAL_PIVOT.x} cy={AUTH_VISUAL_PIVOT.y} r="2.5" fill="rgba(255,255,255,0.82)" />
        </svg>

        {labels.map((item) => (
          <div
            key={item.key}
            className={`absolute hidden rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] shadow-[0_10px_20px_rgba(0,0,0,0.18)] sm:block ${item.className}`}
            style={{
              left: `calc(${(item.point.x / 360) * 100}% + ${item.xOffset}px)`,
              top: `calc(${(item.point.y / 180) * 100}% + ${item.yOffset}px)`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {item.label}
          </div>
        ))}

        <div
          className="absolute"
          style={{
            left: `${(sunPoint.x / 360) * 100}%`,
            top: `${(sunPoint.y / 180) * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="auth-solar-dot relative flex h-6 w-6 items-center justify-center rounded-full bg-[radial-gradient(circle,_#fff7cf,_#fbbf24)] shadow-[0_0_28px_rgba(251,191,36,0.48)]">
            <div className="auth-solar-pulse absolute inset-[-8px] rounded-full border border-amber-200/30" />
            <div className="h-2 w-2 rounded-full bg-white/90" />
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-helium-300/18 bg-helium-300/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-helium-100">
          <span className="h-1.5 w-1.5 rounded-full bg-helium-200" />
          {t('authShell.visualTrackingActive')}
        </div>
        <div className={`rounded-full border px-3 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${isRepositioning ? 'border-amber-200/18 bg-amber-300/10 text-amber-100' : 'border-emerald-200/18 bg-emerald-300/10 text-emerald-100'}`}>
          {statusLabel}
        </div>
      </div>

      <div className="relative z-10 mt-3 grid grid-cols-3 gap-2">
        {[
          { label: t('authShell.metricSunAngle'), value: `${sunAngle}°`, tone: 'text-amber-100' },
          { label: t('authShell.metricPanelAngle'), value: `${Math.round(panelAngle)}°`, tone: 'text-helium-100' },
          { label: t('authShell.metricAdjustment'), value: formatSignedDegrees(adjustment), tone: isRepositioning ? 'text-white' : 'text-emerald-100' },
        ].map((metric) => (
          <div key={metric.label} className="rounded-[18px] border border-white/[0.08] bg-black/18 px-2.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] sm:rounded-[20px] sm:px-3 sm:py-3">
            <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-slate-500 sm:text-[10px] sm:tracking-[0.18em]">{metric.label}</div>
            <div className={`mt-1.5 text-sm font-semibold sm:mt-2 sm:text-lg ${metric.tone}`}>{metric.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuthShell({ eyebrow, title, subtitle, children, footer }) {
  const { t } = useLocale();
  const productPoints = [
    {
      icon: Compass,
      title: t('authShell.point1Title'),
      body: t('authShell.point1Body'),
      badge: t('authShell.point1Badge'),
    },
    {
      icon: MoveHorizontal,
      title: t('authShell.point2Title'),
      body: t('authShell.point2Body'),
      badge: t('authShell.point2Badge'),
    },
    {
      icon: MapPin,
      title: t('authShell.point3Title'),
      body: t('authShell.point3Body'),
      badge: t('authShell.point3Badge'),
    },
  ];

  return (
    <div className="min-h-screen glass-mesh-bg px-3 py-4 sm:px-4 sm:py-6 md:px-8 md:py-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-7xl gap-4 sm:gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <GlassCard delay={0.05} className="order-2 relative flex min-h-[280px] flex-col justify-between gap-5 overflow-hidden border-white/[0.07] bg-slate-950/66 !p-5 shadow-[0_28px_70px_rgba(0,0,0,0.26)] sm:!p-6 md:!p-8 xl:order-1">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_20%,rgba(125,211,252,0.08),transparent_26%),radial-gradient(circle_at_82%_26%,rgba(251,191,36,0.08),transparent_22%)]" />

          <div className="relative z-10 space-y-5 sm:space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-300">
                <span className="h-2 w-2 rounded-full bg-helium-400 animate-pulse" />
                {t('common.brand')}
              </div>

              <LanguageToggle />
            </div>

            <div className="space-y-4 sm:space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/18 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-helium-200/90">
                <SunMedium className="h-3.5 w-3.5" />
                {t('authShell.heroKicker')}
              </div>

              <h1 className="m-0 max-w-xl text-[2rem] font-semibold tracking-[-0.06em] text-white sm:text-[2.65rem] md:text-[3.5rem] md:leading-[0.97] xl:text-[4.2rem] xl:leading-[0.95]">
                {t('authShell.heroTitle')}
              </h1>

              <p className="m-0 max-w-2xl text-sm leading-6 text-slate-300/88 sm:text-base sm:leading-7 md:text-[1.02rem]">
                {t('authShell.heroBody')}
              </p>
            </div>

            <AuthSolarTrajectory t={t} />
          </div>

          <div className="relative z-10 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {productPoints.map((point) => {
              const Icon = point.icon;

              return (
                <div key={point.title} className="rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(0,0,0,0.16))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:rounded-[26px] sm:p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-helium-300 shadow-[0_10px_24px_rgba(56,189,248,0.08)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="rounded-full border border-white/10 bg-black/24 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300">
                      {point.badge}
                    </div>
                  </div>
                  <div className="mt-3.5 h-px w-full bg-[linear-gradient(90deg,rgba(255,255,255,0.14),rgba(255,255,255,0))]" />
                  <div className="mt-3 text-[0.92rem] font-medium text-white sm:mt-3.5 sm:text-[0.95rem]">{point.title}</div>
                  <div className="mt-1.5 text-[13px] leading-5 text-slate-400/88">{point.body}</div>
                </div>
              );
            })}
          </div>
        </GlassCard>

        <div className="order-1 flex items-center xl:order-2 xl:pl-2">
          <GlassCard delay={0.12} className="relative w-full overflow-hidden border-helium-400/18 bg-slate-950/88 !p-5 shadow-[0_34px_90px_rgba(0,0,0,0.34),0_0_0_1px_rgba(125,211,252,0.05)] sm:!p-6 md:!p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(125,211,252,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.32),transparent)]" />

            <div className="relative z-10 space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">{eyebrow}</div>
              <h2 className="m-0 text-[1.8rem] font-semibold tracking-[-0.05em] text-white sm:text-3xl md:text-[2.2rem]">{title}</h2>
              <p className="m-0 max-w-xl text-sm leading-6 text-slate-400">{subtitle}</p>
            </div>

            <div className="relative z-10 mt-6 sm:mt-8">{children}</div>

            {footer ? (
              <div className="relative z-10 mt-6 border-t border-white/10 pt-4 text-sm text-slate-400">{footer}</div>
            ) : null}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

export function AuthInput({ label, hint, error, ...props }) {
  return (
    <label className="group block space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-200 transition-colors duration-200 group-focus-within:text-helium-100">{label}</span>
        {hint ? <span className="text-xs text-slate-500 transition-colors duration-200 group-focus-within:text-slate-300">{hint}</span> : null}
      </div>
      <input
        {...props}
        className={`w-full rounded-2xl border bg-black/20 px-4 py-3 text-white placeholder:text-slate-500 transition duration-200 hover:border-white/14 focus:bg-slate-950/78 focus:outline-none focus:ring-2 focus:ring-helium-500/28 focus:shadow-[0_0_0_1px_rgba(125,211,252,0.24),0_0_0_12px_rgba(56,189,248,0.1),0_16px_28px_rgba(0,0,0,0.18)] ${
          error ? 'border-rose-400/50 focus:border-rose-400/60' : 'border-white/10 focus:border-helium-500/50'
        } ${props.className || ''}`}
      />
      {error ? <div className="text-sm text-rose-200">{error}</div> : null}
    </label>
  );
}

export function AuthLinkRow({ prompt, label, to }) {
  return (
    <div className="text-sm text-slate-400">
      {prompt}{' '}
      <Link to={to} className="font-medium text-white transition hover:text-helium-300">
        {label}
      </Link>
    </div>
  );
}
