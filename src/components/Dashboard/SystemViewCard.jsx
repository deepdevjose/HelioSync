import { useState } from 'react';
import { ChevronDown, ChevronUp, PanelTopOpen } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { useHelioStore } from '../../store/useHelioStore';
import SolarPanelCanvas from './SolarPanelCanvas';
import { getDashboardInsights } from './dashboardInsights';
import { useLocale } from '../../i18n/locale';

export default function SystemViewCard() {
  const { locale, t } = useLocale();
  const [expanded, setExpanded] = useState(true);
  const status = useHelioStore((state) => state.status);
  const data = useHelioStore((state) => state.data);
  const history = useHelioStore((state) => state.history);
  const userSetup = useHelioStore((state) => state.userSetup);
  const insights = getDashboardInsights(data, status, history, userSetup, locale, t);
  const alignmentPercent = Math.round(Math.max(0, Math.min(1, insights.outputState.ratio)) * 100);

  return (
    <GlassCard delay={0.1} className="flex h-full min-h-[400px] min-w-0 flex-col gap-5 overflow-hidden !p-5 sm:min-h-[460px] sm:!p-6 md:!p-7 lg:min-h-[520px]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400">{t('dashboard.systemView')}</span>
          <h2 className="m-0 text-[1.8rem] font-semibold tracking-[-0.03em] text-white sm:text-3xl">{t('dashboard.liveSolarBehavior')}</h2>
          <p className="m-0 max-w-2xl text-sm leading-6 text-slate-400">
            {t('dashboard.systemViewBody')}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-start">
          <div className="rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('dashboard.deviceState')}</div>
            <div className="mt-2 text-base font-medium text-white">{insights.deviceState.label}</div>
            <div className="mt-1 text-sm text-slate-400">{insights.deviceState.reason}</div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('dashboard.operatingContext')}</div>
            <div className="mt-2 text-base font-medium text-white">{insights.profileLabel} · {insights.connectivityModeLabel}</div>
            <div className="mt-1 text-sm text-slate-400">{insights.profileMessage}</div>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 sm:col-span-2 xl:w-fit"
          >
            <PanelTopOpen className="h-4 w-4" />
            <span>{expanded ? t('dashboard.hideSystemView') : t('dashboard.showSystemView')}</span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded ? (
        <>
          <div className="min-w-0">
            <SolarPanelCanvas />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('dashboard.solarAlignment')}</div>
              <div className="mt-2 text-lg font-medium text-white">{alignmentPercent}%</div>
              <div className="mt-1 text-sm text-slate-400">{insights.trackingLabel}</div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('dashboard.tiltTarget')}</div>
              <div className="mt-2 text-lg font-medium text-white">
                {data.panel.angle_measured_deg.toFixed(1)}° / {data.panel.angle_target_deg.toFixed(1)}°
              </div>
              <div className="mt-1 text-sm text-slate-400">{t('dashboard.measuredVsOptimal')}</div>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-black/10 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{t('dashboard.sunlightContext')}</div>
              <div className="mt-2 text-lg font-medium text-white">{insights.environment[0].meaning}</div>
              <div className="mt-1 text-sm text-slate-400">{insights.environment[0].value}</div>
            </div>
          </div>
        </>
      ) : (
          <div className="flex min-h-[180px] flex-1 items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-black/10 px-5 text-center text-sm leading-6 text-slate-400 sm:min-h-[220px] sm:rounded-[28px] sm:px-6">
            {t('dashboard.heroCollapsed')}
          </div>
        )}
    </GlassCard>
  );
}
