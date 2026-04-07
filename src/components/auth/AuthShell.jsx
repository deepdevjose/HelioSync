import { Link } from 'react-router-dom';
import { Compass, MapPin, SunMedium } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import LanguageToggle from '../ui/LanguageToggle';
import { useLocale } from '../../i18n/locale';

export default function AuthShell({ eyebrow, title, subtitle, children, footer }) {
  const { t } = useLocale();
  const productPoints = [
    {
      icon: Compass,
      title: t('authShell.point1Title'),
      body: t('authShell.point1Body'),
    },
    {
      icon: MapPin,
      title: t('authShell.point2Title'),
      body: t('authShell.point2Body'),
    },
    {
      icon: SunMedium,
      title: t('authShell.point3Title'),
      body: t('authShell.point3Body'),
    },
  ];

  return (
    <div className="min-h-screen glass-mesh-bg px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <GlassCard delay={0.05} className="flex min-h-[300px] flex-col justify-between gap-8 overflow-hidden !p-7 md:!p-8">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-300">
                <span className="h-2 w-2 rounded-full bg-helium-400 animate-pulse" />
                {t('common.brand')}
              </div>

              <LanguageToggle />
            </div>

            <div className="space-y-4">
              <h1 className="m-0 max-w-2xl text-4xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
                {t('authShell.heroTitle')}
              </h1>
              <p className="m-0 max-w-2xl text-base leading-7 text-slate-300">
                {t('authShell.heroBody')}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {productPoints.map((point) => {
              const Icon = point.icon;

              return (
                <div key={point.title} className="rounded-[28px] border border-white/[0.08] bg-black/10 p-4">
                  <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-helium-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-lg font-medium text-white">{point.title}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">{point.body}</div>
                </div>
              );
            })}
          </div>
        </GlassCard>

        <div className="flex items-center">
          <GlassCard delay={0.12} className="w-full overflow-hidden !p-7 md:!p-8">
            <div className="space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">{eyebrow}</div>
              <h2 className="m-0 text-3xl font-semibold tracking-[-0.04em] text-white">{title}</h2>
              <p className="m-0 text-sm leading-6 text-slate-400">{subtitle}</p>
            </div>

            <div className="mt-8">{children}</div>

            {footer ? (
              <div className="mt-6 border-t border-white/10 pt-4 text-sm text-slate-400">{footer}</div>
            ) : null}

            <div className="mt-6 text-xs leading-5 text-slate-500">
              {t('authShell.sessionNote')}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

export function AuthInput({ label, hint, error, ...props }) {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
      </div>
      <input
        {...props}
        className={`w-full rounded-2xl border bg-black/20 px-4 py-3 text-white placeholder:text-slate-500 transition focus:outline-none focus:ring-2 focus:ring-helium-500/30 ${
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
